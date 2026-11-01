// Проверки L3: Синтез-рефлектор (k выборок + консенсус) и Тера-навигатор. Двойник модели проверяет контракт:
// ссылки на существующие утверждения, бейдж = слабейшая ссылка, числа только из утверждений, консенсус, отказ без API.
import { Harness, assert } from './Harness.mjs';
import { GOLDEN, BASE, GoldenClient, makeOrchestrator, DOMAIN_ORDER, toolUse } from '../fixtures/agents/golden.mjs';
import { ModelError } from '../core/agents/modelClient.mjs';

const step = (req, payload) => ({ content: [toolUse('s1', 'submit_result', payload)], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, model: req.model });

async function synth(overrides, k) {
  const gc = new GoldenClient({ overrides });
  const { orch } = makeOrchestrator(gc, { k });
  const res = await orch.runDomain(DOMAIN_ORDER, BASE);
  const out = await orch.synthesize(BASE, res);
  return { ...out, gc, res, orch };
}

export function reflectorChecks() {
  return [
    Harness.custom('golden k=3: вердикты и оси, бейдж = слабейшая ссылка, 3 из 3 голосов', async () => {
      const { reflector } = await synth({}, 3);
      assert(reflector.status === 'ok', `${reflector.status}: ${reflector.reason}`);
      assert(reflector.k === 3 && reflector.k_ok === 3 && reflector.unstable === 0, `k=${reflector.k} ok=${reflector.k_ok} нестабильных ${reflector.unstable}`);
      const byId = Object.fromEntries(reflector.verdicts.map((v) => [v.id, v]));
      assert(byId.v1.badge === '🟡' && byId.v2.badge === '🟡', `вердикты ${byId.v1.badge}${byId.v2.badge}`);
      assert(reflector.verdicts.every((v) => v.votes === 3 && v.of === 3), 'голоса не 3/3');
      const ax = Object.fromEntries(reflector.axes.map((a) => [a.axis, a.badge]));
      assert(ax['сознание'] === '🟡' && ax['социальное поле'] === '🟡' && ax['нарратив'] === '🔵', `оси ${JSON.stringify(ax)}`);
      return `вердикты ${reflector.verdicts.map((v) => v.badge).join('')} · оси ${reflector.axes.map((a) => a.badge).join('')}`;
    }),
    Harness.custom('консенсус: вердикт из одной выборки — 🔵 «нестабильно», устойчивые сохраняются', async () => {
      let n = 0;
      const odd = (req, turn) => {
        if (turn === 0) n += 1;
        if (n !== 3) return undefined;
        const p = JSON.parse(JSON.stringify(GOLDEN.Reflector.payload()));
        p.verdicts[1].claim_refs = ['Berne.c1'];
        return step(req, p);
      };
      const { reflector } = await synth({ Reflector: odd }, 3);
      assert(reflector.status === 'ok', reflector.reason);
      const un = reflector.verdicts.filter((v) => v.flags.includes('unstable_k'));
      assert(un.length === 1 && un[0].badge === '🔵' && un[0].votes === 1 && un[0].of === 3, `нестабильных ${un.length}`);
      assert(reflector.verdicts.filter((v) => !v.flags.includes('unstable_k')).every((v) => v.votes >= 2), 'устойчивый вердикт без большинства');
      return `устойчивых ${reflector.verdicts.length - un.length}, нестабильных ${un.length} (${un[0].votes} из ${un[0].of})`;
    }),
    Harness.custom('ссылка на несуществующее утверждение отклоняется', async () => {
      const ghost = (req) => { const p = JSON.parse(JSON.stringify(GOLDEN.Reflector.payload())); p.verdicts[0].claim_refs = ['Ghost.c9']; return step(req, p); };
      const { reflector } = await synth({ Reflector: ghost }, 1);
      assert(reflector.status === 'failed' && /не найдена/.test(reflector.reason), `${reflector.status}: ${reflector.reason}`);
      return reflector.reason.slice(0, 90);
    }),
    Harness.custom('число в тексте вердикта вне утверждений понижает бейдж до 🔵', async () => {
      const num = (req) => { const p = JSON.parse(JSON.stringify(GOLDEN.Reflector.payload())); p.verdicts[0].text = 'Это повторялось 42 раза у участника.'; return step(req, p); };
      const { reflector } = await synth({ Reflector: num }, 1);
      assert(reflector.status === 'ok', reflector.reason);
      const v = reflector.verdicts.find((x) => x.id === 'v1');
      assert(v.badge === '🔵' && v.flags.includes('unsupported_number'), `${v.badge} ${v.flags}`);
      return `v1: ${v.badge} ${v.flags}`;
    }),
    Harness.custom('нет утверждений → синтез пропущен, модель не вызывается', async () => {
      const gc = new GoldenClient();
      const { orch } = makeOrchestrator(gc, { k: 3 });
      const out = await orch.synthesize(BASE, new Map());
      assert(out.reflector.status === 'skipped' && out.thera.status === 'skipped', 'ожидался skipped');
      assert(gc.calls.length === 0, `вызовов модели ${gc.calls.length}`);
      return 'skipped ×2, вызовов 0';
    }),
    Harness.custom('нет API (auth) на синтезе: одна попытка, без повторов выборок', async () => {
      const dead = () => { throw new ModelError('auth', 'x-api-key неверен', { status: 401 }); };
      const { reflector } = await synth({ Reflector: dead }, 3);
      assert(reflector.status === 'failed' && reflector.kind === 'auth', `${reflector.status}/${reflector.kind}`);
      assert(reflector.calls === 1, `вызовов ${reflector.calls}`);
      return 'failed/auth, 1 вызов вместо 3';
    }),
    Harness.custom('k=1: один вызов, нестабильных нет', async () => {
      const { reflector, gc } = await synth({}, 1);
      assert(reflector.status === 'ok' && reflector.unstable === 0, 'k=1');
      assert(gc.calls.filter((c) => c.id === 'Reflector').length === 1, 'вызовов Reflector ≠ 1');
      return 'k=1 → 1 вызов';
    })
  ];
}

export function theraChecks() {
  return [
    Harness.custom('golden: план со ссылками, бейдж = слабейшая ссылка, вопрос для встречи', async () => {
      const { thera } = await synth({}, 1);
      assert(thera.status === 'ok', `${thera.status}: ${thera.reason}`);
      assert(thera.plan.length === 2 && thera.plan.every((p) => p.badge === '🟡'), `план ${thera.plan.map((p) => p.badge)}`);
      assert(thera.plan.every((p) => ['analysis', 'profile'].includes(p.module)), 'модули вне ожидаемых');
      assert(typeof thera.next_question === 'string' && thera.next_question.length > 0, 'нет вопроса');
      return `${thera.plan.length} шага · модули ${thera.plan.map((p) => p.module).join(', ')}`;
    }),
    Harness.custom('ссылка на несуществующее утверждение отклоняется', async () => {
      const ghost = (req) => { const p = JSON.parse(JSON.stringify(GOLDEN.TheraNavigator.payload())); p.plan[0].claim_refs = ['Ghost.c1']; return step(req, p); };
      const { thera } = await synth({ TheraNavigator: ghost }, 1);
      assert(thera.status === 'failed' && /не найдена/.test(thera.reason), `${thera.status}: ${thera.reason}`);
      return thera.reason.slice(0, 80);
    }),
    Harness.custom('модуль вне перечня отклоняется схемой', async () => {
      const bad = (req) => { const p = JSON.parse(JSON.stringify(GOLDEN.TheraNavigator.payload())); p.plan[0].module = 'admin'; return step(req, p); };
      const { thera } = await synth({ TheraNavigator: bad }, 1);
      assert(thera.status === 'failed' && /схема/.test(thera.reason), `${thera.status}: ${thera.reason}`);
      return thera.reason.slice(0, 80);
    }),
    Harness.custom('выдуманное число в шаге плана понижает бейдж', async () => {
      const num = (req) => { const p = JSON.parse(JSON.stringify(GOLDEN.TheraNavigator.payload())); p.plan[0].step = 'Провести 42 сессии по этой теме'; return step(req, p); };
      const { thera } = await synth({ TheraNavigator: num }, 1);
      assert(thera.status === 'ok' && thera.plan[0].badge === '🔵' && thera.plan[0].flags.includes('unsupported_number'), `${thera.plan[0].badge} ${thera.plan[0].flags}`);
      return `${thera.plan[0].badge} ${thera.plan[0].flags}`;
    })
  ];
}
