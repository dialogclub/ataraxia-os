// Проверка якорей и «честности чисел» для утверждений агентов L2/L3. Всё детерминировано; LLM здесь не участвует.
//  · цитата считается подтверждённой, только если дословно (с точностью до регистра/пробелов/кавычек) есть в реплике
//    этого спикера с этим таймкодом; многоточие «…» разделяет фрагменты, идущие по порядку;
//  · замер — только путь к конечному Param из реально вызванного инструмента;
//  · бейдж назначает рантайм по политике карточки агента, а не модель: with_measure → бейдж замера (🟢/🔵),
//    with_quote → 🟡, иначе 🔵 (Приложение B);
//  · числа в тексте утверждения обязаны происходить из инструментов, транскрипта или вышестоящих утверждений.

export const BADGE_RANK = Object.freeze({ '⛔': 0, '🔵': 1, '🟡': 2, '🟢': 3 });

export function weakest(badges) {
  const list = badges.filter((b) => BADGE_RANK[b] !== undefined);
  return list.length ? list.reduce((a, b) => (BADGE_RANK[a] <= BADGE_RANK[b] ? a : b)) : '⛔';
}

export function strongest(badges) {
  const list = badges.filter((b) => BADGE_RANK[b] !== undefined);
  return list.length ? list.reduce((a, b) => (BADGE_RANK[a] >= BADGE_RANK[b] ? a : b)) : '⛔';
}

export function normText(s) {
  return String(s === undefined || s === null ? '' : s).toLowerCase().replace(/[«»"“”„‟'’`]/g, '').replace(/\s+/g, ' ').trim();
}

function fragments(quote) {
  return String(quote).split(/…|\.\.\./u).map((f) => normText(f)).filter((f) => f.length > 0);
}

// lines: [{ n, t, speaker, text }]. Возвращает { ok, reason }.
export function verifyQuote(ev, lines) {
  const quote = typeof ev.quote === 'string' ? ev.quote : '';
  const frags = fragments(quote);
  if (frags.length === 0 || !frags.some((f) => f.length >= 3) || frags.join('').length < 4) return { ok: false, reason: 'цитата пуста или слишком короткая' };
  const candidates = lines.filter((l) => l.t === ev.t && l.speaker === ev.speaker);
  if (candidates.length === 0) return { ok: false, reason: `нет реплики спикера «${ev.speaker}» с таймкодом ${ev.t}` };
  for (const line of candidates) {
    const body = normText(line.text);
    let from = 0;
    let all = true;
    for (const f of frags) { const at = body.indexOf(f, from); if (at < 0) { all = false; break; } from = at + f.length; }
    if (all) return { ok: true, reason: '' };
  }
  return { ok: false, reason: `цитата не найдена дословно в реплике ${ev.speaker} ${ev.t}` };
}

// Путь вида «pronouns.i» или «scales[3].value» внутри сырого вывода инструмента.
export function resolvePath(obj, path) {
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter((p) => p !== '');
  let cur = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

// toolOutputs: Map имя → сырой вывод последнего вызова. Возвращает { ok, badge, reason }.
export function verifyMeasure(ev, toolOutputs) {
  if (!toolOutputs.has(ev.tool)) return { ok: false, badge: '⛔', reason: `инструмент ${ev.tool} в этом прогоне не вызывался` };
  const node = resolvePath(toolOutputs.get(ev.tool), ev.path);
  if (node === undefined) return { ok: false, badge: '⛔', reason: `путь ${ev.tool}.${ev.path} не найден` };
  if (typeof node === 'number' && Number.isFinite(node)) return { ok: true, badge: '🟢', reason: '' };
  if (node !== null && typeof node === 'object' && typeof node.value === 'number' && Number.isFinite(node.value) && BADGE_RANK[node.badge] > 0) return { ok: true, badge: node.badge, reason: '' };
  if (typeof node === 'string' && node !== '') return { ok: true, badge: '🟢', reason: '' };
  return { ok: false, badge: '⛔', reason: `${ev.tool}.${ev.path} без значения (⛔)` };
}

// Единая проверка одного якоря. claimBadges: Map id утверждения → бейдж (для ссылок на вышестоящие утверждения).
export function verifyEvidence(ev, ctx) {
  if (ev.type === 'quote') {
    const r = verifyQuote(ev, ctx.lines);
    return { ...r, badge: r.ok ? '🟡' : '⛔' };
  }
  if (ev.type === 'measure') return verifyMeasure(ev, ctx.toolOutputs);
  if (ev.type === 'claim') {
    const b = ctx.claimBadges.get(ev.ref);
    return b === undefined ? { ok: false, badge: '⛔', reason: `утверждение ${ev.ref} не найдено` } : { ok: true, badge: BADGE_RANK[b] > BADGE_RANK['🟡'] ? '🟡' : b, reason: '' };
  }
  return { ok: false, badge: '⛔', reason: `неизвестный тип якоря ${ev.type}` };
}

// Политика бейджа из карточки агента: замер → бейдж замера; цитата или ссылка → 🟡; иначе 🔵.
export function claimBadge(results, policy) {
  const ok = results.filter((r) => r.ok);
  const p = policy === undefined ? { with_quote: '🟡', with_measure: '🟢', none: '🔵' } : policy;
  const measures = ok.filter((r) => r.kind === 'measure');
  if (measures.length) return measures.some((m) => m.badge === '🟢') ? p.with_measure : weakest(measures.map((m) => m.badge));
  if (ok.some((r) => r.kind === 'quote')) return p.with_quote;
  const refs = ok.filter((r) => r.kind === 'claim');
  if (refs.length) { const w = weakest(refs.map((r) => r.badge)); return BADGE_RANK[w] >= BADGE_RANK['🟡'] ? p.with_quote : w; }
  return p.none;
}

// --- Честность чисел ---
export function numberTokens(text) {
  // Идентификаторы вида «ЦЗИ-8», «PHQ-9», «K2», «F0» числами не считаются: цифра сразу после буквы или «буква-».
  return (String(text).match(/(?<![\p{L}\p{N}_.,])(?<!\p{L}-)\d+(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu) || []).map((s) => String(Number(s.replace(',', '.'))));
}

function collect(node, set, depth) {
  if (depth > 8 || node === null || node === undefined) return;
  if (typeof node === 'number' && Number.isFinite(node)) {
    for (let k = 0; k <= 3; k += 1) set.add(String(Number(node.toFixed(k))));
    if (node > 0 && node <= 1) for (let k = 0; k <= 1; k += 1) set.add(String(Number((node * 100).toFixed(k))));
    return;
  }
  if (Array.isArray(node)) { if (node.length <= 64) node.forEach((x) => collect(x, set, depth + 1)); return; }
  if (typeof node === 'object') {
    Object.keys(node).forEach((k) => { if (k !== 'range' && k !== 'track' && k !== 'data') collect(node[k], set, depth + 1); });
    return;
  }
  if (typeof node === 'string') numberTokens(node).forEach((n) => set.add(n));
}

export function allowedNumbers(toolOutputs, lines, extraTexts) {
  const set = new Set();
  toolOutputs.forEach((out) => collect(out, set, 0));
  lines.forEach((l) => { numberTokens(l.text).forEach((n) => set.add(n)); numberTokens(l.t).forEach((n) => set.add(n)); });
  (extraTexts === undefined ? [] : extraTexts).forEach((t) => numberTokens(t).forEach((n) => set.add(n)));
  return set;
}

// Возвращает числа из текста, которых нет среди допустимых (кроме 1–2: счёт «один/два» в словах не ловим).
export function unsupportedNumbers(text, allowed) {
  return numberTokens(text).filter((n) => !allowed.has(n));
}
