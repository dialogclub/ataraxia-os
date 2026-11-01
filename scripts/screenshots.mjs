// UI-харнесс (4.9, пп. 3–9): рендер во вьюпортах 440×956, 393×852, 1280×800; нет горизонтального скролла;
// таб-бар не перекрывает контент; Dynamic Island не перекрывает заголовок; состояния в DOM; кризис/гейт кликабельны;
// aria-live и reduced-motion; JSON round-trip; размер артефакта. Скриншоты — docs/screenshots/.
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORTS = [[440, 956, 'phone-max'], [393, 852, 'phone'], [1280, 800, 'studio']];

async function loadChromium() {
  const require = createRequire(import.meta.url);
  return require('playwright').chromium;
}

export async function audit(options) {
  const opts = options === undefined ? {} : options;
  const shots = opts.shots !== false;
  const dir = `${root}docs/screenshots`;
  if (shots && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const chromium = await loadChromium();
  const server = await serve(0);
  const port = server.address().port;
  let browser;
  const findings = [];
  const ok = (name, cond, detail) => findings.push({ name, ok: Boolean(cond), detail: detail === undefined ? '' : detail });
  try {
    browser = await chromium.launch();
    for (const [w, hgt, tag] of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${port}/ui/index.html`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => globalThis.__atm !== undefined, undefined, { timeout: 10000 });
      const check = async (label) => {
        const m = await page.evaluate(() => {
          window.scrollTo(0, 0);
          const de = document.documentElement;
          const island = document.querySelector('.island');
          const title = document.querySelector('.page[data-active="true"] .module-title');
          const ir = island ? island.getBoundingClientRect() : { bottom: 0 };
          const tr = title ? title.getBoundingClientRect() : { top: 9999 };
          const tab = document.querySelector('.tabbar');
          const tabVisible = tab && getComputedStyle(tab).display !== 'none';
          const main = document.querySelector('.main');
          const padBottom = parseFloat(getComputedStyle(main).paddingBottom);
          const tabH = tabVisible ? tab.getBoundingClientRect().height : 0;
          return { scrollW: de.scrollWidth, clientW: de.clientWidth, islandBottom: ir.bottom, titleTop: tr.top, tabVisible, padBottom, tabH };
        });
        ok(`${tag} ${label}: нет горизонтального скролла`, m.scrollW <= m.clientW + 1, `${m.scrollW} ≤ ${m.clientW}`);
        ok(`${tag} ${label}: Dynamic Island не перекрывает заголовок`, m.islandBottom <= m.titleTop + 0.5, `${Math.round(m.islandBottom)} ≤ ${Math.round(m.titleTop)}`);
        if (m.tabVisible) ok(`${tag} ${label}: таб-бар не перекрывает контент`, m.padBottom >= m.tabH, `padding ${m.padBottom} ≥ ${m.tabH}`);
        if (shots) await page.screenshot({ path: `${dir}/${tag}-${label}.png`, fullPage: false });
      };
      await check('home');
      // Состояния: каждая страница имеет узлы пусто/загрузка/ошибка/частично.
      const states = await page.evaluate(() => Array.from(document.querySelectorAll('.page')).map((p) => ({ id: p.id, has: ['empty', 'loading', 'error', 'partial'].every((s) => p.querySelector(`[data-state="${s}"]`) !== null) })));
      ok(`${tag}: состояния на каждом экране`, states.every((s) => s.has), states.filter((s) => !s.has).map((s) => s.id).join(', ') || `${states.length} экранов`);
      ok(`${tag}: aria-live на Dynamic Island`, await page.evaluate(() => document.querySelector('.island').getAttribute('aria-live') === 'polite'));
      ok(`${tag}: prefers-reduced-motion в CSS`, await page.evaluate(() => Array.from(document.styleSheets).some((s) => { try { return Array.from(s.cssRules).some((r) => r.media && r.media.mediaText.includes('prefers-reduced-motion')); } catch { return false; } })));
      // Запуск конвейера на демо-транскрипте: автопереход Анализ → Синтез, тост, частичность.
      await page.evaluate(() => { globalThis.__atm.app.go('launch'); document.getElementById('launch-transcript').value = globalThis.__atm.demo; });
      await check('launch');
      await page.evaluate(() => globalThis.__atm.app.launch());
      await page.waitForFunction(() => document.querySelector('.island').dataset.phase === 'done', undefined, { timeout: 10000 });
      ok(`${tag}: после завершения — экран «Синтез»`, await page.evaluate(() => globalThis.__atm.app.state.page === 'synthesis'));
      await check('synthesis');
      await page.evaluate(() => globalThis.__atm.app.go('analysis'));
      const cards = await page.evaluate(() => ({ n: document.querySelectorAll('#analysis-feed .card').length, green: document.querySelectorAll('#analysis-feed .card[data-badge="🟢"]').length, missing: document.querySelectorAll('#analysis-feed .card[data-badge="⛔"]').length, partial: !document.querySelector('#page-analysis [data-state="partial"]').hidden }));
      ok(`${tag}: лента анализа — карточки 🟢/🔵/⛔ и чип частичности`, cards.n > 0 && cards.green >= 5 && cards.missing >= 1 && cards.partial, `${cards.n} карточек · 🟢 ${cards.green} · ⛔ ${cards.missing}`);
      await check('analysis');
      // Без модели: агенты L2 — ⛔ с причиной, синтез — детерминированный отчёт (инвариант 7).
      const nomodel = await page.evaluate(() => ({ agentCards: Array.from(document.querySelectorAll('#analysis-feed .card')).filter((c) => /^L2 · (?!Router)/.test(c.querySelector('h3').textContent)).map((c) => c.dataset.badge), axes: document.querySelector('#synthesis-axes').textContent, hero: document.querySelector('#synthesis-hero .card h3').textContent }));
      ok(`${tag}: без модели — агенты L2 ⛔, синтез детерминированный`, nomodel.agentCards.length >= 10 && nomodel.agentCards.every((b) => b === '⛔') && nomodel.axes.includes('⛔') && nomodel.hero.includes('Детерминированный'), `${nomodel.agentCards.length} агентов ⛔`);
      // L2/L3 с тестовым двойником модели: проверяется КОНТРАКТ рантайма и интерфейса; живое качество модели не измеряется.
      await page.evaluate(async () => {
        const { GoldenClient } = await import('/fixtures/agents/goldenCore.mjs');
        const a = globalThis.__atm;
        a.setModelClient(new GoldenClient({ toolbox: a.l2.config.toolbox }));
        document.getElementById('launch-model').value = 'claude-opus-5-5';
        const key = document.getElementById('settings-apikey');
        key.value = 'sk-ant-test-SECRET-123';
        key.dispatchEvent(new Event('input'));
        document.getElementById('launch-transcript').value = a.demo;
        await a.app.launch();
      });
      const full = await page.evaluate(() => {
        const app = globalThis.__atm.app;
        const feed = document.getElementById('analysis-feed');
        const agentCards = Array.from(feed.querySelectorAll('.card')).filter((c) => /^L2 · (?!Router)/.test(c.querySelector('h3').textContent));
        const secret = 'sk-ant-test-SECRET-123';
        const scp = app.state.scp.data;
        return { agents: agentCards.length, live: agentCards.filter((c) => c.dataset.badge !== '⛔').length, claims: feed.querySelectorAll('.claim').length, quotes: feed.querySelectorAll('.claim .quote').length, strong: feed.querySelectorAll('.quote.strong').length,
          hero: document.querySelector('#synthesis-hero .card').dataset.badge, heroTitle: document.querySelector('#synthesis-hero .card h3').textContent, axes: document.querySelectorAll('#synthesis-axes .row').length, plan: document.querySelectorAll('#synthesis-plan .row').length,
          island: document.querySelector('.island').textContent, model: scp.meta.model, fallback: scp.meta.fallback, explicit: scp.request.explicit, l2frames: Object.keys((scp.frames && scp.frames.l2) || {}).length, unlocked: !document.getElementById('launch-run').disabled,
          leak: [app.exportText(), JSON.stringify(app.bus.history()), document.documentElement.outerHTML, JSON.stringify(scp)].some((t) => t.includes(secret)) };
      });
      ok(`${tag}: L2 — карточки агентов, утверждения с якорями, смещённая речь сильным голосом`, full.agents >= 10 && full.live === full.agents && full.claims >= 12 && full.quotes >= 8 && full.strong >= 1, `${full.live}/${full.agents} агентов · ${full.claims} утверждений · ${full.quotes} цитат · ${full.strong} ‼`);
      ok(`${tag}: L3 — герой синтеза, оси, план; модель в статусе, откат не помечен`, full.hero !== '⛔' && full.heroTitle.includes('Синтез') && full.axes >= 1 && full.plan >= 1 && full.island.includes('claude-opus-5-5') && full.model === 'claude-opus-5-5' && full.fallback === false, `${full.axes} осей · ${full.plan} шагов плана · ${full.island.slice(0, 60)}`);
      ok(`${tag}: SCP — запрос заполнен агентами, frames.l2 записаны, кнопка запуска разблокирована`, full.explicit.length > 0 && full.l2frames >= 10 && full.unlocked, `explicit «${full.explicit.slice(0, 30)}» · frames.l2 ${full.l2frames}`);
      ok(`${tag}: ключ API нигде не утекает (SCP, экспорт, журнал, DOM)`, full.leak === false);
      await check('synthesis-l2');
      await page.evaluate(() => globalThis.__atm.app.go('analysis'));
      await check('analysis-l2');
      await page.evaluate(() => globalThis.__atm.app.go('agents'));
      const runs = await page.evaluate(() => ({ rows: document.querySelectorAll('#agents-runs tbody tr').length, judged: Array.from(document.querySelectorAll('#agents-runs tbody tr')).filter((r) => /\d+ %/.test(r.lastElementChild.textContent)).length }));
      ok(`${tag}: «Агенты» — таблица прогона L2/L3 с оценкой Судьи`, runs.rows >= 15 && runs.judged >= 10, `${runs.rows} строк · Судья оценил ${runs.judged}`);
      await check('agents-runs');
      await page.evaluate(() => globalThis.__atm.app.go('analysis'));
      await page.locator('#card-agent-Veritas button:has-text("Повторить")').click();
      await page.waitForFunction(() => document.querySelector('.island').textContent.includes('повторено'), undefined, { timeout: 10000 });
      const again = await page.evaluate(() => { const app = globalThis.__atm.app; return { card: document.getElementById('card-agent-Veritas') !== null, dup: app.state.scp.data.evidence.filter((e) => e.claim_id === 'Veritas.c1').length, stale: app.state.stale, others: document.querySelectorAll('#analysis-feed .card').length }; });
      ok(`${tag}: повтор одного агента — карточка на месте, якоря не задваиваются, синтез помечен устаревшим`, again.card && again.dup === 1 && again.stale === true && again.others > 10, `Veritas.c1 в evidence ×${again.dup}`);
      // Отказ API: инструменты L1 дают отчёт 🟢/⛔, кнопка запуска не залипает.
      await page.evaluate(async () => {
        const { ScriptedClient } = await import('/core/agents/modelClient.mjs');
        const a = globalThis.__atm;
        a.setModelClient(new ScriptedClient(Array.from({ length: 80 }, () => () => ({ error: { kind: 'auth', message: '401' } }))));
        await a.app.launch();
      });
      const down = await page.evaluate(() => ({ cards: Array.from(document.querySelectorAll('#analysis-feed .card')).filter((c) => /^L2 · (?!Router)/.test(c.querySelector('h3').textContent)).map((c) => c.dataset.badge + '|' + c.textContent.includes('Claude API')), green: document.querySelectorAll('#analysis-feed .card[data-badge="🟢"]').length, hero: document.querySelector('#synthesis-hero .card h3').textContent, unlocked: !document.getElementById('launch-run').disabled, toast: document.querySelector('.island').textContent }));
      ok(`${tag}: отказ API — агенты ⛔ с причиной, L1 🟢 сохранены, синтез детерминированный, запуск разблокирован`, down.cards.length >= 10 && down.cards.every((c) => c.startsWith('⛔|')) && down.cards.filter((c) => c === '⛔|true').length >= 4 && down.green >= 5 && down.hero.includes('Детерминированный') && down.unlocked, `${down.cards.length} агентов ⛔ (с причиной «Claude API»: ${down.cards.filter((c) => c === '⛔|true').length}) · L1 🟢 ${down.green}`);
      await check('analysis-api-down');
      await page.evaluate(() => { const a = globalThis.__atm; a.setModelClient(undefined); document.getElementById('launch-model').value = ''; });
      await page.evaluate(() => globalThis.__atm.app.go('profile', 'cascade'));
      await check('profile-cascade');
      await page.evaluate(() => globalThis.__atm.app.go('practice'));
      const gate = await page.evaluate(() => { const el = document.querySelector('[data-gate-panel]'); const stop = document.getElementById('practice-stop'); const r = stop.getBoundingClientRect(); return { present: el !== null, clickable: r.width >= 44 && r.height >= 44 && !stop.disabled }; });
      ok(`${tag}: панель гейта присутствует и стоп кликабелен`, gate.present && gate.clickable);
      await page.locator('#practice-stop').click();
      ok(`${tag}: аварийный стоп сработал`, await page.evaluate(() => /стоп:/.test(document.getElementById('practice-session').textContent)));
      await check('practice');
      await page.evaluate(() => globalThis.__atm.app.go('clinic'));
      const crisis = await page.evaluate(() => { const b = document.querySelector('[data-crisis-button]'); const r = b.getBoundingClientRect(); return b !== null && r.width >= 44 && r.height >= 44 && r.top < window.innerHeight; });
      ok(`${tag}: кризисная кнопка на экране и кликабельна`, crisis);
      await page.locator('#clinic-crisis').click();
      ok(`${tag}: кризисный лист открылся`, await page.evaluate(() => document.querySelector('.sheet') !== null));
      await page.keyboard.press('Escape');
      await check('clinic');
      await page.evaluate(() => globalThis.__atm.app.go('agents'));
      await check('agents');
      // Речь: синтетический тон через тестовый крючок → спектрограмма, F0 ≈ 150 Гц; VAAL/ЛЕКСИС по транскрипту.
      await page.evaluate(() => { const sr = 44100; const pcm = new Float32Array(sr * 2); for (let i = 0; i < pcm.length; i += 1) pcm[i] = 0.5 * Math.sin((2 * Math.PI * 150 * i) / sr); globalThis.__atm.loadPcm(pcm, sr, 'tone150-test'); });
      const speech = await page.evaluate(() => ({ page: globalThis.__atm.app.state.page, canvas: document.querySelectorAll('#speech-prosody canvas').length, f0: globalThis.__atm.app.state.prosody.f0.mean.value, vaal: document.querySelectorAll('#speech-vaal .vaal-list .bar').length, heat: document.querySelector('#speech-lexis .heat24') !== null }));
      ok(`${tag}: «Речь» — спектрограмма и RMS нарисованы, F0 ≈ 150 Гц, 25 шкал VAAL, тепловая карта`, speech.page === 'speech' && speech.canvas === 2 && Math.abs(speech.f0 - 150) < 1 && speech.vaal === 25 && speech.heat, `F0=${speech.f0.toFixed(2)} · canvas=${speech.canvas} · шкал=${speech.vaal}`);
      await check('speech');
      // Тесты: PHQ-9 заполняется, считается, item9 > 0 поднимает кризисный флаг.
      await page.evaluate(() => { globalThis.__atm.app.state.testsTab = 'phq9'; globalThis.__atm.app.go('tests'); });
      for (let i = 0; i < 9; i += 1) await page.locator(`label:has(input[name="PHQ9-${i}"][value="1"])`).click();
      await page.locator('#tests-content .btn').first().click();
      const tests = await page.evaluate(() => ({ svg: document.querySelectorAll('#tests-content svg').length, total: globalThis.__atm.app.state.scales.PHQ9 ? globalThis.__atm.app.state.scales.PHQ9.total.value : null, crisis: document.querySelector('#tests-content .state.error') !== null }));
      ok(`${tag}: «Тесты» — PHQ-9 = 9, светофор, кризисный флаг по пункту 9`, tests.svg >= 1 && tests.total === 9 && tests.crisis, `total=${tests.total}`);
      await check('tests');
      await page.evaluate(() => globalThis.__atm.app.go('memory'));
      await page.fill('#memory-query', 'выгорание, нет смысла');
      ok(`${tag}: память — C002 первым`, await page.evaluate(() => { const first = document.querySelector('#memory-results .card h3'); return first !== null && first.textContent.startsWith('C002'); }));
      await check('memory');
      ok(`${tag}: JSON round-trip`, await page.evaluate(() => globalThis.__atm.app.roundTrip()));
      ok(`${tag}: без ошибок в консоли`, errors.length === 0, errors.slice(0, 3).join(' | '));
      await page.close();
      // Галерея компонентов
      const g = await browser.newPage({ viewport: { width: w, height: hgt } });
      const gErrors = [];
      g.on('pageerror', (e) => gErrors.push(e.message));
      await g.goto(`http://127.0.0.1:${port}/ui/gallery.html`, { waitUntil: 'networkidle' });
      const gm = await g.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, cells: document.querySelectorAll('.cell').length, viz: document.querySelectorAll('.viz, .viz-empty').length }));
      ok(`${tag} gallery: рендер без горизонтального скролла`, gm.scrollW <= gm.clientW + 1 && gm.cells > 30, `${gm.cells} ячеек · ${gm.viz} визуализаций`);
      ok(`${tag} gallery: без ошибок`, gErrors.length === 0, gErrors.slice(0, 2).join(' | '));
      if (shots) await g.screenshot({ path: `${dir}/${tag}-gallery.png`, fullPage: true });
      await g.close();
    }
    const dist = `${root}dist/atmaraksi-os.html`;
    if (existsSync(dist)) {
      const size = statSync(dist).size;
      ok('single-file ≤ 1,5 МБ', size <= 1.5 * 1024 * 1024, `${(size / 1024).toFixed(0)} КБ`);
      const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const t0 = Date.now();
      await page.goto(pathToFileURL(dist).href, { waitUntil: 'load' });
      await page.waitForFunction(() => globalThis.__atm !== undefined, undefined, { timeout: 10000 });
      ok('single-file: запускается офлайн (file://)', errors.length === 0, `${Date.now() - t0} мс до первого экрана · ${errors.slice(0, 2).join(' | ')}`);
      if (shots) await page.screenshot({ path: `${dir}/single-file-home.png` });
      await page.close();
    } else {
      ok('single-file собран', false, 'dist/atmaraksi-os.html отсутствует — npm run build');
    }
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = await audit({ shots: true });
  findings.forEach((f) => console.log(`${f.ok ? '✓' : '✗'} ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
  const bad = findings.filter((f) => !f.ok).length;
  console.log(`\nUI-харнесс: ${findings.length - bad} ✓ · ${bad} ✗`);
  process.exit(bad === 0 ? 0 : 1);
}
