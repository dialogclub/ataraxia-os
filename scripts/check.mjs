// Статический сканер (4.9, пп. 1–2): node --check, баланс скобок, запретные конструкции, сканер id.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = process.env.ATM_TMP === undefined ? join(root, '.check-tmp') : process.env.ATM_TMP;
if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });

function walk(dir, out) {
  readdirSync(dir).forEach((name) => {
    if (name === 'node_modules' || name === '.git' || name === '.check-tmp') return;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}

const files = walk(root, []);
const scripts = files.filter((f) => f.endsWith('.mjs'));
const htmls = files.filter((f) => f.endsWith('.html') && (f.includes('/ui/') || f.includes('/dist/')));
const problems = [];

// Удаление строк, шаблонов, комментариев и regex-литералов посимвольным сканером (для подсчёта скобок).
function stripLiterals(src) {
  let out = '';
  let i = 0;
  let lastSig = '';
  const regexAllowedAfter = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '']);
  const keywordBefore = /(?:return|typeof|instanceof|in|of|case|do|else|void|delete|throw|new|yield|await)$/;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (ch === '/' && next === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue; }
    if (ch === '"' || ch === "'") { const q = ch; i += 1; while (i < src.length && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') i += 1; i += 1; } i += 1; out += '""'; lastSig = '"'; continue; }
    if (ch === '`') {
      i += 1;
      let depth = 0;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (depth === 0 && src[i] === '`') break;
        if (src[i] === '$' && src[i + 1] === '{') { depth += 1; i += 2; continue; }
        if (depth > 0 && src[i] === '}') { depth -= 1; i += 1; continue; }
        i += 1;
      }
      i += 1; out += '``'; lastSig = '`'; continue;
    }
    if (ch === '/') {
      const tail = out.trimEnd();
      const prev = tail.slice(-1);
      const word = (tail.match(/[A-Za-z_$][\w$]*$/) || [''])[0];
      const isRegex = regexAllowedAfter.has(prev) || keywordBefore.test(word);
      if (isRegex) {
        i += 1;
        let inClass = false;
        while (i < src.length && src[i] !== '\n') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true; else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) break;
          i += 1;
        }
        i += 1;
        while (i < src.length && /[a-z]/.test(src[i])) i += 1;
        out += '/re/'; lastSig = '/'; continue;
      }
    }
    out += ch;
    if (!/\s/.test(ch)) lastSig = ch;
    i += 1;
  }
  return out;
}

function balance(src, name) {
  const s = stripLiterals(src);
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (const ch of s) {
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === ')' || ch === ']' || ch === '}') { if (stack.pop() !== ch) { problems.push(`${name}: дисбаланс скобок у «${ch}»`); return; } }
  }
  if (stack.length) problems.push(`${name}: незакрытые скобки (${stack.length})`);
}

const FORBIDDEN = [
  [/\balert\s*\(/, 'alert('], [/\bconfirm\s*\(/, 'confirm('], [/\bprompt\s*\(/, 'prompt('],
  [/\blocalStorage\b/, 'localStorage'], [/\bsessionStorage\b/, 'sessionStorage'], [/\beval\s*\(/, 'eval('],
  [/\*\*\s*-/, '** с унарным минусом'], [/\.click\s*\(\s*\)/, 'ref.click()']
];

function forbidden(src, name) {
  const s = stripLiterals(src);
  FORBIDDEN.forEach(([re, label]) => { if (re.test(s)) problems.push(`${name}: запретная конструкция ${label}`); });
}

function nodeCheck(src, name, idx) {
  const file = join(tmp, `chk-${idx}.mjs`);
  writeFileSync(file, src);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${name}: node --check\n${r.stderr.trim()}`);
}

let idx = 0;
scripts.forEach((f) => {
  const name = relative(root, f);
  const src = readFileSync(f, 'utf8');
  nodeCheck(src, name, idx += 1);
  balance(src, name);
  if (name.startsWith('ui/') || name.startsWith('core/')) forbidden(src, name);
});
htmls.forEach((f) => {
  const name = relative(root, f);
  const html = readFileSync(f, 'utf8');
  const blocks = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)).map((m) => m[1]).filter((b) => b.trim() !== '');
  blocks.forEach((b) => { nodeCheck(b, `${name}<script>`, idx += 1); balance(b, `${name}<script>`); forbidden(b, `${name}<script>`); });
  // Сканер id: каждый byId("…") в app.mjs существует в разметке (кроме динамических префиксов).
  if (name === 'ui/index.html') {
    const app = readFileSync(join(root, 'ui/app.mjs'), 'utf8');
    const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]));
    const used = Array.from(app.matchAll(/byId\(\s*'([^']+)'\s*\)/g)).map((m) => m[1]);
    const dynamic = /^(chip-|card-|page-|tab-|nav-|state-)/;
    const missing = used.filter((id) => !ids.has(id) && !dynamic.test(id));
    if (missing.length) problems.push(`ui/app.mjs: нет id в разметке: ${Array.from(new Set(missing)).join(', ')}`);
    console.log(`id-сканер: ${new Set(used).size} обращений, ${ids.size} id в разметке`);
  }
});
console.log(`проверено: ${scripts.length} модулей, ${htmls.length} html`);
if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
console.log('✓ node --check · баланс скобок · запретные конструкции · id-сканер — чисто');
