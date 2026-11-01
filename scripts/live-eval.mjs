// Живая оценка агентов L2/L3 моделью Claude БЕЗ HTTP-ключа: пакеты (промпт + транскрипт + результаты инструментов + схема) выдаются
// субагентам Claude Code, их JSON-ответы принимаются тем же рантаймом, что и в продукте (схема, дословные цитаты, бейджи, числа).
// Что измеряется: соблюдение контракта настоящей моделью с первой попытки. Что НЕ измеряется: клиническая верность (эталонной разметки нет),
// выбор инструментов (обязательные инструменты вызываются заранее), транспорт HTTP.
// Команды: step <tid> — прогон и выдача недостающих пакетов; report — сводка docs/live-eval/report.{json,md}.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REG, CARDS, makeToolbox } from '../fixtures/agents/golden.mjs';
import { L2Orchestrator, Router } from '../core/agents/orchestrator.mjs';
import { ModelError } from '../core/agents/modelClient.mjs';
import { Transcript } from '../core/transcript.mjs';
import { maskPii } from '../core/pii.mjs';
import { DEMO_TRANSCRIPT } from '../core/demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const TRANSCRIPTS = Object.freeze({ t1: { text: DEMO_TRANSCRIPT, names: [] }, t2: { text: readFileSync(`${root}fixtures/live/t2.txt`, 'utf8'), names: [] }, t3: { text: readFileSync(`${root}fixtures/live/t3.txt`, 'utf8'), names: [] } });
const SUBMIT = 'submit_result';
const dirOf = (tid) => `${root}eval/live/${tid}`;

class ReplayClient {
  constructor(tid, awaiting) { this.tid = tid; this.awaiting = awaiting; Object.freeze(this); }

  agentOf(req) {
    const all = [...String(req.system).matchAll(/\(([A-Za-z0-9]+)\)\./g)];
    return all.length ? all[all.length - 1][1] : '';
  }

  async complete(req) {
    const id = this.agentOf(req);
    const turn = req.messages.filter((m) => m.role === 'assistant').length;
    const tools = req.tools.filter((t) => t.name !== SUBMIT);
    const base = { usage: { input_tokens: 0, output_tokens: 0 } };
    const call = (name, input, n) => ({ type: 'tool_use', id: `u${n}`, name, input });
    if (tools.length && turn === 0) return { response: { ...base, content: tools.map((t, i) => call(t.name, {}, i)), stop_reason: 'tool_use' }, model: req.model, fallback: false };
    const submitTurn = tools.length ? 1 : 0;
    if (turn === submitTurn) {
      const file = `${dirOf(this.tid)}/${id}.json`;
      if (existsSync(file)) return { response: { ...base, content: [call(SUBMIT, JSON.parse(readFileSync(file, 'utf8')), 99)], stop_reason: 'tool_use' }, model: req.model, fallback: false };
      mkdirSync(`${dirOf(this.tid)}/packets`, { recursive: true });
      const last = req.messages[req.messages.length - 1];
      const results = Array.isArray(last.content) ? last.content.filter((b) => b.type === 'tool_result').map((b) => b.content).join('\n\n') : '';
      const schema = req.tools.find((t) => t.name === SUBMIT).input_schema;
      writeFileSync(`${dirOf(this.tid)}/packets/${id}.md`, `# Пакет агента ${id}\n\n## Системная инструкция\n\n${req.system}\n\n## Сообщение пользователя\n\n${req.messages[0].content}\n\n## Результаты обязательных инструментов (JSON)\n\n${results || '(инструментов нет)'}\n\n## Схема ответа (JSON Schema для submit_result)\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n`);
      this.awaiting.add(id);
      throw new ModelError('invalid_response', 'ожидает ответа модели (пакет записан)');
    }
    // Повторной попытки в замере нет: невалидный первый ответ считается невалидным (рантайм принимает мягко лишь якорные ошибки).
    return { response: { ...base, content: [{ type: 'text', text: '(повтор не предусмотрен замером)' }], stop_reason: 'end_turn' }, model: req.model, fallback: false };
  }
}

async function runTranscript(tid) {
  const t = TRANSCRIPTS[tid];
  const masked = maskPii(t.text, { knownNames: t.names });
  const lines = new Transcript(masked.text).lines;
  const awaiting = new Set();
  const orch = new L2Orchestrator({ client: new ReplayClient(tid, awaiting), toolbox: makeToolbox(), models: REG.models, cards: CARDS, prompts: REG.prompts }, { k: 1, concurrency: 4 });
  const base = { lines, focus: 'К.', mode: 'session', cascade: { A: 0.85, D: 0.78, C: 0.79, phi: 0.65, form: 'none' }, audio: undefined, selectedModel: 'claude-opus-5-5', overrides: undefined, l1Notes: 'просодика ⛔: нет аудио', effort: 'medium' };
  const plan = Router.plan({ mode: 'session', hasAudio: false });
  const results = new Map();
  await orch.runDomain(plan.agents, base, undefined, results);
  const synth = await orch.synthesize(base, results);
  return { masked, results, synth, judges: orch.judges(results), awaiting: [...awaiting] };
}

const slim = (r) => ({ id: r.id, status: r.status, kind: r.kind || '', reason: r.reason || '', first_pass: r.status === 'ok' && r.submit_attempts === 0, submit_attempts: r.submit_attempts, tools_called: (r.tools_called || []).map((c) => c.name), stats: r.stats, claims: (r.claims || []).map((c) => ({ id: c.id, badge: c.badge, flags: c.flags, anchors: c.evidence.filter((e) => e.ok).length, rejected: c.evidence.filter((e) => !e.ok).map((e) => e.reason) })), dropped: r.dropped || [], card_badge: r.card_badge });

async function main() {
  const [cmd, tid] = process.argv.slice(2);
  if (cmd === 'step') {
    const out = await runTranscript(tid);
    const all = [...out.results.values(), out.synth.reflector, out.synth.thera];
    all.forEach((r) => console.log(`${r.status === 'ok' ? '✓' : r.status === 'degraded' ? '~' : '✗'} ${r.id.padEnd(15)} ${r.status}${r.kind ? ` · ${r.kind}` : ''}${r.reason && r.status !== 'ok' ? ` · ${String(r.reason).slice(0, 110)}` : ''}`));
    console.log(`\nмаскирование: ${out.masked.total} замен ${JSON.stringify(out.masked.counts)}`);
    console.log(`ожидают ответа модели: ${out.awaiting.join(', ') || '—'}`);
    return;
  }
  if (cmd === 'report') {
    const rep = { generated: new Date().toISOString().slice(0, 10), method: 'субагенты Claude Code (алиас sonnet), один выстрел без повтора; HTTP-транспорт не использовался', transcripts: {} };
    for (const id of Object.keys(TRANSCRIPTS)) {
      const out = await runTranscript(id);
      if (out.awaiting.length) throw new Error(`${id}: нет ответов для ${out.awaiting.join(', ')}`);
      const jm = new Map(out.judges.map((j) => [j.agent, j]));
      rep.transcripts[id] = { pii: out.masked.counts, agents: [...out.results.values()].map((r) => ({ ...slim(r), judge: jm.get(r.id) && jm.get(r.id).status === 'ok' ? { overall: jm.get(r.id).overall.value, rubric: Object.fromEntries(Object.entries(jm.get(r.id).rubric).map(([k, v]) => [k, v.value])) } : undefined })), reflector: { status: out.synth.reflector.status, reason: out.synth.reflector.reason, verdicts: (out.synth.reflector.verdicts || []).map((v) => ({ badge: v.badge, flags: v.flags })), axes: (out.synth.reflector.axes || []).length, flags: out.synth.reflector.flags }, thera: { status: out.synth.thera.status, reason: out.synth.thera.reason, steps: (out.synth.thera.plan || []).length } };
    }
    mkdirSync(`${root}docs/live-eval`, { recursive: true });
    writeFileSync(`${root}docs/live-eval/report.json`, `${JSON.stringify(rep, null, 2)}\n`);
    console.log('docs/live-eval/report.json');
    return;
  }
  throw new Error('step <tid> | report');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
