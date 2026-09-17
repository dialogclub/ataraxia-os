// Сборка single-file артефакта: ui/index.html + tokens.css + модули (ESM → IIFE-пространства) + данные реестров.
// Требования к модулям: import { a, b } from './x.mjs'; export class|function|const. Без import.meta и динамических import().
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = resolve(root, 'ui/app.mjs');
const order = [];
const seen = new Set();
const sources = new Map();

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const deps = [];
  const re = /^import\s+\{([^}]+)\}\s+from\s+'([^']+)';?\s*$/gm;
  let m;
  while ((m = re.exec(src)) !== null) deps.push({ names: m[1].split(',').map((s) => s.trim()).filter(Boolean), file: resolve(dirname(file), m[2]) });
  deps.forEach((d) => visit(d.file));
  sources.set(file, { src, deps });
  order.push(file);
}
visit(entry);

const idOf = (file) => `__m_${relative(root, file).replace(/[^A-Za-z0-9]/g, '_')}`;
const modules = order.map((file) => {
  const { src, deps } = sources.get(file);
  const exportsList = [];
  let body = src.replace(/^import\s+\{[^}]+\}\s+from\s+'[^']+';?\s*$/gm, '');
  body = body.replace(/^export\s+(class|function|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => { exportsList.push(name); return `${kind} ${name}`; });
  body = body.replace(/^export\s+\{([^}]+)\};?\s*$/gm, (_, names) => { names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => exportsList.push(n)); return ''; });
  if (/import\.meta|import\(/.test(body)) throw new Error(`${relative(root, file)}: import.meta / динамический import не поддерживаются в single-file`);
  const head = deps.map((d) => `const { ${d.names.join(', ')} } = ${idOf(d.file)};`).join('\n');
  return `// ---- ${relative(root, file)} ----\nconst ${idOf(file)} = (() => {\n${head}\n${body}\nreturn { ${Array.from(new Set(exportsList)).join(', ')} };\n})();`;
});

const dataFiles = ['registry/agents.registry.json', 'registry/tools.registry.json', 'registry/parameters.registry.json', 'registry/models.registry.json', 'registry/frames.registry.json', 'harness/report.json', 'fixtures/memory.cases.json']
  .concat(readdirSync(resolve(root, 'ui/i18n')).map((f) => `ui/i18n/${f}`));
const data = {};
dataFiles.forEach((f) => { if (existsSync(resolve(root, f))) data[f] = JSON.parse(readFileSync(resolve(root, f), 'utf8')); });

let html = readFileSync(resolve(root, 'ui/index.html'), 'utf8');
const css = readFileSync(resolve(root, 'ui/tokens.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="tokens.css">', `<style>\n${css}\n</style>`);
const script = `<script>\nwindow.__ATM_DATA = ${JSON.stringify(data).replace(/<\//g, '<\\/')};\n</script>\n<script>\n(() => {\n${modules.join('\n\n').replace(/<\//g, '<\\/')}\n})();\n</script>`;
html = html.replace('<script type="module" src="app.mjs"></script>', script);
html = html.replace('onClick: () => window.open(\'gallery.html\', \'_blank\')', 'onClick: () => window.open(\'gallery.html\', \'_blank\')');
if (!existsSync(resolve(root, 'dist'))) mkdirSync(resolve(root, 'dist'));
writeFileSync(resolve(root, 'dist/atmaraksi-os.html'), html);
console.log(`dist/atmaraksi-os.html · ${(html.length / 1024).toFixed(0)} КБ · ${order.length} модулей · ${Object.keys(data).length} файлов данных`);
