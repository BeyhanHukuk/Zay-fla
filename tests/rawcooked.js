#!/usr/bin/env node
/*
 * Çiğ / pişmiş ağırlık geçişi: onay sayfası, kayıt düzenleme, arama ile ekleme, koç özeti (Playwright, mobil).
 *   node tests/rawcooked.js
 */
'use strict';
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const SUB = '/zay-fla/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      if (!u.startsWith(SUB)) { rsp.writeHead(404); return rsp.end('not found'); }
      let f = path.join(ROOT, u.slice(SUB.length));
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

(async () => {
  const srv = await serve();
  const BASE = 'http://127.0.0.1:' + srv.address().port + SUB;
  const browser = await chromium.launch();
  const errors = [];
  let ok = true;
  const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) ok = false; };
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7'], { locale: 'tr-TR', timezoneId: 'Europe/Istanbul' }));
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.goto(BASE, { waitUntil: 'load' });

  console.log('Onboarding');
  await page.click('[data-ob="sex"][data-v="k"]'); await page.click('[data-ob="next"]');
  await page.fill('[data-obi="age"]', '32'); await page.fill('[data-obi="height"]', '165'); await page.click('[data-ob="next"]');
  await page.fill('[data-obi="weight"]', '78'); await page.fill('[data-obi="goal"]', '65'); await page.click('[data-ob="next"]');
  await page.click('[data-ob="activity"][data-v="hafif"]'); await page.click('[data-ob="next"]');
  await page.click('[data-ob="pace"][data-v="0.5"]'); await page.click('[data-ob="next"]');
  await page.click('[data-ob="next"]');
  await page.waitForSelector('#quickbar:not([hidden])');

  const sheet = '.sheet-layer.open';
  const num = async sel => parseInt((await page.textContent(sel)).replace(/\D/g, ''), 10);
  const kcalOf = () => num(sheet + ' .pitem .js-kcal');
  const entries = () => page.evaluate(() => { const s = window.Zayifla.state(); const k = Object.keys(s.days)[0]; return s.days[k].entries; });

  console.log('Onay sayfasında çiğ / pişmiş geçişi');
  await page.fill('#qb-input', '200 gram çiğ tavuk göğsü');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheet + ' .pitem');
  check(await page.$eval(sheet + ' .state-seg button.on', b => b.dataset.state) === 'raw', 'çiğ söylenince "Çiğ" seçili');
  const rawK = await kcalOf();
  check(rawK >= 220 && rawK <= 260, 'çiğ 200 g ~240 kcal: ' + rawK);
  check(/çiğ/.test(await page.textContent(sheet + ' .pitem-name b')), 'ad çiğ durumunu gösterir: ' + await page.textContent(sheet + ' .pitem-name b'));
  await page.click(sheet + ' .state-seg button[data-state="cooked"]');
  const cookK = await kcalOf();
  check(cookK >= 310 && cookK <= 350, 'Pişmiş seçilince ~330 kcal: ' + cookK);
  check(/pişmiş/.test(await page.textContent(sheet + ' .pitem-name b')), 'ad pişmiş olur');
  check(await page.$eval(sheet + ' .state-seg button.on', b => b.dataset.state) === 'cooked', 'düğme durumu güncellendi');
  check(Math.abs(await num(sheet + ' .totals b') - cookK) <= 1, 'toplam güncellendi: ' + (await page.textContent(sheet + ' .totals')).trim());
  await page.click(sheet + ' .state-seg button[data-state="raw"]');
  check(await kcalOf() === rawK, 'Çiğ’e dönünce kalori geri gelir');
  await page.click(sheet + ' [data-fact="add"]');
  await page.waitForTimeout(500);
  let list = await entries(), entry = list[0];
  check(entry.state === 'raw' && /çiğ/.test(entry.name) && entry.grams === 200 && Math.abs(entry.kcal - rawK) <= 1, 'kayıt çiğ olarak saklandı: ' + entry.name + ' ' + entry.kcal);
  check(/\(çiğ\)/.test(await page.textContent('#view')), 'günlük listesinde durum görünür');

  console.log('Kaydı düzenlerken geçiş');
  await page.click('.entry[data-action="entry"]');
  await page.waitForSelector(sheet + ' .js-u');
  check(await page.$eval(sheet + ' .state-seg button.on', b => b.dataset.state) === 'raw', 'kayıt ayrıntısında Çiğ seçili');
  check(/çiğ/.test(await page.textContent(sheet + ' .js-100')), '100 g satırı durumu belirtir: ' + await page.textContent(sheet + ' .js-100'));
  await page.click(sheet + ' .state-seg button[data-state="cooked"]');
  const dk = await num(sheet + ' .js-k');
  check(dk >= 310 && dk <= 350, 'ayrıntıda pişmiş ~330 kcal: ' + dk);
  await page.click(sheet + ' [data-ok]');
  await page.waitForTimeout(500);
  entry = (await entries())[0];
  check(entry.state === 'cooked' && /pişmiş/.test(entry.name) && entry.kcal >= 310 && entry.kcal <= 350, 'kayıt pişmiş olarak güncellendi: ' + entry.name + ' ' + entry.kcal);

  console.log('Arama ile ekleme');
  await page.click('[data-action="search"]');
  await page.waitForSelector(sheet + ' input[type="search"]');
  await page.fill(sheet + ' input[type="search"]', 'makarna');
  await page.waitForSelector(sheet + ' [data-food="makarna"]');
  const mk = await page.$$eval(sheet + ' [data-food]', els => els.map(e => e.dataset.food));
  check(mk.includes('makarna'), 'aramada makarna bulundu');
  await page.click(sheet + ' [data-food="makarna"]');
  await page.waitForSelector(sheet + ' .state-seg');
  check(await page.$eval(sheet + ' .state-seg button.on', b => b.dataset.state) === 'cooked', 'makarna varsayılan pişmiş');
  await page.selectOption(sheet + ' .js-u', 'g');
  await page.fill(sheet + ' .js-q', '100');
  await page.dispatchEvent(sheet + ' .js-q', 'input');
  let mkcal = await num(sheet + ' .js-k');
  check(mkcal >= 150 && mkcal <= 160, '100 g pişmiş makarna ~158: ' + mkcal);
  await page.click(sheet + ' .state-seg button[data-state="raw"]');
  mkcal = await num(sheet + ' .js-k');
  check(mkcal >= 350 && mkcal <= 375, '100 g kuru makarna ~371: ' + mkcal);
  await page.click(sheet + ' [data-ok]');
  await page.waitForTimeout(500);
  list = await entries();
  check(list.length === 2 && list[1].state === 'raw' && /çiğ/.test(list[1].name), 'makarna çiğ olarak eklendi: ' + (list[1] && list[1].name));

  console.log('Koç özeti ve diğer');
  const cd = await page.evaluate(() => window.Zayifla.coachContext());
  const names = cd.bugun.kayitlar.map(k => k[1]);
  check(names.some(n => /\(çiğ\)/.test(n)) && names.some(n => /\(pişmiş\)/.test(n)), 'koç verisi çiğ/pişmiş durumunu içerir: ' + JSON.stringify(names));
  check(/\(çiğ\) \/ \(pişmiş\)/.test(fs.readFileSync(path.join(ROOT, 'coach.js'), 'utf8')), 'koç sistem istemi durumu açıklar');
  await page.fill('#qb-input', 'çiğ köfte');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheet + ' .pitem');
  check(await page.$(sheet + ' .state-seg') === null && /Çiğ köfte/.test(await page.textContent(sheet + ' .pitem-name b')), '"çiğ köfte" yemek olarak kalır, geçiş yok');
  await page.click(sheet + ' [data-act="remove"]');

  console.log('Yaklaşık eşleşme ve öneri çipleri');
  await page.fill('#qb-input', 'iki adet tavuk pirzoloo');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheet + ' .pitem, ' + sheet + ' .unmatched');
  const pit = await page.$$eval(sheet + ' .pitem-name b', els => els.map(e => e.textContent));
  check(pit.length === 1 && /Tavuk pirzola/.test(pit[0]), 'yazım hatalı "tavuk pirzoloo" yine de bulunur: ' + pit.join('|'));
  await page.click(sheet + ' [data-act="remove"]');
  await page.fill('#qb-input', 'bir tabak pirzolaa tavukk');
  await page.press('#qb-input', 'Enter');
  await page.waitForSelector(sheet + ' .pitem, ' + sheet + ' .unmatched');
  const chips = await page.$$(sheet + ' .unmatched [data-uact="sug"]');
  const items2 = await page.$$(sheet + ' .pitem');
  check(chips.length >= 1 || items2.length >= 1, 'bilinmeyen kelimede öneri çipi veya yaklaşık eşleşme sunulur (' + chips.length + ' çip, ' + items2.length + ' kalem)');
  if (chips.length) {
    await chips[0].click();
    check((await page.$$(sheet + ' .pitem')).length >= 1, 'öneri çipine basınca kalem eklenir');
  }

  check(!errors.length, 'konsol/sayfa hatası yok' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(ok ? '\nTAMAM' : '\nBAŞARISIZ');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
