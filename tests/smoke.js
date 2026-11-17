#!/usr/bin/env node
/*
 * Playwright duman testi (mobil görünüm).
 *   python3 -m http.server 8765  (zayifla klasöründe)  &&  node tests/smoke.js [http://127.0.0.1:8765/] [ekran-görüntüsü-klasörü]
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const SHOTS = process.argv[3] || path.join(require('os').tmpdir(), 'zayifla-shots');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let ok = true;
  const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) ok = false; };

  async function newPage(scheme) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: scheme || 'light', locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    return { ctx, page };
  }

  const { ctx, page } = await newPage('light');
  await page.goto(BASE, { waitUntil: 'load' });

  console.log('Onboarding');
  await page.click('[data-ob="sex"][data-v="k"]');
  await page.click('[data-ob="next"]');
  await page.fill('[data-obi="age"]', '32');
  await page.fill('[data-obi="height"]', '165');
  await page.click('[data-ob="next"]');
  await page.fill('[data-obi="weight"]', '78');
  await page.fill('[data-obi="goal"]', '65');
  await page.screenshot({ path: path.join(SHOTS, '01-onboarding-weight.png') });
  await page.click('[data-ob="next"]');
  await page.click('[data-ob="activity"][data-v="hafif"]');
  await page.click('[data-ob="next"]');
  await page.click('[data-ob="pace"][data-v="0.5"]');
  await page.click('[data-ob="next"]');
  await page.screenshot({ path: path.join(SHOTS, '02-onboarding-result.png') });
  await page.click('[data-ob="next"]');
  await page.waitForSelector('#quickbar:not([hidden])');
  const target = await page.evaluate(() => window.Zayifla.state().targets.kcal);
  check(target >= 1200 && target < 2500, 'günlük hedef hesaplandı: ' + target + ' kcal');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '03-today-empty.png') });

  console.log('Metinle ekleme');
  await page.fill('#qb-input', 'iki dilim ekmek, yarım porsiyon pilav bir de ayran içtim');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector('.sheet-layer.open .pitem');
  await page.waitForTimeout(400);
  const nItems = await page.$$eval('.sheet-layer.open .pitem', els => els.length);
  check(nItems === 3, 'onay sayfasında 3 kalem: ' + nItems);
  await page.screenshot({ path: path.join(SHOTS, '04-confirm.png') });
  // miktarı artır
  await page.click('.sheet-layer.open .pitem[data-i="0"] [data-act="inc"]');
  await page.click('.sheet-layer.open [data-fact="add"]');
  await page.waitForTimeout(500);
  const entries = await page.evaluate(() => { const s = window.Zayifla.state(); const k = Object.keys(s.days)[0]; return s.days[k] ? s.days[k].entries.length : 0; });
  check(entries === 3, 'günlüğe 3 kayıt eklendi: ' + entries);

  // eşleşmeyen kelime -> özel besin
  await page.fill('#qb-input', 'bir tabak zxqwerty yemeği');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector('.sheet-layer.open .unmatched');
  check(true, 'eşleşmeyen parça gösterildi');
  await page.click('.sheet-layer.open [data-uact="create"]');
  await page.waitForSelector('.sheet-layer.open [name="kcal"]');
  await page.fill('.sheet-layer.open:last-child [name="kcal"]', '350');
  await page.click('.sheet-layer.open:last-child [data-mode="portion"]');
  await page.click('.sheet-layer.open:last-child [data-ok]');
  await page.waitForTimeout(500);
  const nAfter = await page.$$eval('.sheet-layer.open .pitem', els => els.length);
  check(nAfter === 1, 'özel besin onay listesine eklendi');
  await page.click('.sheet-layer.open [data-fact="add"]');
  await page.waitForTimeout(500);

  // hızlı kalori ve su
  await page.click('.tab-fab');
  await page.waitForSelector('.sheet-layer.open [data-h="quick"]');
  await page.screenshot({ path: path.join(SHOTS, '05-add-hub.png') });
  await page.click('.sheet-layer.open [data-h="quick"]');
  await page.waitForSelector('.sheet-layer.open [name="kcal"]');
  await page.fill('.sheet-layer.open [name="kcal"]', '220');
  await page.click('.sheet-layer.open [data-ok]');
  await page.waitForTimeout(400);
  await page.click('[data-action="water-plus"]');
  await page.click('[data-action="water-plus"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(SHOTS, '06-today-filled.png') });
  await page.screenshot({ path: path.join(SHOTS, '06b-today-full.png'), fullPage: true });

  // geçmiş veri ekle (grafikler için)
  await page.evaluate(() => {
    const s = window.Zayifla.state();
    const pad = n => String(n).padStart(2, '0');
    const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    for (let i = 40; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (i % 3 === 0) s.weights.push({ date: key(d), kg: +(79.5 - (40 - i) * 0.06 + Math.sin(i) * 0.5).toFixed(1) });
      if (i % 7 !== 3) s.days[key(d)] = { water: 6, entries: [{ id: 'x' + i, foodId: null, name: 'Test', qty: 1, unit: 'porsiyon', grams: 0, kcal: 1500 + Math.round(Math.sin(i) * 300), p: 80, c: 160, f: 55, meal: 'aksam', ts: 0, quick: true }] };
    }
    s.weights.sort((a, b) => a.date < b.date ? -1 : 1);
    localStorage.setItem('zayifla.data', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });

  console.log('İlerleme');
  await page.click('a[data-tab="ilerleme"]');
  await page.waitForSelector('#wchart svg');
  check(await page.$('#cchart svg') !== null, 'kalori grafiği çizildi');
  await page.click('#cchart .ch-hit[data-i="5"]');
  await page.waitForSelector('.day-detail');
  check(true, 'çubuğa dokununca gün detayı');
  await page.screenshot({ path: path.join(SHOTS, '07-progress.png'), fullPage: true });

  console.log('Kilo & Ayarlar');
  await page.click('a[data-tab="kilo"]');
  await page.waitForSelector('#wform');
  await page.fill('#wform [name="kg"]', '76,4');
  await page.fill('#wform [name="waist"]', '88');
  await page.click('#wform button[type="submit"]');
  await page.waitForTimeout(400);
  const wcount = await page.evaluate(() => window.Zayifla.state().weights.length);
  check(wcount > 10, 'tartı eklendi (' + wcount + ')');
  await page.screenshot({ path: path.join(SHOTS, '08-weight.png'), fullPage: true });
  await page.click('a[data-tab="ayarlar"]');
  await page.waitForSelector('[data-rem="breakfast"]');
  await page.screenshot({ path: path.join(SHOTS, '09-settings.png'), fullPage: true });

  console.log('Ses sayfası (desteklenmeyen ortam)');
  await page.click('a[data-tab="bugun"]');
  await page.click('.qb-mic');
  await page.waitForSelector('.sheet-layer.open .mic-big');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '10-voice.png') });
  await page.fill('.sheet-layer.open .js-txt', '3 yumurta ve bir bardak çay');
  await page.click('.sheet-layer.open [data-go]');
  await page.waitForSelector('.sheet-layer.open .pitem');
  check((await page.$$eval('.sheet-layer.open .pitem', e => e.length)) === 2, 'sesli sayfadaki metin ayrıştırıldı');
  await page.click('.sheet-layer.open [data-close]');
  await page.waitForTimeout(400);

  console.log('Arama');
  await page.click('.qb-search');
  await page.waitForSelector('.sheet-layer.open .search-box input');
  await page.fill('.sheet-layer.open .search-box input', 'mercimek');
  await page.waitForTimeout(400);
  const nRes = await page.$$eval('.sheet-layer.open [data-food]', e => e.length);
  check(nRes > 0, 'arama sonuç verdi: ' + nRes);
  await page.screenshot({ path: path.join(SHOTS, '11-search.png') });
  await page.click('.sheet-layer.open [data-food]');
  await page.waitForSelector('.sheet-layer.open .food-hero');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '12-food-detail.png') });

  console.log('Service worker / çevrimdışı');
  const swOk = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  check(swOk, 'service worker etkin');
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#quickbar:not([hidden])');
  const foodsOffline = await page.evaluate(() => Array.isArray(window.FOODS) ? window.FOODS.length : 0);
  check(foodsOffline > 0, 'çevrimdışı yeniden yükleme çalıştı (besin: ' + foodsOffline + ')');
  await ctx.setOffline(false);

  console.log('Koyu tema');
  const dark = await newPage('dark');
  await dark.page.goto(BASE, { waitUntil: 'load' });
  await dark.page.evaluate(s => localStorage.setItem('zayifla.data', s), await page.evaluate(() => localStorage.getItem('zayifla.data')));
  await dark.page.reload({ waitUntil: 'load' });
  await dark.page.waitForTimeout(400);
  await dark.page.screenshot({ path: path.join(SHOTS, '13-today-dark.png') });
  await dark.page.goto(BASE + '#ilerleme', { waitUntil: 'load' });
  await dark.page.waitForTimeout(400);
  await dark.page.screenshot({ path: path.join(SHOTS, '14-progress-dark.png'), fullPage: true });

  console.log('Bozuk veri dayanıklılığı');
  await dark.page.evaluate(() => localStorage.setItem('zayifla.data', '{bozuk json'));
  await dark.page.reload({ waitUntil: 'load' });
  check(await dark.page.$('.onb') !== null, 'bozuk veride onboarding ile temiz başlangıç');

  console.log('\nKonsol hataları: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'yok'));
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
