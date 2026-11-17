#!/usr/bin/env node
/*
 * Kapsamlı mobil QA testi (Playwright, Pixel 7 + 360 px genişlik).
 * GitHub Pages alt yolunu taklit eder: klasörü /zay-fla/ altında kendi içindeki sunucuyla sunar.
 *   node tests/qa.js [ekran-görüntüsü-klasörü]
 */
'use strict';
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv[2] || path.join(os.tmpdir(), 'zayifla-qa');
fs.mkdirSync(SHOTS, { recursive: true });
const SUB = '/zay-fla/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      if (!u.startsWith(SUB)) { rsp.writeHead(404); return rsp.end('not found'); }
      let f = path.join(ROOT, u.slice(SUB.length));
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      if (u.endsWith('/')) f = path.join(f, 'index.html');
      fs.readFile(f, (err, buf) => {
        if (err) { rsp.writeHead(404); return rsp.end('not found'); }
        rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        rsp.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const pad = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };

let ok = true, nPass = 0, nFail = 0;
const errors = [];
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (cond) nPass++; else { nFail++; ok = false; } }

(async () => {
  const srv = await serve();
  const BASE = 'http://127.0.0.1:' + srv.address().port + SUB;
  // headless-shell bildirimleri her zaman reddeder; varsa tam Chromium kullan
  const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());

  async function newCtx(extra) {
    const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7'], { locale: 'tr-TR', timezoneId: 'Europe/Istanbul', permissions: ['notifications'] }, extra || {}));
    await ctx.grantPermissions(['notifications'], { origin: BASE.replace(SUB, '') });
    return ctx;
  }
  function watch(page, tag) {
    page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag} console] ${m.text()}`); });
    page.on('pageerror', e => errors.push(`[${tag} pageerror] ${e.message}`));
    page.on('response', r => { if (r.status() >= 400 && !/__reminders/.test(r.url())) errors.push(`[${tag} http ${r.status()}] ${r.url()}`); });
  }
  // UI denetimi: NaN/undefined/Infinity, taşma, kesilen metin
  async function audit(page, where) {
    const r = await page.evaluate(() => {
      const txt = document.body.innerText + ' ' + Array.from(document.querySelectorAll('input,select,textarea')).map(i => i.value).join(' ') +
        ' ' + Array.from(document.querySelectorAll('svg text')).map(t => t.textContent).join(' ');
      const bad = (txt.match(/\b(NaN|undefined|Infinity|null)\b|\[object/g) || []);
      const attrs = Array.from(document.querySelectorAll('svg *')).filter(e => Array.from(e.attributes).some(a => /NaN|Infinity|undefined/.test(a.value))).length;
      const vw = document.documentElement.clientWidth;
      const over = document.documentElement.scrollWidth > vw + 1;
      const wide = [];
      document.querySelectorAll('body *').forEach(e => {
        const st = getComputedStyle(e);
        if (st.display === 'none' || st.visibility === 'hidden' || e.closest('svg') || e.closest('.toasts')) return;
        let a = e.parentElement, inScroller = false;
        while (a && a !== document.body) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll') { inScroller = true; break; } a = a.parentElement; }
        if (inScroller) return;
        const b = e.getBoundingClientRect();
        if (b.width && (b.right > vw + 1 || b.left < -1) && st.position !== 'fixed' && !e.closest('.sheet-layer:not(.open)')) wide.push((e.className || e.tagName) + ':' + Math.round(b.left) + '-' + Math.round(b.right));
        // metin kesilmesi: overflow hidden + scrollWidth > clientWidth (ellipsis bilinçli değilse)
        if ((st.overflow === 'hidden' || st.overflowX === 'hidden') && st.textOverflow !== 'ellipsis' && e.children.length === 0 && e.scrollWidth > e.clientWidth + 2 && e.textContent.trim())
          wide.push('KESİK ' + (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 30));
      });
      return { bad, attrs, over, wide: wide.slice(0, 8) };
    });
    check(!r.bad.length && !r.attrs, `${where}: NaN/undefined/Infinity yok` + (r.bad.length || r.attrs ? ' → ' + r.bad.join(',') + ' svgattr=' + r.attrs : ''));
    check(!r.over && !r.wide.length, `${where}: yatay taşma / kesik metin yok` + (r.over || r.wide.length ? ' → ' + r.wide.join(' | ') : ''));
  }
  const S = page => page.evaluate(() => window.Zayifla.state());
  const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  const sheetOpen = '.sheet-layer.open:last-child';

  /* ------------------------------ Manifest ------------------------------ */
  console.log('Manifest ve dosyalar');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  check(man.start_url && !man.start_url.startsWith('/'), 'start_url göreli: ' + man.start_url);
  check(man.scope && !man.scope.startsWith('/'), 'scope göreli: ' + man.scope);
  check(man.display === 'standalone', 'display standalone');
  const sizes = man.icons.map(i => i.sizes);
  check(sizes.includes('192x192') && sizes.includes('512x512') && man.icons.some(i => /maskable/.test(i.purpose)), 'ikonlar 192/512/maskable');
  for (const ic of man.icons.concat((man.shortcuts || []).flatMap(s => s.icons || []))) {
    const f = path.join(ROOT, ic.src);
    const exists = fs.existsSync(f);
    let dimOk = false;
    if (exists) { const b = fs.readFileSync(f); const w = b.readUInt32BE(16), h = b.readUInt32BE(20); dimOk = ic.sizes === w + 'x' + h; }
    check(exists && dimOk, 'ikon mevcut ve boyutu doğru: ' + ic.src + ' ' + ic.sizes);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const absRefs = (html.match(/(?:src|href)="\/[^"]*"/g) || []).concat((fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/'\/[a-z][^']*'/g) || []));
  check(!absRefs.length, 'mutlak yol yok (alt yol uyumlu)' + (absRefs.length ? ': ' + absRefs.join(',') : ''));

  /* ---------------------------- Onboarding ---------------------------- */
  const ctx = await newCtx();
  const page = await ctx.newPage(); watch(page, 'main');
  await page.goto(BASE, { waitUntil: 'load' });
  console.log('Onboarding (uç değerler)');
  check(await page.$('.onb') !== null, 'onboarding açıldı');
  check(await page.$eval('[data-ob="next"]', b => b.disabled), 'cinsiyet seçilmeden ilerlenemez');
  await page.click('[data-ob="sex"][data-v="e"]');
  await page.click('[data-ob="next"]');
  for (const [age, h, okExp] of [['13', '170', false], ['101', '170', false], ['30', '119', false], ['30', '231', false], ['abc', '170', false], ['', '', false], ['100', '230', true], ['14', '120', true], ['45', '178', true]]) {
    await page.fill('[data-obi="age"]', age); await page.fill('[data-obi="height"]', h);
    const en = !(await page.$eval('[data-ob="next"]', b => b.disabled));
    check(en === okExp, `yaş=${age || '∅'} boy=${h || '∅'} → ${okExp ? 'geçerli' : 'geçersiz'}`);
  }
  await page.click('[data-ob="next"]');
  for (const [w, g, okExp] of [['34', '30', false], ['301', '80', false], ['95,5', '80', true], ['95.5', '34', false]]) {
    await page.fill('[data-obi="weight"]', w); await page.fill('[data-obi="goal"]', g);
    const en = !(await page.$eval('[data-ob="next"]', b => b.disabled));
    check(en === okExp, `kilo=${w} hedef=${g} → ${okExp ? 'geçerli' : 'geçersiz'}`);
  }
  await page.fill('[data-obi="weight"]', '95,5'); await page.fill('[data-obi="goal"]', '80');
  const bmiTxt = await page.textContent('#ob-bmi');
  check(/30,1/.test(bmiTxt), 'VKİ 95,5 kg / 178 cm = 30,1 → ' + bmiTxt.slice(0, 40));
  await audit(page, 'onboarding kilo');
  await page.click('[data-ob="next"]');
  await page.click('[data-ob="activity"][data-v="orta"]');
  await page.click('[data-ob="next"]');
  await page.click('[data-ob="pace"][data-v="0.75"]');
  await page.click('[data-ob="next"]');
  const res = await page.textContent('.onb-body');
  // Mifflin erkek: 10*95.5 + 6.25*178 - 5*45 + 5 = 1847.5; TDEE *1.55 = 2863.6; açık 0.75*1100=825 → 2038.6 → 2040
  check(/1\.848/.test(res) || /1\.847/.test(res), 'BMR ≈ 1848 kcal');
  check(/2\.864/.test(res), 'TDEE ≈ 2864 kcal');
  check(/2\.040/.test(res), 'hedef 2040 kcal');
  check(/~21 hafta/.test(res), 'süre (95,5−80)/0,75 = 21 hafta');
  await audit(page, 'onboarding sonuç');
  await shot(page, '01-onb-result');
  // geri git, düzelt, ileri
  await page.click('[data-ob="back"]');
  await page.click('[data-ob="back"]');
  await page.click('[data-ob="back"]');
  check(await page.$eval('[data-obi="weight"]', i => i.value) === '95,5', 'geri dönünce değer korunur');
  for (let i = 0; i < 3; i++) await page.click('[data-ob="next"]');
  await page.click('[data-ob="next"]');
  await page.waitForSelector('#quickbar:not([hidden])');
  let st = await S(page);
  check(st.targets.kcal === 2040 && st.weights.length === 1 && st.weights[0].kg === 95.5, 'profil kaydedildi, ilk tartı 95,5');
  await audit(page, 'bugün (boş)');
  await shot(page, '02-today-empty');

  /* ---------------------- Ekleme / düzenleme / silme --------------------- */
  console.log('Kayıt ekleme, düzenleme, silme');
  await page.fill('#qb-input', 'sabah üç yumurta iki dilim beyaz peynir ve 5 zeytin yedim');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheetOpen + ' .pitem');
  await page.waitForTimeout(350);
  await audit(page, 'onay sayfası');
  check((await page.$$(sheetOpen + ' .pitem')).length === 3, 'onayda 3 kalem');
  check(await page.$eval(sheetOpen + ' [data-meal="kahvalti"]', b => b.classList.contains('on')), 'öğün kahvaltı seçili');
  const eggK = await page.$eval(sheetOpen + ' .pitem[data-i="0"] .js-kcal', e => e.textContent);
  check(/233/.test(eggK), '3 yumurta ≈ 233 kcal: ' + eggK);
  // birim değiştir g
  await page.selectOption(sheetOpen + ' .pitem[data-i="0"] [data-act="unit"]', 'g');
  check(await page.$eval(sheetOpen + ' .pitem[data-i="0"] [data-act="qty"]', i => i.value) === '150', 'birim g → 150');
  check(/233/.test(await page.$eval(sheetOpen + ' .pitem[data-i="0"] .js-kcal', e => e.textContent)), 'g birimine geçince kcal aynı');
  await page.selectOption(sheetOpen + ' .pitem[data-i="0"] [data-act="unit"]', 'adet');
  check(await page.$eval(sheetOpen + ' .pitem[data-i="0"] [data-act="qty"]', i => i.value) === '1', 'adet birimine dönünce 1');
  await page.fill(sheetOpen + ' .pitem[data-i="0"] [data-act="qty"]', '3');
  // azalt düğmesi alt sınır
  for (let i = 0; i < 8; i++) await page.click(sheetOpen + ' .pitem[data-i="2"] [data-act="dec"]');
  const zq = await page.$eval(sheetOpen + ' .pitem[data-i="2"] [data-act="qty"]', i => i.value);
  check(parseFloat(zq.replace(',', '.')) > 0, 'azalt sıfıra/eksiye düşmez: ' + zq);
  await page.fill(sheetOpen + ' .pitem[data-i="2"] [data-act="qty"]', '5');
  // toplam kontrol
  const tot = await page.$eval(sheetOpen + ' .totals b', e => e.textContent);
  check(/^\d/.test(tot) && !/NaN/.test(tot), 'toplam: ' + tot);
  // öğünü değiştir
  await page.click(sheetOpen + ' [data-meal="ogle"]');
  check(/Öğle/.test(await page.textContent(sheetOpen + ' [data-fact="add"]')), 'öğün değişince düğme "Öğle"');
  await page.click(sheetOpen + ' [data-meal="kahvalti"]');
  await page.click(sheetOpen + ' [data-fact="add"]');
  await page.waitForTimeout(500);
  st = await S(page);
  const today = daysAgo(0);
  const ent = st.days[today].entries;
  const sum = ent.reduce((a, e) => a + e.kcal, 0);
  check(ent.length === 3 && ent.every(e => e.meal === 'kahvalti'), '3 kayıt kahvaltıya eklendi');
  const ringTxt = await page.textContent('.ring-center .big');
  check(+ringTxt.replace('.', '') === 2040 - sum, `halka kalan = ${2040 - sum}: ${ringTxt}`);
  const eatenTxt = await page.$eval('.summary-stats div:nth-child(2) b', e => e.textContent);
  check(+eatenTxt.replace('.', '') === sum, 'yenen toplam doğru: ' + eatenTxt);
  // düzenle: girişe dokun
  await page.click('.entry >> nth=0');
  await page.waitForSelector(sheetOpen + ' .food-hero');
  await page.waitForTimeout(300);
  await audit(page, 'besin detayı (düzenle)');
  await page.click(sheetOpen + ' [data-st="1"]');
  await page.click(sheetOpen + ' [data-meal="ogle"]');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(400);
  st = await S(page);
  const e0 = st.days[today].entries[0];
  check(e0.qty === 3.5 && e0.meal === 'ogle' && e0.kcal === Math.round(3.5 * 50 * 1.55), 'düzenleme: 3,5 adet, öğle, kcal ' + e0.kcal);
  // sil + geri al
  await page.click('.entry >> nth=0');
  await page.waitForSelector(sheetOpen + ' [data-del]');
  await page.waitForTimeout(300);
  await page.click(sheetOpen + ' [data-del]');
  await page.waitForTimeout(300);
  check((await S(page)).days[today].entries.length === 2, 'silindi');
  await page.click('.toast button');
  await page.waitForTimeout(300);
  check((await S(page)).days[today].entries.length === 3, 'geri al çalıştı');

  // eşleşmeyen + özel besin
  console.log('Özel besin, hızlı kalori, kayıtlı öğün');
  await page.fill('#qb-input', 'iki tabak annemin zxqmantısı');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheetOpen + ' .unmatched');
  await page.click(sheetOpen + ' [data-uact="create"]');
  await page.waitForSelector(sheetOpen + ' [name="kcal"]');
  await page.waitForTimeout(350);
  await page.click(sheetOpen + ' [data-mode="portion"]');
  await page.fill(sheetOpen + ' [name="kcal"]', '450');
  await page.fill(sheetOpen + ' [name="pg"]', '300');
  await page.fill(sheetOpen + ' [name="p"]', '20');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(500);
  const cItem = await page.$eval(sheetOpen + ' .pitem .js-kcal', e => e.textContent);
  check(/900/.test(cItem), '2 tabak özel besin (450/porsiyon) = 900 kcal? → ' + cItem + ' (birim: ' + await page.$eval(sheetOpen + ' .pitem [data-act="unit"]', s => s.value) + ')');
  await audit(page, 'özel besin onay');
  await page.click(sheetOpen + ' [data-fact="add"]');
  await page.waitForTimeout(400);
  st = await S(page);
  check(st.custom.length === 1 && st.custom[0].kcal === 150 && st.custom[0].units.porsiyon === 300, 'özel besin 100 g başına 150 kcal kaydedildi');

  // hızlı kalori
  await page.click('.tab-fab');
  await page.waitForSelector(sheetOpen + ' [data-h="quick"]');
  await page.waitForTimeout(300);
  await audit(page, 'ekle merkezi');
  await page.click(sheetOpen + ' [data-h="quick"]');
  await page.waitForSelector(sheetOpen + ' [name="kcal"]');
  await page.waitForTimeout(300);
  await page.fill(sheetOpen + ' [name="kcal"]', '-50');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(200);
  check(await page.$(sheetOpen + ' [name="kcal"]') !== null, 'negatif kalori reddedildi');
  await page.fill(sheetOpen + ' [name="kcal"]', '320,5');
  await page.fill(sheetOpen + ' [name="name"]', 'Restoran çorbası');
  await page.click(sheetOpen + ' [data-meal="aksam"]');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(400);
  st = await S(page);
  const q = st.days[today].entries.find(e => e.quick);
  check(q && q.kcal === 321 && q.meal === 'aksam', 'hızlı kalori 321 kcal akşama');
  // hızlı kalori düzenle
  await page.click(`.entry[data-id="${q.id}"]`);
  await page.waitForSelector(sheetOpen + ' [name="kcal"]');
  await page.waitForTimeout(300);
  await page.fill(sheetOpen + ' [name="kcal"]', '400');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(400);
  check((await S(page)).days[today].entries.find(e => e.id === q.id).kcal === 400, 'hızlı kalori düzenlendi');

  // kayıtlı öğün
  await page.click('[data-action="save-meal"][data-meal="kahvalti"]');
  await page.waitForSelector(sheetOpen + ' [name="n"]');
  await page.waitForTimeout(300);
  check(await page.$eval(sheetOpen + ' [name="n"]', i => i.value) === 'Benim kahvaltım', 'öğün adı önerisi');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(400);
  check((await S(page)).meals.length === 1, 'öğün kaydedildi');
  await page.fill('#qb-input', 'benim kahvaltım ve bir bardak çay');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheetOpen + ' .pitem');
  await page.waitForTimeout(300);
  const nMeal = (await page.$$(sheetOpen + ' .pitem')).length;
  const mealSaved = (await S(page)).meals[0].items.length;
  check(nMeal === mealSaved + 1, `kayıtlı öğün adını söyleyince ${mealSaved} kalem + çay gelir: ` + (await page.$$eval(sheetOpen + ' .pitem b', b => b.map(x => x.textContent).join(', '))));
  await page.click(sheetOpen + ' [data-close]').catch(() => {});
  await page.waitForTimeout(400);

  // favori + son
  console.log('Arama, favori, son kullanılanlar');
  await page.click('.qb-search');
  await page.waitForSelector(sheetOpen + ' .search-box input');
  await page.waitForTimeout(300);
  await audit(page, 'arama (boş sorgu: son/favori)');
  const recentTxt = await page.textContent(sheetOpen + ' .sheet-body');
  check(/Yumurta/.test(recentTxt), 'son kullanılanlarda yumurta');
  await page.fill(sheetOpen + ' .search-box input', 'ayran');
  await page.waitForTimeout(400);
  await page.click(sheetOpen + ' [data-food] >> nth=0');
  await page.waitForSelector(sheetOpen + ' [data-fav]');
  await page.waitForTimeout(300);
  await page.click(sheetOpen + ' [data-fav]');
  check((await S(page)).favs.length === 1, 'favoriye eklendi');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(400);
  await page.click('.qb-search');
  await page.waitForSelector(sheetOpen + ' .search-box input');
  await page.waitForTimeout(300);
  check(/Ayran/.test(await page.textContent(sheetOpen + ' .sheet-body')), 'favoriler listesinde Ayran');
  await shot(page, '03-search-favs');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if (await page.$('.sheet-layer.open')) { await page.click(sheetOpen + ' [data-close]').catch(() => {}); await page.waitForTimeout(300); }

  /* ------------------------------ Su ------------------------------ */
  console.log('Su');
  for (let i = 0; i < 3; i++) await page.click('[data-action="water-plus"]');
  await page.click('[data-action="water-minus"]');
  check((await S(page)).days[today].water === 2, 'su 2 bardak');
  check(/0,5 \/ 2 L/.test(await page.textContent('.wv')), 'su metni 0,5 / 2 L: ' + await page.textContent('.wv'));
  await page.click('.glass[data-n="1"]');
  check((await S(page)).days[today].water === 1, '2. bardağa dokununca 1 bardak');
  for (let i = 0; i < 25; i++) await page.click('[data-action="water-plus"]');
  await audit(page, 'bugün (çok su)');
  await page.click('[data-action="water-minus"]');
  await shot(page, '04-today-filled');

  /* --------------------------- Tarih gezinme --------------------------- */
  console.log('Tarih gezinme, dünü kopyala');
  check(await page.$eval('[data-action="day-next"]', b => b.disabled), 'bugünde ileri düğmesi kapalı');
  await page.click('[data-action="day-prev"]');
  check(/Dün/.test(await page.textContent('.day-label b')), 'dün etiketi');
  await page.fill('#qb-input', 'bir porsiyon kuru fasulye ve pilav');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheetOpen + ' .pitem');
  await page.waitForTimeout(300);
  await page.click(sheetOpen + ' [data-meal="ogle"]');
  await page.click(sheetOpen + ' [data-fact="add"]');
  await page.waitForTimeout(400);
  check(((await S(page)).days[daysAgo(1)] || { entries: [] }).entries.length === 2, 'düne 2 kayıt eklendi');
  await page.click('[data-action="day-prev"]');
  await page.click('[data-action="day-prev"]');
  await audit(page, 'geçmiş gün');
  await page.click('[data-action="day-today"]');
  check(/Bugün/.test(await page.textContent('.day-label b')), 'bugüne dön');
  await page.click('[data-action="copy-meal"][data-meal="ogle"]');
  await page.waitForTimeout(400);
  st = await S(page);
  check(st.days[today].entries.filter(e => e.meal === 'ogle' && /fasulye|pilav/i.test(e.name)).length === 2, 'dünkü öğle kopyalandı');
  const ids = st.days[today].entries.map(e => e.id);
  check(new Set(ids).size === ids.length, 'kopyalanan kayıtların id\'leri benzersiz');
  // tarih seçici
  await page.evaluate(k => { const i = document.querySelector('[data-action-change="day-pick"]'); i.value = k; i.dispatchEvent(new Event('change', { bubbles: true })); }, daysAgo(10));
  check(await page.textContent('.day-label b') !== 'Bugün', 'tarih seçiciyle 10 gün öncesi');
  await page.evaluate(() => { const i = document.querySelector('[data-action-change="day-pick"]'); i.value = '2999-01-01'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  check(await page.textContent('.day-label b') !== 'Bugün' && !/2999/.test(await page.textContent('.day-label')), 'gelecek tarih reddedildi');
  await page.click('[data-action="day-today"]');

  /* ------------------------ Kilo + grafikler ------------------------- */
  console.log('Kilo girişi ve grafikler (1, 2, 60 nokta)');
  async function setWeights(list) {
    await page.evaluate(ws => { const s = window.Zayifla.state(); s.weights = ws; localStorage.setItem('zayifla.data', JSON.stringify(s)); }, list);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#tabbar:not([hidden])');
  }
  async function chartsAllRanges(label) {
    await page.click('a[data-tab="ilerleme"]');
    await page.waitForSelector('#wchart');
    for (const r of ['1H', '1A', '3A', 'T']) {
      await page.click(`[data-action="wrange"][data-v="${r}"]`);
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => ({ svg: !!document.querySelector('#wchart svg'), dots: document.querySelectorAll('#wchart .ch-dot').length, empty: !!document.querySelector('#wchart .chart-empty') }));
      check(info.svg || info.empty, `${label} · aralık ${r}: grafik/boş durum (${info.dots} nokta)`);
    }
    for (const c of [7, 30]) {
      await page.click(`[data-action="crange"][data-v="${c}"]`);
      await page.waitForTimeout(150);
    }
    await audit(page, `${label} ilerleme`);
    await page.click('a[data-tab="kilo"]');
    await page.waitForSelector('#wform');
    await audit(page, `${label} kilo`);
  }
  await setWeights([{ date: today, kg: 95.5 }]);
  await chartsAllRanges('1 nokta');
  await shot(page, '05-weight-1pt');
  await setWeights([{ date: daysAgo(5), kg: 96.2 }, { date: today, kg: 95.5 }]);
  await chartsAllRanges('2 nokta');
  const w60 = []; for (let i = 59; i >= 0; i--) w60.push({ date: daysAgo(i), kg: +(98 - (59 - i) * 0.05 + Math.sin(i) * 0.6).toFixed(1) });
  await setWeights(w60);
  // 60 günlük kalori verisi de
  await page.evaluate(() => {
    const s = window.Zayifla.state();
    const pad = n => String(n).padStart(2, '0'), key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    for (let i = 59; i >= 1; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = key(d); if (!s.days[k]) s.days[k] = { water: 5, entries: [{ id: 'h' + i, foodId: null, name: 'Geçmiş', qty: 1, unit: 'porsiyon', grams: 0, kcal: 2000 + (i % 5) * 60, p: 90, c: 220, f: 70, meal: 'aksam', ts: 0, quick: true }] }; }
    localStorage.setItem('zayifla.data', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#tabbar:not([hidden])');
  await chartsAllRanges('60 nokta');
  await page.click('a[data-tab="ilerleme"]');
  await page.click('[data-action="wrange"][data-v="3A"]');
  await page.waitForTimeout(200);
  const dots3A = await page.$$eval('#wchart .ch-dot', e => e.length);
  check(dots3A === 60, '3A aralığında 60 nokta: ' + dots3A);
  await page.click('[data-action="wrange"][data-v="1H"]');
  await page.waitForTimeout(200);
  check(await page.$$eval('#wchart .ch-dot', e => e.length) === 7, '1H aralığında 7 nokta');
  const xl = await page.$$eval('#wchart text.ch-label', ts => ts.map(t => t.textContent));
  const lastX = xl[xl.length - 1];
  const now = new Date(); const MS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  check(lastX === now.getDate() + ' ' + MS[now.getMonth()], 'x ekseni son etiketi bugün: ' + lastX);
  // dokunma ipucu
  const box = await page.$eval('#wchart svg', s => { const b = s.getBoundingClientRect(); return { x: b.x + b.width - 20, y: b.y + b.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  check(/Trend/.test(await page.$eval('#wchart .ch-tip-t2', t => t.textContent)), 'grafiğe dokununca ipucu');
  await page.click('[data-action="crange"][data-v="30"]');
  await page.waitForTimeout(150);
  await page.click('#cchart .ch-hit[data-i="29"]');
  await page.waitForSelector('.day-detail');
  await audit(page, 'ilerleme 30 gün + detay');
  await shot(page, '06-progress-60');
  // ortalama doğruluğu
  const avgTxt = await page.textContent('#cavg');
  const expAvg = await page.evaluate(() => { const s = window.Zayifla.state(); const pad = n => String(n).padStart(2, '0'), key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); let t = 0, n = 0; for (let i = 0; i < 30; i++) { const d = new Date(); d.setDate(d.getDate() - i); const day = s.days[key(d)]; const k = day ? day.entries.reduce((a, e) => a + e.kcal, 0) : 0; if (k > 0) { t += k; n++; } } return Math.round(t / n); });
  check(avgTxt.replace(/\./g, '').includes(String(expAvg)), `30 gün ortalaması ${expAvg}: ` + avgTxt.slice(0, 60));
  // trend: EMA doğrulaması
  st = await S(page);
  let t = null; st.weights.forEach(w => { t = t == null ? w.kg : t + 0.1 * (w.kg - t); });
  await page.click('a[data-tab="kilo"]');
  await page.waitForSelector('#wform');
  const whBig = await page.textContent('.wh-big');
  check(whBig.startsWith(t.toFixed(1).replace('.', ',')), `trend kilo ${t.toFixed(2)} gösteriliyor: ${whBig}`);
  check(await page.$('.delta.down') !== null, 'trend aşağı yönlü gösteriliyor');
  // kilo girişleri
  await page.fill('#wform [name="kg"]', '1000');
  await page.click('#wform button[type="submit"]');
  await page.waitForTimeout(200);
  check((await S(page)).weights.length === 60, 'saçma kilo (1000) reddedildi');
  await page.fill('#wform [name="kg"]', '94,8');
  await page.fill('#wform [name="date"]', daysAgo(0));
  await page.fill('#wform [name="waist"]', '101');
  await page.click('#wform button[type="submit"]');
  await page.waitForTimeout(300);
  st = await S(page);
  check(st.weights.length === 60 && st.weights[st.weights.length - 1].kg === 94.8, 'bugünkü tartı güncellendi (yinelenmedi)');
  check(st.waists.length === 1, 'bel ölçüsü kaydedildi');
  check(st.targets.kcal > 1500, 'hedef trend kiloyla güncellendi: ' + st.targets.kcal);
  await audit(page, 'kilo (60 nokta, bel)');
  await shot(page, '07-weight-60');
  // tartı silme
  await page.click('[data-action="weight-del"] >> nth=0');
  await page.waitForTimeout(300);
  check((await S(page)).weights.length === 59, 'tartı silindi');
  await page.click('.toast button');
  await page.waitForTimeout(300);
  check((await S(page)).weights.length === 60, 'tartı silme geri alındı');

  /* --------------------------- Ayarlar --------------------------- */
  console.log('Ayarlar: profil, hedef, hatırlatıcılar, tema, birim');
  await page.click('a[data-tab="ayarlar"]');
  await page.waitForSelector('[data-rem="breakfast"]');
  await audit(page, 'ayarlar');
  await shot(page, '08-settings');
  await page.click('[data-action="edit-profile"]');
  await page.waitForSelector(sheetOpen + ' [name="age"]');
  await page.waitForTimeout(300);
  await page.fill(sheetOpen + ' [name="age"]', '200');
  check(/kontrol/.test(await page.textContent(sheetOpen + ' .js-prev')), 'profil: geçersiz yaş uyarısı');
  await page.fill(sheetOpen + ' [name="age"]', '46');
  await audit(page, 'profil düzenle');
  await page.click(sheetOpen + ' [data-ok]');
  await page.waitForTimeout(400);
  check((await S(page)).profile.age === 46, 'profil güncellendi');
  await page.click('[data-manual="on"]');
  await page.waitForSelector('#manual-kcal');
  await page.fill('#manual-kcal', '1800');
  await page.click('[data-action="manual-save"]');
  await page.waitForTimeout(400);
  st = await S(page);
  check(st.targets.kcal === 1800 && st.targets.manual && st.manual.on && st.manual.kcal === 1800, 'elle hedef 1800');
  check(Math.abs(st.targets.p * 4 + st.targets.c * 4 + st.targets.f * 9 - 1800) < 40, 'makrolar elle hedefe orantılı');
  // hatırlatıcılar
  await page.click('[data-rem="breakfast"][data-field="on"]', { force: true });
  await page.waitForTimeout(500);
  check((await S(page)).reminders.breakfast.on, 'kahvaltı hatırlatıcısı açıldı (izin verildi)');
  await page.fill('[data-rem="breakfast"][data-field="time"]', '09:15');
  await page.dispatchEvent('[data-rem="breakfast"][data-field="time"]', 'change');
  check((await S(page)).reminders.breakfast.time === '09:15', 'saat değişti');
  await page.click('[data-rem="water"][data-field="on"]', { force: true });
  await page.waitForTimeout(500);
  await page.selectOption('[data-rem="water"][data-field="every"]', '90');
  check((await S(page)).reminders.water.every === 90, 'su sıklığı 90 dk');
  check(/1,5 saatte 1/.test(await page.textContent('[data-rem="water"][data-field="every"]')), 'su sıklığı etiketi "1,5 saatte 1"');
  await audit(page, 'ayarlar (hatırlatıcılar açık)');
  await page.click('[data-action="notif-test"]');
  await page.waitForTimeout(800);
  const toastTxt = await page.textContent('#toasts');
  check(/gönderildi/.test(toastTxt), 'test bildirimi: ' + toastTxt.slice(-60));
  // birim lb
  await page.click('[data-action="wunit"][data-v="lb"]');
  await page.click('a[data-tab="kilo"]');
  await page.waitForSelector('#wform');
  check(/lb/.test(await page.textContent('.wh-big')), 'lb birimi gösteriliyor');
  await audit(page, 'kilo (lb)');
  await page.click('a[data-tab="ayarlar"]');
  await page.click('[data-action="wunit"][data-v="kg"]');
  // su ayarları
  await page.selectOption('[data-setting="glassMl"]', '330');
  for (let i = 0; i < 25; i++) await page.click('[data-action="wgoal"][data-v="1"]');
  check((await S(page)).settings.waterGoal === 20, 'su hedefi en fazla 20');
  for (let i = 0; i < 25; i++) await page.click('[data-action="wgoal"][data-v="-1"]');
  check((await S(page)).settings.waterGoal === 1, 'su hedefi en az 1');
  await page.click('[data-action="wgoal"][data-v="1"]');
  await audit(page, 'ayarlar (su)');
  // kayıtlı öğünler / özel besinler sayfaları
  await page.click('[data-action="my-meals"]');
  await page.waitForSelector(sheetOpen + ' [data-use]');
  await page.waitForTimeout(300);
  await audit(page, 'kayıtlı öğünler');
  await page.click(sheetOpen + ' [data-use]');
  await page.waitForSelector(sheetOpen + ' .pitem');
  await page.waitForTimeout(300);
  await page.click(sheetOpen + ' [data-close]').catch(() => {});
  await page.waitForTimeout(400);
  await page.click('[data-action="my-foods"]');
  await page.waitForSelector(sheetOpen + ' [data-cf]');
  await page.waitForTimeout(300);
  await page.click(sheetOpen + ' [data-cf]');
  await page.waitForSelector(sheetOpen + ' [name="kcal"]');
  await page.waitForTimeout(300);
  check(await page.$eval(sheetOpen + ' [name="kcal"]', i => i.value) === '450', 'özel besin düzenlemede porsiyon başı 450 gösterilir');
  await audit(page, 'özel besin düzenle');
  await page.click(sheetOpen + ' [data-close]').catch(() => {});
  await page.waitForTimeout(400);

  // koyu tema
  console.log('Tema');
  await page.click('[data-action="theme"][data-v="dark"]');
  check(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'koyu tema');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(/rgb\((\d+), (\d+), (\d+)\)/.test(bg) && bg.match(/\d+/g).slice(0, 3).every(n => +n < 60), 'koyu arka plan: ' + bg);
  for (const tab of ['bugun', 'ilerleme', 'kilo', 'ayarlar']) {
    await page.click(`a[data-tab="${tab}"]`);
    await page.waitForTimeout(250);
    await shot(page, '09-dark-' + tab);
  }
  await page.click('[data-action="theme"][data-v="light"]');

  /* -------------------------- Dışa / içe aktar -------------------------- */
  console.log('Dışa/içe aktarma, sıfırlama');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  const file = path.join(SHOTS, 'yedek.json');
  await dl.saveAs(file);
  const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(exp.app === 'zayifla' && exp.weights.length === 60 && exp.profile.age === 46, 'yedek dosyası geçerli: ' + dl.suggestedFilename());
  // sıfırla
  await page.click('[data-action="reset"]');
  await page.waitForSelector(sheetOpen + ' [data-yes]');
  await page.waitForTimeout(300);
  await page.click(sheetOpen + ' [data-yes]');
  await page.waitForTimeout(500);
  check(await page.$('.onb') !== null && !(await S(page)).profile, 'sıfırlama → onboarding');
  // içe aktar (onboarding ekranında içe aktar yok; ayarlar sonrası test için hızlıca profil oluştur)
  await page.evaluate(() => localStorage.setItem('zayifla.data', JSON.stringify({ profile: { sex: 'k', age: 30, height: 160, weight: 70, goal: 60, activity: 'hafif', pace: 0.5 } })));
  await page.goto(BASE + '#ayarlar', { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#import-file', { state: 'attached' });
  await page.setInputFiles('#import-file', file);
  await page.waitForSelector(sheetOpen + ' [data-yes]');
  await page.waitForTimeout(300);
  check(/60 tartı/.test(await page.textContent(sheetOpen + ' .sheet-body')), 'içe aktarma özeti');
  await page.click(sheetOpen + ' [data-yes]');
  await page.waitForTimeout(500);
  st = await S(page);
  check(st.weights.length === 60 && st.profile.age === 46 && st.custom.length === 1 && st.meals.length === 1, 'yedek geri yüklendi');
  // bozuk dosya
  const badFile = path.join(SHOTS, 'bozuk.json'); fs.writeFileSync(badFile, '{"foo": 1}');
  await page.setInputFiles('#import-file', badFile);
  await page.waitForTimeout(400);
  check(/yedeği gibi görünmüyor/.test(await page.textContent('#toasts')), 'geçersiz yedek reddedildi');

  /* -------------------- Service worker + çevrimdışı -------------------- */
  console.log('Service worker ve çevrimdışı');
  const swInfo = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { active: !!r.active, scope: r.scope }; });
  check(swInfo.active && swInfo.scope === BASE, 'SW etkin, kapsam ' + swInfo.scope);
  await page.waitForTimeout(1000);
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks.find(k => /^zayifla-v/.test(k))); return (await c.keys()).map(r => r.url.split('/zay-fla/')[1]); });
  check(cached.length >= 15, 'önbellekte ' + cached.length + ' dosya');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#tabbar:not([hidden])');
  check(await page.evaluate(() => window.FOODS.length) >= 480, 'çevrimdışı yeniden yükleme (besin listesi yüklü)');
  await page.goto(BASE + '?utm=x#kilo', { waitUntil: 'load' }).catch(() => {});
  check(await page.$('#wform') !== null, 'çevrimdışı sorgu dizesiyle açılış');
  await ctx.setOffline(false);
  const manOk = await page.evaluate(async () => { const r = await fetch('manifest.json'); const m = await r.json(); return new URL(m.start_url, r.url).href; });
  check(manOk === BASE, 'manifest start_url alt yola çözülüyor: ' + manOk);

  /* --------------------------- 360 px genişlik --------------------------- */
  console.log('360 px dar ekran');
  const data = await page.evaluate(() => localStorage.getItem('zayifla.data'));
  const ctx2 = await newCtx({ viewport: { width: 360, height: 740 }, screen: { width: 360, height: 740 } });
  const p2 = await ctx2.newPage(); watch(p2, '360');
  await p2.goto(BASE, { waitUntil: 'load' });
  await audit(p2, '360 onboarding');
  await p2.evaluate(d => localStorage.setItem('zayifla.data', d), data);
  await p2.reload({ waitUntil: 'load' });
  for (const tab of ['bugun', 'ilerleme', 'kilo', 'ayarlar']) {
    await p2.goto(BASE + '#' + tab, { waitUntil: 'load' });
    await p2.waitForTimeout(350);
    await audit(p2, '360 ' + tab);
    await p2.screenshot({ path: path.join(SHOTS, '10-360-' + tab + '.png'), fullPage: true });
  }
  await p2.goto(BASE + '#bugun', { waitUntil: 'load' });
  await p2.click('.tab-fab'); await p2.waitForTimeout(400);
  await audit(p2, '360 ekle merkezi');
  await p2.screenshot({ path: path.join(SHOTS, '11-360-hub.png') });
  await p2.click(sheetOpen + ' [data-h="voice"]'); await p2.waitForTimeout(400);
  await audit(p2, '360 ses sayfası');
  await p2.screenshot({ path: path.join(SHOTS, '12-360-voice.png') });
  await p2.fill(sheetOpen + ' .js-txt', 'öğlen bir porsiyon kuru fasulye pilav ve ayran ayrıca iki dilim ekmek ve bir kase cacık');
  await p2.click(sheetOpen + ' [data-go]');
  await p2.waitForSelector(sheetOpen + ' .pitem'); await p2.waitForTimeout(400);
  await audit(p2, '360 onay (5 kalem)');
  await p2.screenshot({ path: path.join(SHOTS, '13-360-confirm.png') });
  // uzun adlı özel besin
  await p2.evaluate(() => { const s = window.Zayifla.state(); });
  await ctx2.close();

  /* ------------------------ Hedefe ulaşmış / kilo alma ------------------------ */
  console.log('Uç profiller');
  const ctx3 = await newCtx();
  const p3 = await ctx3.newPage(); watch(p3, 'edge');
  await p3.goto(BASE, { waitUntil: 'load' });
  await p3.evaluate(t => localStorage.setItem('zayifla.data', JSON.stringify({ profile: { sex: 'k', age: 80, height: 145, weight: 40, goal: 40, activity: 'sedanter', pace: 1 }, weights: [{ date: t, kg: 40 }] })), daysAgo(0));
  await p3.reload({ waitUntil: 'load' });
  for (const tab of ['bugun', 'ilerleme', 'kilo', 'ayarlar']) { await p3.goto(BASE + '#' + tab, { waitUntil: 'load' }); await p3.waitForTimeout(250); await audit(p3, 'hedefte/küçük profil ' + tab); }
  const st3 = await p3.evaluate(() => window.Zayifla.state().targets);
  check(st3.kcal === 1200 && st3.floorApplied, 'çok düşük TDEE → 1200 taban: ' + st3.kcal);
  await p3.evaluate(t => localStorage.setItem('zayifla.data', JSON.stringify({ profile: { sex: 'e', age: 20, height: 190, weight: 60, goal: 75, activity: 'cokaktif', pace: 0.5 }, weights: [{ date: t, kg: 60 }] })), daysAgo(0));
  await p3.reload({ waitUntil: 'load' });
  for (const tab of ['bugun', 'kilo']) { await p3.goto(BASE + '#' + tab, { waitUntil: 'load' }); await p3.waitForTimeout(250); await audit(p3, 'kilo almak isteyen ' + tab); }
  await p3.screenshot({ path: path.join(SHOTS, '14-gain-weight.png'), fullPage: true });
  const gainTxt = await p3.textContent('.stat-grid');
  check(/Toplam alınan/.test(gainTxt) && /Hedefe kalan\s*15 kg/.test(gainTxt), 'kilo almak: "Toplam alınan", hedefe kalan 15 kg: ' + gainTxt.replace(/\s+/g, ' ').slice(0, 80));
  check(/↑/.test(await p3.textContent('#wmini')), 'hedef grafiğin üstündeyse ↑ oku');
  await ctx3.close();

  await ctx.close();
  await browser.close();
  srv.close();
  console.log('\nKonsol/sayfa hataları: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'yok'));
  console.log(`\n${nPass} geçti, ${nFail} kaldı · ekran görüntüleri: ${SHOTS}`);
  process.exit(ok && !errors.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
