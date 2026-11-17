#!/usr/bin/env node
/*
 * Elle kalori hedefi + otomatik güncelleme testi (Playwright).
 * Klasörün geçici bir kopyasını /zay-fla/ altında sunar; güncelleme testinde kopyadaki dosyaları değiştirip
 * "yeni sürüm yayınlanmış" gibi davranır (GitHub Pages'e benzer şekilde max-age=600 önbellek başlığıyla).
 *   node tests/manual-update.js
 */
'use strict';
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = path.join(__dirname, '..');
const SUB = '/zay-fla/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const WARN = 'Bu hedef önerilen alt sınırın altında. Uzun süre çok düşük kalori kas kaybı ve halsizlik yapabilir; doktor/diyetisyen kontrolünde uygulaman önerilir.';
const SITE_FILES = ['index.html', 'styles.css', 'app.js', 'coach.js', 'parser.js', 'charts.js', 'notify.js', 'sw.js', 'manifest.json', 'foods.js'];

function copySite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zayifla-site-'));
  SITE_FILES.forEach(f => fs.copyFileSync(path.join(SRC, f), path.join(dir, f)));
  fs.cpSync(path.join(SRC, 'icons'), path.join(dir, 'icons'), { recursive: true });
  return dir;
}
function serve(root, hits) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      if (!u.startsWith(SUB)) { rsp.writeHead(404); return rsp.end('not found'); }
      let f = path.join(root, u.slice(SUB.length));
      if (u.endsWith('/')) f = path.join(f, 'index.html');
      fs.readFile(f, (err, buf) => {
        if (err) { rsp.writeHead(404); return rsp.end('not found'); }
        if (hits) hits.push(u);
        rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=600' });
        rsp.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const pad = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };

function seed(over) {
  const days = {};
  [0, 1, 2].forEach(i => { days[daysAgo(i)] = { entries: [{ id: 'e' + i, foodId: null, name: 'Deneme', qty: 1, unit: 'porsiyon', unitG: 0, grams: 0, kcal: 500, p: 20, c: 50, f: 15, meal: 'ogle', ts: Date.now(), quick: true }], water: 2 }; });
  return Object.assign({
    v: 1, createdAt: Date.now(),
    profile: { sex: 'k', age: 32, height: 165, weight: 78, goal: 65, activity: 'hafif', pace: 0.5, startDate: daysAgo(3) },
    targets: { kcal: 1500, p: 100, c: 150, f: 50, manual: false },
    weights: [{ date: daysAgo(2), kg: 78 }], days
  }, over || {});
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let ok = true;
  const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) ok = false; };
  const S = page => page.evaluate(() => window.Zayifla.state());
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function newCtx(extra) { return browser.newContext(Object.assign({}, devices['Pixel 7'], { locale: 'tr-TR', serviceWorkers: 'allow' }, extra || {})); }
  function watch(page) {
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('[console] ' + m.text()); });
  }
  async function open(ctx, base, data) {
    const page = await ctx.newPage(); watch(page);
    await page.goto(base, { waitUntil: 'load' });
    if (data) { await page.evaluate(d => localStorage.setItem('zayifla.data', JSON.stringify(d)), data); await page.reload({ waitUntil: 'load' }); }
    return page;
  }

  const root = copySite();
  const srv = await serve(root);
  const BASE = `http://127.0.0.1:${srv.address().port}${SUB}`;

  /* ------------------------- Onboarding: elle hedef ------------------------- */
  console.log('Onboarding sonunda isteğe bağlı elle hedef');
  {
    const ctx = await newCtx();
    const page = await open(ctx, BASE);
    await page.click('[data-ob="sex"][data-v="k"]'); await page.click('[data-ob="next"]');
    await page.fill('[data-obi="age"]', '32'); await page.fill('[data-obi="height"]', '165'); await page.click('[data-ob="next"]');
    await page.fill('[data-obi="weight"]', '78'); await page.fill('[data-obi="goal"]', '65'); await page.click('[data-ob="next"]');
    await page.click('[data-ob="next"]'); await page.click('[data-ob="next"]');
    check(await page.isVisible('[data-ob="manual"]'), 'son adımda "Hedefi kendim belirleyeceğim" anahtarı var');
    check(!(await page.isVisible('[data-obi="manualKcal"]')), 'varsayılan kapalı, kutu gizli');
    await page.click('[data-ob="manual"]');
    check(await page.$eval('[data-ob="next"]', b => b.disabled), 'açıkken boşsa Başlayalım pasif');
    await page.fill('[data-obi="manualKcal"]', '400');
    check(/500/.test(await page.textContent('#ob-mwarn')) && await page.$eval('[data-ob="next"]', b => b.disabled), '400 reddedilir (500–6000)');
    await page.fill('[data-obi="manualKcal"]', '1000');
    check((await page.textContent('#ob-mwarn')).includes(WARN), 'onboarding: 1000 için uyarı gösterilir');
    check(!(await page.$eval('[data-ob="next"]', b => b.disabled)), '1000 ile devam edilebilir (engellenmez)');
    await page.click('[data-ob="next"]');
    await page.waitForSelector('#quickbar:not([hidden])');
    const st = await S(page);
    check(st.manual.on && st.manual.kcal === 1000 && st.targets.kcal === 1000 && st.targets.manual, 'onboarding: hedef 1000 kaydedildi');
    await ctx.close();

    const ctx2 = await newCtx();
    const p2 = await open(ctx2, BASE);
    await p2.click('[data-ob="sex"][data-v="e"]'); await p2.click('[data-ob="next"]');
    await p2.fill('[data-obi="age"]', '40'); await p2.fill('[data-obi="height"]', '178'); await p2.click('[data-ob="next"]');
    await p2.fill('[data-obi="weight"]', '90'); await p2.fill('[data-obi="goal"]', '80'); await p2.click('[data-ob="next"]');
    await p2.click('[data-ob="next"]'); await p2.click('[data-ob="next"]'); await p2.click('[data-ob="next"]');
    await p2.waitForSelector('#quickbar:not([hidden])');
    const st2 = await S(p2);
    check(!st2.manual.on && !st2.targets.manual && st2.targets.kcal >= 1500, 'onboarding: dokunmazsa elle hedef kapalı, hesaplanan hedef');
    await ctx2.close();
  }

  /* ------------------------------ Ayarlar akışı ------------------------------ */
  console.log('Ayarlar: elle hedef 1000, halka/grafik, uyarı, kapatınca hesaplanan');
  const ctx = await newCtx({ acceptDownloads: true });
  const page = await open(ctx, BASE, seed());
  let st = await S(page);
  check(st.v === 2 && st.manual && st.manual.on === false && st.manual.kcal === null, 'v1 verisi göç etti: elle hedef kapalı (v=2)');
  check(st.targets.kcal === 1500 && !st.targets.manual, 'mevcut hedef bozulmadı');
  const calcKcal = await page.evaluate(() => { const s = window.Zayifla.state(); return s.targets.kcal; });
  await page.click('a[data-tab="ayarlar"]');
  await page.waitForSelector('[data-manual="on"]');
  const recTxt = await page.textContent('#rec-kcal');
  check(/Önerilen: [\d.]+ kcal/.test(recTxt), 'kapalıyken de "' + recTxt + '" görünür');
  const recKcal = parseInt(recTxt.replace(/\D/g, ''), 10);
  check(!(await page.$('#manual-kcal')), 'kapalıyken sayı kutusu yok');
  await page.click('[data-manual="on"]');
  await page.waitForSelector('#manual-kcal');
  check(+(await page.inputValue('#manual-kcal')) === recKcal, 'açılınca kutu önerilenle dolu (' + recKcal + ')');
  check(!(await page.isVisible('#manual-warn')), 'önerilen değerde uyarı yok');
  await page.fill('#manual-kcal', '400');
  check(/500/.test(await page.textContent('#manual-warn')), '400: aralık uyarısı');
  await page.click('[data-action="manual-save"]');
  await page.waitForTimeout(300);
  check((await S(page)).manual.kcal === recKcal, '400 kaydedilmedi');
  await page.fill('#manual-kcal', '7000');
  await page.click('[data-action="manual-save"]');
  check((await S(page)).manual.kcal === recKcal, '7000 kaydedilmedi');
  await page.fill('#manual-kcal', '1000');
  check((await page.textContent('#manual-warn')).trim() === WARN, 'yazarken uyarı metni birebir gösterilir');
  await page.click('[data-action="manual-save"]');
  await page.waitForTimeout(400);
  st = await S(page);
  check(st.manual.on && st.manual.kcal === 1000 && st.targets.kcal === 1000 && st.targets.manual, '1000 kaydedildi');
  check(st.targets.p === 100 && st.targets.f === 33 && Math.abs(st.targets.p * 4 + st.targets.c * 4 + st.targets.f * 9 - 1000) < 20, 'protein %40 ile sınırlı (' + st.targets.p + ' g), makrolar toplamı ≈1000: P' + st.targets.p + ' K' + st.targets.c + ' Y' + st.targets.f);
  check((await page.textContent('#manual-warn')).trim() === WARN && await page.isVisible('#manual-warn'), 'kayıttan sonra da uyarı görünür (engelleyici değil)');
  check(/Günlük 1\.000 kcal/.test(await page.textContent('#view')) && /Önerilen: [\d.]+ kcal/.test(await page.textContent('#rec-kcal')), 'ayarlar özeti 1.000 + önerilen yanında');
  // kalıcılık
  await page.reload({ waitUntil: 'load' });
  st = await S(page);
  check(st.manual.on && st.manual.kcal === 1000 && st.targets.kcal === 1000, 'yenilemeden sonra korunur');
  // Bugün: sayılar + halka
  await page.click('a[data-tab="bugun"]');
  await page.waitForSelector('#ring svg');
  const stats = await page.textContent('.summary-stats');
  check(/1\.000\s*Hedef/.test(stats) && /500\s*Kalan/.test(stats), 'Bugün: hedef 1.000, kalan 500 (' + stats.replace(/\s+/g, ' ').trim() + ')');
  const frac = await page.$eval('#ring .ring-fill', e => { const [a, b] = e.getAttribute('stroke-dasharray').split(' ').map(Number); return a / b; });
  check(Math.abs(frac - 0.5) < 0.01, 'halka 500/1000 = %50 dolu (' + frac.toFixed(3) + ')');
  // İlerleme grafiği
  await page.click('a[data-tab="ilerleme"]');
  await page.waitForSelector('.ch-goal-label');
  const goalLabels = await page.$$eval('.ch-goal-label', els => els.map(e => e.textContent));
  check(goalLabels.some(t => /^Hedef 1000$/.test(t)), 'kalori grafiği hedef çizgisi 1000 (' + goalLabels.join(', ') + ')');
  // koç özeti
  const ctxSum = await page.evaluate(() => window.Zayifla.coachContext && window.Zayifla.coachContext());
  check(ctxSum && ctxSum.gunluk_hedef.kcal === 1000 && ctxSum.gunluk_hedef.kullanici_belirledi === true, 'koç veri özeti elle hedefi kullanır');
  // dışa aktar
  await page.click('a[data-tab="ayarlar"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  const exportPath = path.join(os.tmpdir(), 'zayifla-export-test.json');
  await dl.saveAs(exportPath);
  const exp = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  check(exp.manual && exp.manual.on === true && exp.manual.kcal === 1000, 'dışa aktarmada elle hedef var');
  // kapat → hesaplanan
  await page.click('[data-manual="on"]');
  await page.waitForTimeout(400);
  st = await S(page);
  check(!st.manual.on && !st.targets.manual && st.targets.kcal === recKcal && st.manual.kcal === 1000, 'kapatınca hesaplanan hedefe dönüldü (' + st.targets.kcal + '), değer hatırlanır');
  await page.click('a[data-tab="bugun"]');
  check(new RegExp(String(recKcal).replace(/(\d)(?=(\d{3})$)/, '$1\\.') + '\\s*Hedef').test(await page.textContent('.summary-stats')), 'Bugün hesaplanan hedefi gösterir');
  // içe aktar → elle hedef geri gelir
  await page.click('a[data-tab="ayarlar"]');
  await page.setInputFiles('#import-file', exportPath);
  await page.waitForSelector('.sheet-layer.open');
  await page.click('.sheet-layer.open [data-yes]');
  await page.waitForTimeout(500);
  st = await S(page);
  check(st.manual.on && st.manual.kcal === 1000 && st.targets.kcal === 1000, 'içe aktarma elle hedefi geri getirir');
  // yeniden aç/kapat: kaydedilen değerle
  await page.click('[data-manual="on"]'); await page.waitForTimeout(300);
  await page.click('[data-manual="on"]'); await page.waitForSelector('#manual-kcal');
  check(+(await page.inputValue('#manual-kcal')) === 1000, 'tekrar açınca son elle değer (1000)');
  // profil değişince elle hedef korunur
  await page.click('[data-action="edit-profile"]');
  await page.waitForSelector('.sheet-layer.open [name="age"]');
  await page.waitForTimeout(300);
  await page.fill('.sheet-layer.open [name="age"]', '33');
  check(/1\.000/.test(await page.textContent('.sheet-layer.open .js-prev')), 'profil düzenlerken elle hedefin korunacağı yazar');
  await page.click('.sheet-layer.open [data-ok]');
  await page.waitForTimeout(400);
  st = await S(page);
  check(st.profile.age === 33 && st.targets.kcal === 1000 && st.manual.on, 'profil güncellenince elle hedef ezilmedi');
  await ctx.close();

  console.log('Erkek eşiği 1500, kadın 1200');
  {
    const c = await newCtx();
    const p = await open(c, BASE, seed({ profile: { sex: 'e', age: 40, height: 178, weight: 90, goal: 80, activity: 'hafif', pace: 0.5, startDate: daysAgo(3) }, manual: { on: true, kcal: 1400 } }));
    await p.click('a[data-tab="ayarlar"]'); await p.waitForSelector('#manual-kcal');
    check(await p.isVisible('#manual-warn'), 'erkek 1400: uyarı');
    await p.fill('#manual-kcal', '1500');
    check(!(await p.isVisible('#manual-warn')), 'erkek 1500: uyarı yok');
    await p.fill('#manual-kcal', '1199');
    check(await p.isVisible('#manual-warn'), 'erkek 1199: uyarı');
    await c.close();
    const c2 = await newCtx();
    const p2 = await open(c2, BASE, seed({ manual: { on: true, kcal: 1250 } }));
    await p2.click('a[data-tab="ayarlar"]'); await p2.waitForSelector('#manual-kcal');
    check(!(await p2.isVisible('#manual-warn')), 'kadın 1250: uyarı yok');
    await p2.fill('#manual-kcal', '1199');
    check(await p2.isVisible('#manual-warn'), 'kadın 1199: uyarı');
    await c2.close();
  }

  console.log('Eski elle hedef (v1 targets.manual) göçü ve akıllı öneri');
  {
    const c = await newCtx();
    const p = await open(c, BASE, seed({ targets: { kcal: 1800, p: 120, c: 180, f: 60, manual: true } }));
    const s = await S(p);
    check(s.manual.on && s.manual.kcal === 1800 && s.targets.kcal === 1800, 'eski elle hedef korunur (elle açık, 1800)');
    // akıllı öneri yalnızca onayla uygulanır
    await p.evaluate(() => { const st = window.Zayifla.state(); st.adaptive.dismissedAt = 0; });
    const before = (await S(p)).targets.kcal;
    check(before === 1800, 'öneri kartı gösterilse de hedef sessizce değişmez');
    await c.close();
  }

  /* --------------------------- Güncelleme akışı --------------------------- */
  console.log('Otomatik güncelleme: v1 sun, yükle, sunucuda yeni sürüm, sayfa güncellenir');
  const root2 = copySite();
  const hits = [];
  const srv2 = await serve(root2, hits);
  const BASE2 = `http://127.0.0.1:${srv2.address().port}${SUB}`;
  const swSrc = fs.readFileSync(path.join(root2, 'sw.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(root2, 'app.js'), 'utf8');
  check(/skipWaiting\(\)/.test(swSrc) && /clients\.claim\(\)/.test(swSrc) && /caches\.delete/.test(swSrc), 'sw: skipWaiting + clients.claim + eski önbellek silme');
  check(/zayifla-v1\.3\.0/.test(swSrc) && /APP_VERSION = '1\.3\.0'/.test(appSrc), 'sürüm 1.3.0 (uygulama ve SW önbelleği)');
  const publish = ver => {
    fs.writeFileSync(path.join(root2, 'app.js'), fs.readFileSync(path.join(root2, 'app.js'), 'utf8').replace(/APP_VERSION = '[\d.]+'/, `APP_VERSION = '${ver}'`));
    fs.writeFileSync(path.join(root2, 'sw.js'), fs.readFileSync(path.join(root2, 'sw.js'), 'utf8').replace(/zayifla-v[\d.]+'/, `zayifla-v${ver}'`));
  };
  const cu = await newCtx();
  const pu = await cu.newPage(); watch(pu);
  let navs = 0;
  pu.on('load', () => { navs++; }); // tam sayfa yüklemeleri (hash değişimi sayılmaz)
  await pu.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => { // görülen bildirimleri yenilemeden sonra da okuyabilmek için sessionStorage'a yaz
      new MutationObserver(() => { const t = document.querySelector('#toasts')?.textContent; if (!t) return; const a = JSON.parse(sessionStorage.getItem('__toasts') || '[]'); if (a[a.length - 1] !== t) { a.push(t); sessionStorage.setItem('__toasts', JSON.stringify(a)); } })
        .observe(document.querySelector('#toasts'), { childList: true, subtree: true, characterData: true });
    });
  });
  await pu.goto(BASE2, { waitUntil: 'load' });
  await pu.evaluate(d => localStorage.setItem('zayifla.data', JSON.stringify(d)), seed({ manual: { on: true, kcal: 1000 }, v: 2 }));
  await pu.evaluate(() => navigator.serviceWorker.ready);
  await pu.reload({ waitUntil: 'load' });
  await pu.waitForFunction(() => !!navigator.serviceWorker.controller);
  navs = 0;
  check(await pu.evaluate(() => window.Zayifla.version) === '1.3.0', 'v1: sayfa 1.3.0 açıldı');
  await pu.click('a[data-tab="ayarlar"]');
  await pu.waitForSelector('[data-action="check-update"]');
  check(/Sürüm 1\.3\.0/.test(await pu.textContent('#view')), 'Ayarlar "Sürüm 1.3.0" gösterir');
  const before = await pu.evaluate(() => localStorage.getItem('zayifla.data'));
  // güncelleme yokken: "güncel" der, yenilemez
  await pu.click('[data-action="check-update"]');
  await pu.waitForFunction(() => /güncel/.test(document.querySelector('#toasts').textContent));
  await sleep(2500);
  check(navs === 0, 'yeni sürüm yokken sayfa yenilenmez');

  publish('1.3.1');
  await pu.click('[data-action="check-update"]');
  await pu.waitForFunction(() => window.Zayifla.version === '1.3.1', null, { timeout: 20000 });
  await sleep(4000);
  check(await pu.evaluate(() => window.Zayifla.version) === '1.3.1', 'sunucuda yeni sürüm → sayfa 1.3.1 oldu');
  check(navs === 1, 'tam olarak bir kez yenilendi, döngü yok (yönlendirme: ' + navs + ')');
  const toasts = await pu.evaluate(() => JSON.parse(sessionStorage.getItem('__toasts') || '[]'));
  check(toasts.some(t => t.includes('Uygulama güncellendi ✓')), '"Uygulama güncellendi ✓" bildirimi gösterildi');
  check((await pu.evaluate(() => localStorage.getItem('zayifla.data'))) === before, 'kullanıcı verisi aynen korundu');
  check(/zayifla-v1\.3\.1/.test((await pu.evaluate(() => caches.keys())).join(',')) && !(await pu.evaluate(() => caches.keys())).some(k => /zayifla-v1\.3\.0/.test(k)), 'eski önbellek silindi, yenisi var');
  await pu.click('a[data-tab="ayarlar"]');
  check(/Sürüm 1\.3\.1/.test(await pu.textContent('#view')), 'Ayarlar yeni sürümü gösterir');

  // görünür olunca denetim: 30 dk sınırı
  publish('1.3.2');
  const navs1 = navs;
  await pu.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(2500);
  check(navs === navs1 && await pu.evaluate(() => window.Zayifla.version) === '1.3.1', 'visibilitychange: 30 dakika dolmadan sunucuya sorulmaz');
  await pu.evaluate(() => { const real = Date.now; Date.now = () => real() + 31 * 60 * 1000; document.dispatchEvent(new Event('visibilitychange')); Date.now = real; });
  await pu.waitForFunction(() => /Yenile/.test(document.querySelector('#toasts').textContent) || window.Zayifla.version === '1.3.2', null, { timeout: 20000 });
  await sleep(2500);
  check(navs === navs1 && await pu.evaluate(() => window.Zayifla.version) === '1.3.1', 'döngü koruması: 60 sn içinde ikinci otomatik yenileme yapılmaz, "Yenile" düğmesi sunulur');
  await pu.click('#toasts button');
  await pu.waitForFunction(() => window.Zayifla.version === '1.3.2');
  check(navs === navs1 + 1, 'Yenile düğmesi ile 1.3.2');
  check((await pu.evaluate(() => localStorage.getItem('zayifla.data'))) === before, 'veri hâlâ aynı');

  // SW'yi değiştirmeyen yayın (yalnız app.js): ağ öncelikli kabuk yine de yenisini getirir
  fs.writeFileSync(path.join(root2, 'app.js'), fs.readFileSync(path.join(root2, 'app.js'), 'utf8').replace(/APP_VERSION = '[\d.]+'/, "APP_VERSION = '1.3.9'"));
  await pu.reload({ waitUntil: 'load' });
  check(await pu.evaluate(() => window.Zayifla.version) === '1.3.9', 'ağ öncelikli kabuk: yalnız app.js değişse de çevrimiçi açılışta yeni');
  // çevrimdışı: önbellekten açılır
  await cu.setOffline(true);
  await pu.reload({ waitUntil: 'load' });
  check(await pu.evaluate(() => window.Zayifla.version) === '1.3.9' && !!(await pu.$('#view')), 'çevrimdışı açılış önbellekten çalışır');
  await cu.setOffline(false);
  await cu.close();

  check(!errors.length, 'konsol/sayfa hatası yok' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
  await browser.close();
  srv.close(); srv2.close();
  console.log(ok ? '\nTAMAM' : '\nBAŞARISIZ');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
