#!/usr/bin/env node
/*
 * Yapay zeka koçu testi (Playwright). Gerçek anahtar kullanmaz: Anthropic uç noktası page.route ile taklit edilir.
 * Klasörü /zay-fla/ altında kendi sunucusuyla sunar.
 *   node tests/coach.js [ekran-görüntüsü-klasörü]
 */
'use strict';
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv[2] || path.join(os.tmpdir(), 'zayifla-coach');
fs.mkdirSync(SHOTS, { recursive: true });
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
  const days = {};
  for (let i = 1; i <= 10; i++) days[daysAgo(i)] = { entries: [{ id: 'e' + i, name: 'Mercimek çorbası', qty: 1, unit: 'kase', unitG: 250, grams: 250, kcal: 1500 + i * 20, p: 60, c: 180, f: 50, meal: 'aksam', ts: 1 }], water: 4 };
  days[daysAgo(0)] = { entries: [{ id: 't1', name: 'Simit', qty: 1, unit: 'adet', unitG: 120, grams: 120, kcal: 330, p: 10, c: 60, f: 6, meal: 'kahvalti', ts: 1 }], water: 2 };
  const weights = [];
  for (let i = 25; i >= 0; i -= 3) weights.push({ date: daysAgo(i), kg: 80 - (25 - i) * 0.05 });
  return { v: 1, createdAt: Date.now(), profile: { sex: 'k', age: 32, height: 165, weight: 80, goal: 65, activity: 'hafif', pace: 0.5, startDate: daysAgo(30) }, days, weights };
}

let ok = true, nPass = 0, nFail = 0;
const errors = [];
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (cond) nPass++; else { nFail++; ok = false; } }

(async () => {
  const srv = await serve();
  const BASE = 'http://127.0.0.1:' + srv.address().port + SUB;
  const browser = await chromium.launch();

  // API taklidi: her bağlam kendi senaryosunu kullanır
  const apiLog = [];
  let nextReply = null;
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  async function apiRoute(route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { /* */ }
    apiLog.push({ headers: req.headers(), body });
    const r = typeof nextReply === 'function' ? nextReply(body) : nextReply;
    if (r && r.abort) return route.abort('internetdisconnected');
    return route.fulfill({ status: (r && r.status) || 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify((r && r.json) || {}) });
  }
  const textReply = t => ({ json: { id: 'msg_1', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: t }], usage: {} } });

  async function newCtx(extra, init) {
    const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7'], { locale: 'tr-TR', timezoneId: 'Europe/Istanbul' }, extra || {}));
    await ctx.route(API, apiRoute);
    await ctx.route('https://claude.ai/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>claude</title>ok' }));
    if (init) await ctx.addInitScript(init);
    return ctx;
  }
  function watch(page, tag) {
    page.on('console', m => { if (m.type() === 'error' && !/api\.anthropic\.com|Failed to load resource/.test(m.text() + (m.location().url || ''))) errors.push(`[${tag} console] ${m.text()}`); });
    page.on('pageerror', e => errors.push(`[${tag} pageerror] ${e.message}`));
  }
  async function seeded(ctx, tag) {
    const page = await ctx.newPage(); watch(page, tag);
    await page.goto(BASE, { waitUntil: 'load' });
    await page.evaluate(s => { localStorage.clear(); localStorage.setItem('zayifla.data', JSON.stringify(s)); }, seedState());
    await page.goto(BASE + '#koc', { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#tabbar:not([hidden])');
    return page;
  }
  async function noOverflow(page, where) {
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, wide = [];
      document.querySelectorAll('#view *, #tabbar *, #coachbar *').forEach(e => {
        const st = getComputedStyle(e);
        if (st.display === 'none' || e.closest('svg')) return;
        let a = e.parentElement, inScroller = false;
        while (a && a !== document.body) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll') { inScroller = true; break; } a = a.parentElement; }
        if (inScroller) return;
        const b = e.getBoundingClientRect();
        if (b.width && (b.right > vw + 1 || b.left < -1)) wide.push((e.className && e.className.baseVal === undefined ? e.className : e.tagName) + ':' + Math.round(b.left) + '-' + Math.round(b.right));
      });
      const bad = (document.body.innerText.match(/\b(NaN|undefined|Infinity)\b|\[object/g) || []);
      return { over: document.documentElement.scrollWidth > vw + 1, wide: wide.slice(0, 6), bad };
    });
    check(!r.over && !r.wide.length && !r.bad.length, `${where}: taşma/NaN yok` + (r.over || r.wide.length || r.bad.length ? ' → ' + r.wide.join(' | ') + ' ' + r.bad.join(',') : ''));
  }
  const S = page => page.evaluate(() => window.Zayifla.state());
  const lastMsgText = page => page.$eval('#coach-log .msg:last-child .bubble', e => e.innerText);

  /* ------------------------- Anahtarsız: ücretsiz yol ------------------------- */
  console.log('Anahtarsız: “Claude uygulamasında sor” (paylaşım menüsü)');
  const ctxA = await newCtx(null, () => {
    window.__shared = null; window.__clip = null;
    navigator.share = t => { window.__shared = t.text; return Promise.resolve(); };
    if (navigator.clipboard) navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); };
  });
  const pA = await seeded(ctxA, 'A');
  check(await pA.isVisible('a[data-tab="koc"]'), 'alt menüde Koç sekmesi var');
  check(await pA.isVisible('[data-action="coach-ask-app"]'), 'anahtar yokken varsayılan mod: Claude uygulamasında sor');
  check(await pA.isHidden('#coachbar'), 'ücretsiz modda sohbet çubuğu gizli');
  await pA.click('[data-action="coach-chip"][data-q="Akşam ne yesem?"]');
  check(await pA.inputValue('#coach-q-app') === 'Akşam ne yesem?', 'hızlı soru çipi metin kutusunu doldurdu');
  await pA.click('[data-action="coach-ask-app"]');
  await pA.waitForTimeout(200);
  const shared = await pA.evaluate(() => window.__shared);
  const clip = await pA.evaluate(() => window.__clip);
  check(!!shared && /koçusun/.test(shared) && /<veriler>/.test(shared) && /Sorum: Akşam ne yesem\?/.test(shared), 'paylaşılan metin: rol + veriler + soru');
  const sj = shared && JSON.parse(shared.split('<veriler>\n')[1].split('\n</veriler>')[0]);
  check(sj && sj.gunluk_hedef.kcal > 1000 && sj.bugun.kayitlar.length === 1 && sj.son_14_gun_kcal.degerler.length === 14 && sj.kilo.son_30_gun.length > 3 && typeof sj.seri_gun === 'number', 'veri özeti: hedef, bugün, 14 gün, kilo, seri');
  check(shared && shared.length < 4000, 'özet küçük (' + (shared || '').length + ' karakter)');
  check(clip === shared, 'aynı metin panoya da kopyalandı');
  check(apiLog.length === 0, 'ücretsiz yol API çağrısı yapmadı');
  await pA.screenshot({ path: path.join(SHOTS, 'coach-01-app-mode.png'), fullPage: true });

  console.log('Paylaşım yoksa claude.ai açılır');
  const ctxB = await newCtx(null, () => { try { delete Navigator.prototype.share; } catch (e) { /* */ } navigator.share = undefined; });
  const pB = await seeded(ctxB, 'B');
  const [popup] = await Promise.all([ctxB.waitForEvent('page', { timeout: 5000 }).catch(() => null), pB.click('[data-action="coach-ask-app"]')]);
  check(popup && /claude\.ai\/new/.test(popup.url()), 'claude.ai/new yeni sekmede açıldı: ' + (popup && popup.url()));
  const toastB = await pB.waitForSelector('.toast', { timeout: 3000 }).then(e => e.innerText()).catch(() => '');
  check(/Kopyalandı, Claude'a yapıştır/.test(toastB), 'toast: ' + toastB);
  await ctxB.close();

  /* ------------------------- Anahtarsız sohbet modu ------------------------- */
  console.log('Anahtarsız sohbet modu');
  await pA.click('[data-action="coach-mode"][data-v="chat"]');
  const empty = await pA.textContent('#view');
  check(/API anahtarı gerekli/.test(empty), 'boş durum: anahtar gerekli mesajı');
  await pA.click('[data-action="coach-settings"]');
  await pA.waitForSelector('#coach-key');
  check((await pA.evaluate(() => location.hash)) === '#ayarlar', 'Ayarlara git → Ayarlar');
  const help = await pA.textContent('#view');
  check(/console\.anthropic\.com/.test(help) && /Billing/.test(help) && /Create Key/.test(help) && /yalnızca bu telefonda/.test(help), 'yardım metni ve gizlilik notu var');
  check(await pA.getAttribute('#coach-key', 'type') === 'password', 'anahtar alanı maskeli');

  /* ------------------------------ Anahtar kaydı ------------------------------ */
  console.log('Anahtar kaydet / test et');
  await pA.fill('#coach-key', 'merhaba');
  await pA.click('[data-action="coach-key-save"]');
  check(!(await pA.evaluate(() => JSON.parse(localStorage.getItem('zayifla.coach') || '{}').key)), 'geçersiz biçimli anahtar kaydedilmedi');
  await pA.fill('#coach-key', '  ' + FAKE_KEY + ' ');
  await pA.click('[data-action="coach-key-save"]');
  await pA.waitForSelector('#coach-key-mask');
  const masked = await pA.textContent('#coach-key-mask');
  check(!masked.includes(FAKE_KEY) && /sk-ant-…ABCD/.test(masked), 'anahtar maskeli gösteriliyor: ' + masked);
  check(!(await pA.content()).includes(FAKE_KEY), 'tam anahtar DOM\'da yok');
  const stored = await pA.evaluate(() => JSON.parse(localStorage.getItem('zayifla.coach')));
  check(stored.key === FAKE_KEY, 'anahtar localStorage\'da (boşluklar temizlendi)');
  check(!(await pA.evaluate(() => localStorage.getItem('zayifla.data'))).includes(FAKE_KEY), 'anahtar ana veride / yedekte yok');
  nextReply = textReply('Merhaba');
  await pA.click('#coach-test');
  const tt = await pA.waitForSelector('.toast >> text=Bağlantı başarılı', { timeout: 4000 }).then(() => true).catch(() => false);
  check(tt, 'Bağlantıyı test et → başarılı');
  const h0 = apiLog[apiLog.length - 1].headers;
  check(h0['x-api-key'] === FAKE_KEY && h0['anthropic-dangerous-direct-browser-access'] === 'true' && !!h0['anthropic-version'], 'başlıklar: x-api-key, direct-browser-access, anthropic-version');
  nextReply = { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } };
  await pA.click('#coach-test');
  const t401 = await pA.waitForSelector('.toast >> text=geçersiz', { timeout: 4000 }).then(() => true).catch(() => false);
  check(t401, 'test 401 → “anahtar geçersiz” mesajı');

  /* ------------------------------ Sohbet ------------------------------ */
  console.log('Sohbet');
  await pA.click('a[data-tab="koc"]');
  await pA.waitForSelector('#coachbar:not([hidden])');
  check(await pA.isVisible('#coach-input') && await pA.isVisible('#coachbar .qb-mic'), 'anahtar varken sohbet çubuğu (yazı + mikrofon)');
  nextReply = textReply('Bugün **330 kcal** aldın, hedefinin altındasın. Öğlen protein ağırlıklı bir öğün iyi olur.');
  await pA.click('[data-action="coach-chip"][data-q="Bugün nasıl gidiyorum?"]');
  await pA.waitForFunction(() => /330 kcal/.test(document.querySelector('#coach-log').innerText));
  check(/330 kcal/.test(await lastMsgText(pA)), 'koç cevabı balonda');
  check(await pA.$eval('#coach-log .msg:last-child .bubble b', e => e.textContent) === '330 kcal', 'kalın yazı biçimlendirmesi');
  const req1 = apiLog[apiLog.length - 1].body;
  const um = req1.messages[req1.messages.length - 1];
  check(req1.model === 'claude-haiku-5-5', 'varsayılan model claude-haiku-5-5');
  check(/koçusun/.test(req1.system) && /doktor/i.test(req1.system) && /log_food/.test(req1.system), 'sistem istemi: rol, doktor uyarısı, araç kuralı');
  check(typeof um.content === 'string' && /<veriler>/.test(um.content) && /Bugün nasıl gidiyorum\?$/.test(um.content), 'son kullanıcı mesajında veriler + soru');
  check(req1.tools && req1.tools[0].name === 'log_food' && req1.tools[0].input_schema.required.includes('kcal'), 'log_food aracı tanımlı');
  check(req1.messages[0].role === 'user' && !req1.temperature, 'mesajlar user ile başlıyor');
  check(JSON.stringify(req1).length < 9000, 'istek boyutu küçük (' + JSON.stringify(req1).length + ' bayt)');

  console.log('Araç çağrısı → onay kartı → kayıt');
  nextReply = {
    json: {
      id: 'msg_2', type: 'message', role: 'assistant', stop_reason: 'tool_use', content: [
        { type: 'text', text: 'Afiyet olsun! Karnıyarığı ve ayranı ekleyeyim mi?' },
        { type: 'tool_use', id: 'tu_1', name: 'log_food', input: { name: 'Karnıyarık (1 tabak)', grams: 300, kcal: 420, protein: 16, carb: 22, fat: 30, meal: 'ogle' } },
        { type: 'tool_use', id: 'tu_2', name: 'log_food', input: { name: 'Ayran', grams: 200, kcal: 76, protein: 4, carb: 6, fat: 4, meal: 'ogle' } }
      ]
    }
  };
  await pA.fill('#coach-input', 'öğlen bir tabak karnıyarık ve ayran yedim');
  await pA.press('#coach-input', 'Enter');
  await pA.waitForSelector('.coach-card');
  check((await pA.$$('.coach-card')).length === 2, 'iki onay kartı gösterildi');
  check(/Karnıyarık/.test(await pA.textContent('.coach-card')) && /420/.test(await pA.textContent('.coach-card')), 'kart: ad ve kalori');
  const before = (await S(pA)).days[daysAgo(0)].entries.length;
  check(before === 1, 'onaydan önce kayıt eklenmedi');
  await pA.screenshot({ path: path.join(SHOTS, 'coach-02-card.png'), fullPage: true });
  await pA.locator('.coach-card').first().locator('[data-action="coach-add"]').click();
  await pA.waitForTimeout(150);
  await pA.click('.coach-card:not(.added) [data-action="coach-skip"]');
  await pA.waitForTimeout(150);
  const st = await S(pA);
  const added = st.days[daysAgo(0)].entries.filter(e => /Karnıyarık/.test(e.name));
  check(added.length === 1 && added[0].kcal === 420 && added[0].meal === 'ogle' && added[0].grams === 300 && added[0].p === 16, 'Ekle → günlüğe kaydedildi (420 kcal, öğle, 300 g)');
  check(!st.days[daysAgo(0)].entries.some(e => e.name === 'Ayran'), 'Vazgeç → kaydedilmedi');
  check(/Eklendi/.test(await pA.textContent('.coach-card.added')) && (await pA.$$('.coach-card.skipped')).length === 1, 'kart durumları güncellendi');
  await pA.reload({ waitUntil: 'load' });
  check((await pA.$$('.coach-card.added')).length === 1 && (await pA.$$('#coach-log .msg')).length === 4, 'sohbet ve kart durumu yenilemeden sonra korunuyor');
  await pA.click('a[data-tab="bugun"]');
  check(/Karnıyarık/.test(await pA.textContent('#view')), 'Bugün ekranında yeni kayıt görünüyor');
  await pA.click('a[data-tab="koc"]');

  nextReply = textReply('Tamam.');
  await pA.fill('#coach-input', 'teşekkürler');
  await pA.press('#coach-input', 'Enter');
  await pA.waitForFunction(() => /Tamam/.test(document.querySelector('#coach-log .msg:last-child').innerText));
  const req3 = apiLog[apiLog.length - 1].body;
  check(req3.messages.length === 5 && req3.messages.every((m, i) => m.role === (i % 2 ? 'assistant' : 'user')), 'geçmiş sırayla user/assistant gönderiliyor');
  check(/kullanıcı ekledi/.test(req3.messages[3].content) && /kullanıcı vazgeçti/.test(req3.messages[3].content), 'kart sonuçları koça bildiriliyor');
  check(req3.messages.filter(m => /<veriler>/.test(m.content)).length === 1, 'veriler yalnızca son mesajda (token tasarrufu)');

  /* ------------------------------ Hatalar ------------------------------ */
  console.log('Hata mesajları');
  async function errCase(reply, re, label) {
    nextReply = reply;
    await pA.fill('#coach-input', 'soru ' + label);
    await pA.press('#coach-input', 'Enter');
    const t = await pA.waitForSelector('#coach-log .msg.err:last-child', { timeout: 4000 }).then(e => e.innerText()).catch(() => '');
    check(re.test(t), label + ' → ' + t.split('\n')[0].slice(0, 70));
    return t;
  }
  await errCase({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }, /API anahtarı geçersiz/, '401');
  check(await pA.isVisible('.msg.err [data-action="coach-settings"]'), '401 hatasında Ayarlar bağlantısı');
  nextReply = textReply('Şimdi oldu.');
  await pA.click('[data-action="coach-retry"]');
  await pA.waitForFunction(() => /Şimdi oldu/.test(document.querySelector('#coach-log .msg:last-child').innerText));
  check(!(await pA.$('.msg.err')), 'Tekrar dene → hata balonu kalktı, cevap geldi');
  await errCase({ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } }, /kredi/, 'kredi yok (400)');
  await errCase({ status: 402, json: { type: 'error', error: { type: 'billing_error', message: 'billing' } } }, /kredi/, 'billing (402)');
  await errCase({ status: 429, json: { type: 'error', error: { type: 'rate_limit_error', message: 'rate' } } }, /Çok sık/, 'limit (429)');
  await errCase({ status: 529, json: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }, /yoğun/, 'aşırı yük (529)');
  await errCase({ status: 200, json: { id: 'm', type: 'message', role: 'assistant', stop_reason: 'refusal', content: [] } }, /cevap veremedi/, 'refusal');
  await errCase({ abort: true }, /ulaşılamadı|İnternet/, 'ağ hatası');
  const nReq = apiLog.length;
  await ctxA.setOffline(true);
  await errCase(null, /İnternet bağlantısı yok/, 'çevrimdışı');
  check(apiLog.length === nReq, 'çevrimdışıyken istek gönderilmedi');
  await pA.click('a[data-tab="bugun"]');
  await pA.fill('#qb-input', '2 yumurta');
  await pA.press('#qb-input', 'Enter');
  const offOk = await pA.waitForSelector('.sheet-layer.open', { timeout: 3000 }).then(() => true).catch(() => false);
  check(offOk, 'çevrimdışıyken Bugün ekranı ve çevrimdışı ayrıştırıcı çalışıyor');
  await pA.keyboard.press('Escape').catch(() => { });
  await pA.goBack().catch(() => { });
  await ctxA.setOffline(false);
  await pA.click('a[data-tab="koc"]');
  await pA.screenshot({ path: path.join(SHOTS, 'coach-03-errors.png'), fullPage: true });

  console.log('Model seçimi ve sohbet sınırı');
  await pA.click('a[data-tab="ayarlar"]');
  await pA.click('[data-action="coach-model"][data-v="smart"]');
  await pA.click('a[data-tab="koc"]');
  nextReply = textReply('Akıllı cevap.');
  await pA.fill('#coach-input', 'merhaba');
  await pA.press('#coach-input', 'Enter');
  await pA.waitForFunction(() => /Akıllı cevap/.test(document.querySelector('#coach-log .msg:last-child').innerText));
  const reqS = apiLog[apiLog.length - 1];
  check(reqS.body.model === 'claude-sonnet-5-5', '“Daha akıllı” → claude-sonnet-5-5');
  const chatLen = await pA.evaluate(() => JSON.parse(localStorage.getItem('zayifla.coach.chat')).length);
  await pA.evaluate(() => { const c = JSON.parse(localStorage.getItem('zayifla.coach.chat')); for (let i = 0; i < 60; i++) c.push({ id: 'x' + i, role: i % 2 ? 'assistant' : 'user', text: 'mesaj ' + i, ts: 1 }); localStorage.setItem('zayifla.coach.chat', JSON.stringify(c)); });
  await pA.reload({ waitUntil: 'load' });
  nextReply = textReply('Son.');
  await pA.fill('#coach-input', 'son soru');
  await pA.press('#coach-input', 'Enter');
  await pA.waitForFunction(() => /Son\./.test(document.querySelector('#coach-log .msg:last-child').innerText));
  const capLen = await pA.evaluate(() => JSON.parse(localStorage.getItem('zayifla.coach.chat')).length);
  check(chatLen > 5 && capLen === 50, 'sohbet geçmişi 50 mesajla sınırlı: ' + capLen);
  check(apiLog[apiLog.length - 1].body.messages.length <= 14, 'API\'ye en fazla 14 mesaj gidiyor');
  await pA.click('[data-action="coach-clear"]');
  await pA.click('.sheet-layer.open [data-yes]');
  await pA.waitForTimeout(350);
  check((await pA.$$('#coach-log .msg')).length === 1 && !(await pA.evaluate(() => localStorage.getItem('zayifla.coach.chat'))), 'Sohbeti temizle → yalnızca karşılama mesajı');

  console.log('Anahtarı sil');
  await pA.click('a[data-tab="ayarlar"]');
  await pA.click('[data-action="coach-key-del"]');
  await pA.click('.sheet-layer.open [data-yes]');
  await pA.waitForSelector('#coach-key');
  check(!JSON.parse(await pA.evaluate(() => localStorage.getItem('zayifla.coach'))).key, 'Sil → anahtar kaldırıldı');
  await pA.click('a[data-tab="koc"]');
  check(await pA.waitForSelector('[data-action="coach-ask-app"]', { timeout: 3000 }).then(() => true).catch(() => false), 'anahtar silinince ücretsiz moda dönüldü');

  console.log('Service worker');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  check(/'\.\/coach\.js'/.test(sw) && /zayifla-v1\.1\.0/.test(sw), 'sw: coach.js önbellek listesinde, sürüm 1.1.0');
  check(/if \(url\.origin !== self\.location\.origin\) return;/.test(sw) && /if \(req\.method !== 'GET'\) return;/.test(sw), 'sw: API (POST, başka alan adı) önbelleğe alınmıyor');
  check(await pA.evaluate(() => window.Zayifla.version) === '1.1.0', 'uygulama sürümü 1.1.0');
  await ctxA.close();

  /* ------------------------------ 360 px ------------------------------ */
  console.log('360 px dar ekran');
  const ctxN = await newCtx({ viewport: { width: 360, height: 740 }, screen: { width: 360, height: 740 } });
  const pN = await seeded(ctxN, '360');
  const nav = await pN.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll('#tabbar > *')).map(e => {
      const b = e.getBoundingClientRect(); const lbl = e.querySelector('span:last-child');
      return { w: Math.round(b.width), inside: b.left >= -1 && b.right <= vw + 1, cut: lbl && e.tagName === 'A' ? lbl.scrollWidth > b.width : false, txt: e.innerText.trim() };
    });
  });
  check(nav.length === 6 && nav.every(n => n.inside && !n.cut && n.w >= 44), 'alt menü 6 öğe sığıyor, ≥44 px, etiket kesilmiyor: ' + nav.map(n => (n.txt || '+') + ':' + n.w).join(' '));
  await noOverflow(pN, '360 koç (ücretsiz mod)');
  await pN.evaluate(k => {
    localStorage.setItem('zayifla.coach', JSON.stringify({ provider: 'anthropic', key: k, model: 'fast', mode: 'chat' }));
    localStorage.setItem('zayifla.coach.chat', JSON.stringify([
      { id: 'a', role: 'user', text: 'öğlen bir tabak karnıyarık yedim ve çok uzun bir mesaj yazıyorum ki satır kaydırma düzgün mü görelim', ts: 1 },
      { id: 'b', role: 'assistant', text: 'Afiyet olsun! Uzuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuun kelime.', ts: 2, cards: [{ id: 'c', status: '', item: { name: 'Karnıyarık (1 büyük tabak, kıymalı, bol yağlı)', grams: 350, kcal: 520, p: 18, c: 25, f: 38, meal: 'ogle', day: 'bugun' } }] },
      { id: 'd', role: 'assistant', error: true, code: 'auth', text: 'API anahtarı geçersiz ya da silinmiş.', ts: 3 }
    ]));
  }, FAKE_KEY);
  await pN.reload({ waitUntil: 'load' });
  await pN.waitForSelector('.coach-card');
  await noOverflow(pN, '360 koç (sohbet + kart + hata)');
  const barOk = await pN.evaluate(() => { const b = document.querySelector('#coachbar').getBoundingClientRect(), t = document.querySelector('#tabbar').getBoundingClientRect(); return b.bottom <= t.top + 1 && b.width <= 361; });
  check(barOk, 'sohbet çubuğu alt menünün üstünde');
  const cardBtns = await pN.$$eval('.coach-card .btn', bs => bs.map(b => b.getBoundingClientRect().height));
  check(cardBtns.length === 2 && cardBtns.every(h => h >= 36), 'kart düğmeleri dokunmaya uygun');
  await pN.screenshot({ path: path.join(SHOTS, 'coach-04-360-chat.png'), fullPage: true });
  await pN.click('a[data-tab="ayarlar"]');
  await pN.waitForSelector('#coach-settings');
  await noOverflow(pN, '360 ayarlar (koç bölümü)');
  await pN.evaluate(() => document.querySelector('#coach-settings').scrollIntoView());
  await pN.screenshot({ path: path.join(SHOTS, 'coach-05-360-settings.png') });
  await ctxN.close();

  await browser.close();
  srv.close();
  console.log('\nKonsol/sayfa hataları: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'yok'));
  if (errors.length) ok = false;
  console.log(`\n${nPass} geçti, ${nFail} kaldı · ekran görüntüleri: ${SHOTS}`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
