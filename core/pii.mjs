// Маскирование PII до слоя L2 (3.10): email, телефоны, URL, номера карт/IBAN-подобные, а также имена из явного списка.
// КАЛИБРОВОЧНАЯ ОГОВОРКА: NER для имён нет — имена маскируются только из списка knownNames, который задаёт клиницист.
// Остальные имена и адреса остаются в тексте: канал ⛔ и честно показывается в отчёте маскирования.
const RULES = Object.freeze([
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]'],
  ['url', /\bhttps?:\/\/[^\s<>"')]+/gi, '[URL]'],
  ['iban', /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '[IBAN]'],
  ['card', /\b(?:\d[ -]?){13,19}\b/g, '[CARD]'],
  ['phone', /(?<![\w:])\+?\d[\d\s().-]{8,}\d(?![\w:])/g, '[PHONE]']
]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Вход: текст и { knownNames: string[] }. Выход: { text, counts, names_unmasked: 'нет NER' }.
export function maskPii(text, options) {
  const o = options === undefined || options === null ? {} : options;
  const names = Array.isArray(o.knownNames) ? o.knownNames.filter((n) => typeof n === 'string' && n.trim().length >= 2) : [];
  const counts = {};
  let out = String(text === undefined || text === null ? '' : text);
  // Временны́е метки вида 10:02:33 телефоном не считаются: правило телефона требует ≥ 10 цифр подряд с разделителями.
  RULES.forEach(([id, re, tag]) => {
    let n = 0;
    out = out.replace(re, () => { n += 1; return tag; });
    counts[id] = n;
  });
  let nameCount = 0;
  names.forEach((name, i) => {
    const re = new RegExp(`(?<![\\p{L}])${escapeRe(name.trim())}(?![\\p{L}])`, 'giu');
    out = out.replace(re, () => { nameCount += 1; return `[ИМЯ${i + 1}]`; });
  });
  counts.names = nameCount;
  return Object.freeze({ text: out, counts: Object.freeze(counts), total: Object.values(counts).reduce((a, b) => a + b, 0), names_note: names.length ? `${names.length} имён из списка клинициста` : 'NER нет: имена не из списка не маскируются' });
}
