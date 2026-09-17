// Базовые помощники компонентов: создание DOM/SVG, форматирование Param по правилам 4.1.
// Компоненты ничего не вычисляют сверх нормализации к экрану (Приложение E).
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  const a = attrs === undefined || attrs === null ? {} : attrs;
  Object.keys(a).forEach((k) => {
    if (k === 'class') el.className = a[k];
    else if (k === 'text') el.textContent = a[k];
    else if (k.startsWith('on') && typeof a[k] === 'function') el.addEventListener(k.slice(2).toLowerCase(), a[k]);
    else if (k === 'dataset') Object.keys(a[k]).forEach((d) => { el.dataset[d] = a[k][d]; });
    else if (a[k] !== undefined && a[k] !== null && a[k] !== false) el.setAttribute(k, a[k] === true ? '' : a[k]);
  });
  children.flat().forEach((c) => {
    if (c === undefined || c === null || c === false) return;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  const a = attrs === undefined ? {} : attrs;
  Object.keys(a).forEach((k) => { if (k === 'text') el.textContent = a[k]; else el.setAttribute(k, a[k]); });
  children.flat().forEach((c) => { if (c) el.append(c); });
  return el;
}

// Param-подобный объект присутствует, если value — конечное число.
export function present(p) {
  return p !== undefined && p !== null && typeof p.value === 'number' && Number.isFinite(p.value);
}

// Форматтер: индексы — 2 знака; баллы/проценты — целые; ⛔ — текст, не число.
export function fmt(p, kind) {
  if (!present(p)) return '⛔';
  if (kind === 'score' || kind === 'percent' || kind === 'count') return String(Math.round(p.value));
  if (kind === 'freq' || kind === 'duration') return p.value >= 100 ? String(Math.round(p.value)) : p.value.toFixed(1);
  return p.value.toFixed(2);
}

// Нормализация к экрану [0, 1] по диапазону параметра; NaN → 0.
export function norm(p) {
  if (!present(p) || !Array.isArray(p.range) || p.range[1] === p.range[0]) return 0;
  return Math.min(1, Math.max(0, (p.value - p.range[0]) / (p.range[1] - p.range[0])));
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function emptyViz(text) {
  return h('div', { class: 'viz-empty', role: 'img', 'aria-label': text }, '⛔ ', text);
}
