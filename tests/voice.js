#!/usr/bin/env node
/*
 * Dokunmalı sesli giriş testi (Playwright). SpeechRecognition addInitScript ile taklit edilir; gerçek anahtar yok.
 *   node tests/voice.js
 * Beklenen: mikrofon yalnızca ikinci dokunuşla kapanır; sessizlikte (onend) kendiliğinden yeniden başlar,
 * metin korunur, tekrar eden final sonuçlar tek sayılır, izin hatasında döngü yok.
 */
'use strict';
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUB = '/zay-fla/';
const API = 'https://api.anthropic.com/v1/messages';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const FAKE_KEY = 'sk-ant-SAHTE-test-' + 'x'.repeat(24) + 'ABCD'; // gerçek anahtar değil

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
function seedState() {
  const weights = [];
  for (let i = 25; i >= 0; i -= 3) weights.push({ date: daysAgo(i), kg: 80 - (25 - i) * 0.05 });
  return { v: 1, createdAt: Date.now(), profile: { sex: 'k', age: 32, height: 165, weight: 80, goal: 65, activity: 'hafif', pace: 0.5, startDate: daysAgo(30) }, days: {}, weights };
}

// Sahte SpeechRecognition: tarayıcının Android Chrome davranışını elle sürmek için
const FAKE_SR = () => {
  window.__sr = []; window.__vib = [];
  navigator.vibrate = p => { window.__vib.push(p); return true; };
  class FakeSR {
    constructor() { this.started = false; window.__sr.push(this); }
    start() { if (this.started) throw new DOMException('already started', 'InvalidStateError'); this.started = true; setTimeout(() => this.onstart && this.onstart(), 10); }
    stop() { if (!this.started) return; this.started = false; setTimeout(() => this.onend && this.onend(), 20); }
    abort() { if (!this.started) return; this.started = false; setTimeout(() => this.onend && this.onend(), 5); }
  }
  const mk = list => { const r = list.map(x => { const a = [{ transcript: x.t }]; a.isFinal = !!x.f; return a; }); return r; };
  window.__emit = (n, idx, list) => { const i = window.__sr[n]; i.onresult && i.onresult({ resultIndex: idx, results: mk(list) }); };
  window.__silence = n => { const i = window.__sr[n]; i.started = false; i.onend && i.onend(); };
  window.__err = (n, code) => { const i = window.__sr[n]; i.onerror && i.onerror({ error: code }); };
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
};

let ok = true, nPass = 0, nFail = 0;
const errors = [];
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (cond) nPass++; else { nFail++; ok = false; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const BASE = 'http://127.0.0.1:' + srv.address().port + SUB;
  const browser = await chromium.launch();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  const apiLog = [];

  async function fresh(hash, withCoach) {
    const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7'], { locale: 'tr-TR', timezoneId: 'Europe/Istanbul' }));
    await ctx.addInitScript(FAKE_SR);
    await ctx.route(API, async route => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { /* */ }
      apiLog.push(body);
      return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tamam.' }], usage: {} }) });
    });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/api\.anthropic\.com|Failed to load resource/.test(m.text() + (m.location().url || ''))) errors.push('[console] ' + m.text()); });
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.evaluate(([s, k, c]) => {
      localStorage.clear(); localStorage.setItem('zayifla.data', JSON.stringify(s));
      if (c) localStorage.setItem('zayifla.coach', JSON.stringify({ provider: 'anthropic', key: k, model: 'fast', mode: 'chat' }));
    }, [seedState(), FAKE_KEY, !!withCoach]);
    await page.goto(BASE + hash, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#tabbar:not([hidden])');
    return { ctx, page };
  }
  const nInst = p => p.evaluate(() => window.__sr.length);
  const emit = (p, n, idx, list) => p.evaluate(([n, idx, list]) => window.__emit(n, idx, list), [n, idx, list]);
  const silence = (p, n) => p.evaluate(n => window.__silence(n), n);
  const confirmItems = p => p.$$eval('.pitem', els => els.map(e => ({ name: e.querySelector('.pitem-name b').textContent, qty: e.querySelector('[data-act="qty"]').value })));

  /* ---------------- Bugün: sesle ekle ---------------- */
  console.log('Bugün: dokunmalı mikrofon (sessizlik → otomatik yeniden başlatma → tekrar eden sonuç → ikinci dokunuş)');
  let { ctx, page } = await fresh('#bugun');
  await page.click('#quickbar .qb-mic');
  await page.waitForSelector('.mic-big.listening');
  check(await nInst(page) === 1, 'dokununca tek oturum açıldı');
  const cfg = await page.evaluate(() => ({ c: window.__sr[0].continuous, i: window.__sr[0].interimResults, l: window.__sr[0].lang }));
  check(cfg.c === true && cfg.i === true && cfg.l === 'tr-TR', 'continuous=true, interimResults=true, lang=tr-TR');
  check(/bitirince dokun/.test(await page.textContent('.js-st')), 'durum: “Dinliyorum… bitirince dokun”');
  check(await page.isVisible('[data-cancel]'), '“İptal” seçeneği görünür');
  check((await page.evaluate(() => window.__vib)).length >= 1, 'başlangıçta titreşim');

  await emit(page, 0, 0, [{ t: '2 yumurta', f: true }, { t: 've 1 bardak', f: false }]);
  check(/2 yumurta/.test(await page.textContent('.js-live')) && /ve 1 bardak/.test(await page.textContent('.js-live')), 'canlı metin: final + geçici');
  await silence(page, 0); // Chrome sessizlikte oturumu bitirdi
  await page.waitForFunction(() => window.__sr.length === 2, null, { timeout: 3000 });
  check(true, 'onend sonrası otomatik yeniden başlatıldı');
  check(await page.isHidden('.pitem') || (await page.$$('.pitem')).length === 0, 'dokunmadan işlem yapılmadı (onay ekranı yok)');
  check(await page.isVisible('.mic-big.listening'), 'mikrofon hâlâ aktif');
  check(/2 yumurta/.test(await page.inputValue('.js-txt')) && /ve 1 bardak/.test(await page.inputValue('.js-txt')), 'duraklamadan önceki metin kaybolmadı (geçici kısım dahil)');

  await emit(page, 1, 0, [{ t: 'bir bardak çay', f: true }]);
  await emit(page, 1, 0, [{ t: 'bir bardak çay', f: true }]);                       // aynı final yeniden geldi
  await emit(page, 1, 1, [{ t: 'bir bardak çay', f: true }, { t: 'bir bardak çay', f: true }]); // results büyüdü, aynı içerik
  await emit(page, 1, 1, [{ t: 'bir bardak çay', f: true }, { t: '5 zeytin', f: false }]);
  const live = await page.inputValue('.js-txt');
  check((live.match(/çay/g) || []).length === 1, 'tekrar eden final sonuçlar tek sayıldı: “' + live + '”');
  await sleep(1200);
  check(await nInst(page) === 2 && (await page.$$('.pitem')).length === 0, 'ek sessizlik olmadan yeni oturum/işlem yok');

  await page.click('.mic-big'); // ikinci dokunuş
  await page.waitForSelector('.pitem', { timeout: 5000 });
  const items = await confirmItems(page);
  check(items.length === 3, 'ikinci dokunuş: tam metin işlendi (3 kalem, geçici “5 zeytin” dahil)' + ' → ' + JSON.stringify(items));
  check(items[0] && items[0].qty === '2' && items[1] && items[1].qty === '1', 'miktarlar doğru (2 yumurta, 1 çay: tekrar yok)');
  check(await nInst(page) === 2, 'durdurduktan sonra yeniden başlatma yok');
  await ctx.close();

  console.log('Bugün: İptal metni atar');
  ({ ctx, page } = await fresh('#bugun'));
  await page.click('#quickbar .qb-mic'); await page.waitForSelector('.mic-big.listening');
  await emit(page, 0, 0, [{ t: '3 simit', f: true }]);
  await page.click('[data-cancel]');
  await sleep(500);
  check(await page.inputValue('.js-txt') === '' && (await page.$$('.pitem')).length === 0, 'İptal: metin atıldı, işlem yok');
  check(await page.$('.mic-big.listening') === null && await nInst(page) === 1, 'İptal: mikrofon kapandı, yeniden başlamadı');
  await ctx.close();

  console.log('Bugün: izin hatası döngü yapmaz');
  ({ ctx, page } = await fresh('#bugun'));
  await page.click('#quickbar .qb-mic'); await page.waitForSelector('.mic-big.listening');
  await page.evaluate(() => { window.__err(0, 'not-allowed'); window.__silence(0); });
  await sleep(1500);
  check(await nInst(page) === 1, 'not-allowed: yeniden başlatma yok');
  check(/Mikrofon izni verilmedi/.test(await page.textContent('.js-st')) && await page.$('.mic-big.listening') === null, 'not-allowed: Türkçe mesaj gösterildi, dinleme durdu');
  await ctx.close();

  console.log('Bugün: sayfa gizlenince dinleme durur, metin kutuda kalır');
  ({ ctx, page } = await fresh('#bugun'));
  await page.click('#quickbar .qb-mic'); await page.waitForSelector('.mic-big.listening');
  await emit(page, 0, 0, [{ t: 'iki dilim ekmek', f: true }]);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(600);
  check(await page.inputValue('.js-txt') === 'iki dilim ekmek' && (await page.$$('.pitem')).length === 0 && await page.$('.mic-big.listening') === null, 'gizlenince durdu, metin korundu, işlenmedi');
  await ctx.close();

  /* ---------------- Koç ---------------- */
  console.log('Koç: aynı akış');
  ({ ctx, page } = await fresh('#koc', true));
  await page.waitForSelector('#coachbar .qb-mic:not([hidden])');
  const before = apiLog.length;
  await page.click('#coachbar .qb-mic');
  await page.waitForSelector('#coachbar .qb-mic.listening');
  check(await nInst(page) === 1 && await page.evaluate(() => window.__sr[0].continuous === true && window.__sr[0].interimResults === true), 'koç: continuous + interimResults');
  check(/bitirince dokun/.test(await page.getAttribute('#coach-input', 'placeholder')) && await page.isVisible('#coachbar .qb-cancel'), 'koç: etiket ve İptal görünür');
  await emit(page, 0, 0, [{ t: 'iki yumurta', f: true }]);
  await silence(page, 0);
  await page.waitForFunction(() => window.__sr.length === 2, null, { timeout: 3000 });
  await emit(page, 1, 0, [{ t: 'iki yumurta', f: true }, { t: 've bir bardak', f: false }]); // yeniden teslim edilen final + geçici
  await emit(page, 1, 0, [{ t: 'iki yumurta', f: true }, { t: 've bir bardak çay', f: true }]);
  await sleep(1000);
  check(apiLog.length === before, 'koç: dokunmadan gönderilmedi');
  check(await page.inputValue('#coach-input') === 'iki yumurta ve bir bardak çay', 'koç: kutudaki metin birleşik ve tekrarsız → “' + await page.inputValue('#coach-input') + '”');
  await silence(page, 1);      // ikinci sessizlik
  await page.click('#coachbar .qb-mic'); // yeniden başlatma beklerken (rec yok) dokun
  await sleep(1500);
  check(apiLog.length === before + 1, 'koç: ikinci dokunuşta bir kez gönderildi');
  const sent = apiLog[apiLog.length - 1];
  const lastUser = sent && sent.messages && sent.messages.filter(m => m.role === 'user').pop();
  check(lastUser && /iki yumurta ve bir bardak çay$/.test(String(lastUser.content)) && (String(lastUser.content).match(/yumurta/g) || []).length === 1, 'koç: gönderilen metin tam ve tekrarsız');
  check(await nInst(page) === 2, 'koç: durdurduktan sonra yeniden başlatma yok');
  await ctx.close();

  console.log('Koç: İptal ve izin hatası');
  ({ ctx, page } = await fresh('#koc', true));
  await page.waitForSelector('#coachbar .qb-mic:not([hidden])');
  const b2 = apiLog.length;
  await page.click('#coachbar .qb-mic'); await page.waitForSelector('#coachbar .qb-mic.listening');
  await emit(page, 0, 0, [{ t: 'merhaba koç', f: true }]);
  await page.click('#coachbar .qb-cancel');
  await sleep(600);
  check(await page.inputValue('#coach-input') === '' && apiLog.length === b2 && await nInst(page) === 1 && await page.$('#coachbar .qb-mic.listening') === null, 'koç: İptal metni attı, gönderilmedi, yeniden başlamadı');
  await page.click('#coachbar .qb-mic'); await page.waitForSelector('#coachbar .qb-mic.listening');
  await page.evaluate(() => { window.__err(1, 'service-not-allowed'); window.__silence(1); });
  await sleep(1500);
  check(await nInst(page) === 2 && await page.$('#coachbar .qb-mic.listening') === null && apiLog.length === b2, 'koç: service-not-allowed döngü yapmaz, gönderilmez');
  check(/Konuşma tanıma bu cihazda kullanılamıyor/.test(await page.evaluate(() => document.querySelector('#toasts').textContent)), 'koç: Türkçe hata mesajı');
  await ctx.close();

  await browser.close();
  srv.close();
  console.log('\nKonsol/sayfa hataları: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'yok'));
  if (errors.length) ok = false;
  console.log(`\n${nPass} geçti, ${nFail} kaldı`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
