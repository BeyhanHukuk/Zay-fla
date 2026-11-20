#!/usr/bin/env node
/*
 * Genişletilmiş besin listesi (~2.700) + light / diyet / yağsız / şekersiz / zero niteleyicileri + hız.
 *   node tests/parser.variants.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../parser.js');
const ctx = { window: {} }; vm.createContext(ctx);
const t0 = process.hrtime.bigint();
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'foods.js'), 'utf8'), ctx);
const loadMs = Number(process.hrtime.bigint() - t0) / 1e6;
const FOODS = ctx.window.FOODS;
const byId = Object.fromEntries(FOODS.map(f => [f.id, f]));
let pass = 0; const fails = [];
function check(cond, msg) { if (cond) pass++; else fails.push(msg); }
const parse = s => P.parse(s, FOODS);
const dump = r => JSON.stringify(r.items.map(i => [i.foodId, i.qty, i.unit, i.kcal, i.confidence])) + (r.unmatched.length ? ' unmatched=' + JSON.stringify(r.unmatched.map(u => u.text)) : '');
const now = () => Number(process.hrtime.bigint()) / 1e6;

/* ---------------- veri ---------------- */
check(FOODS.length >= 2600, 'besin sayısı ≥ 2600: ' + FOODS.length);
const ids = new Set(); FOODS.forEach(f => { check(!ids.has(f.id), 'yinelenen id ' + f.id); ids.add(f.id); });
const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy-ids.json'), 'utf8'));
const missing = legacy.filter(id => !byId[id]);
check(legacy.length >= 490 && !missing.length, 'eski (kayıtlı) besin id\'leri korunmuş, eksik: ' + missing.join(','));
check(!FOODS.some(f => /^(a|b|c|d)-/.test(f.id) && !f.name), 'yeni besinlerin adı var');
// her ad / alias tek bir besine ait
const idx = P.buildIndex(FOODS);
let owners = 0; const clash = [];
FOODS.forEach(f => [f.name].concat(f.aliases).forEach(a => {
  const k = P.foldTokens(a).join(' ');
  if (!k) return;
  const e = idx.byStr[k];
  if (e && e.food === f) owners++; else clash.push(f.id + ': "' + a + '" -> ' + (e && e.food.id));
}));
check(!clash.length, 'her alias tek besine çıkar (' + owners + ' dize); çakışan: ' + clash.slice(0, 8).join(' | '));
const aliasOf = id => byId[id].aliases.map(a => P.fold(a));
check(!aliasOf('mayonez').includes('light mayonez'), '"light mayonez" artık tam yağlı mayonezde değil');
check(!aliasOf('sut-yarim').includes('light sut') && !aliasOf('sut-yarim').includes('az yagli sut'), '"light süt" / "az yağlı süt" artık yarım yağlı sütte değil');
check(fs.existsSync(path.join(__dirname, '..', 'data-new')) === false, 'data-new/ klasörü yayında yok');

/* ---------------- istenen cümleler ---------------- */
function expect(text, foodId, extra, note) {
  const r = parse(text), it = r.items[0];
  let ok = r.items.length === 1 && !r.unmatched.length && it.foodId === foodId;
  if (ok && extra) ok = extra(it);
  check(ok, `"${text}" -> ${foodId}${note ? ' (' + note + ')' : ''}: ${dump(r)}`);
  return it;
}
const fullMayo = parse('bir yemek kaşığı mayonez').items[0];
const lm = expect('kalorisi azaltılmış mayonez', 'b-mayonez-light', it => it.confidence >= 0.9);
check(lm && fullMayo && lm.kcal < fullMayo.kcal, 'light mayonez tam yağlıdan az kalorili');
expect('bir yemek kaşığı light mayonez', 'b-mayonez-light', it => it.qty === 1 && it.unit === 'yemek kaşığı');
expect('mayonez light', 'b-mayonez-light');
expect('mayonez kalorisi azaltılmış', 'b-mayonez-light');
expect('diyet mayonez', 'b-mayonez-light');
expect('bir kutu kola zero', 'kola-light', it => it.qty === 1 && it.unit === 'kutu' && it.kcal <= 5);
expect('diyet kola', 'kola-light');
expect('sıfır kola', 'kola-light', it => it.qty === 1, 'sıfır miktar değil');
expect('kola sıfır', 'kola-light', it => it.qty === 1);
expect('yağsız süt', 'sut-yagsiz');
expect('light kaşar iki dilim', 'a-peynir-kasar-light', it => it.qty === 2 && it.unit === 'dilim');
expect('az yağlı yoğurt bir kase', 'yogurt-yarim', it => it.qty === 1 && it.unit === 'kase');
expect('şekersiz ketçap', 'a-ketcap-sekersiz');
expect('bir big mac', 'c-mcd-big-mac', it => it.qty === 1 && it.unit === 'adet');
expect('whopper menü', 'z-menu-bk-whopper');
expect('ülker albeni', 'b-ulker-albeni');
expect('eti burçak 3 tane', 'b-eti-burcak', it => it.qty === 3 && it.unit === 'adet');
expect('yarım yağlı süt bir bardak', 'sut-yarim', it => it.qty === 1 && it.unit === 'bardak', 'yarım = niteleyici');
expect('bir bardak yarım yağlı süt', 'sut-yarim', it => it.qty === 1 && it.unit === 'bardak');
expect('bir avuç kaju', 'kaju', it => it.qty === 1 && it.unit === 'avuç');
expect('california roll 6 adet', 'd-sushi-california-roll', it => it.qty === 6 && it.unit === 'adet');
expect('tavuk dürüm', 'doner-durum-tavuk');
expect('light süt', 'a-sut-light-az-yagli');
expect('az yağlı süt', 'a-sut-light-az-yagli');
expect('süt light bir bardak', 'a-sut-light-az-yagli', it => it.qty === 1 && it.unit === 'bardak', 'sıfat isimden sonra + miktar');
expect('laktozsuz süt', 'b-laktozsuz-sut');
expect('şeker ilavesiz reçel', 'b-recel-light');
expect('fanta zero', 'a-fanta-zero');
expect('zero fanta', 'a-fanta-zero');
expect('kepekli ekmek', 'b-ekmek-kepekli');
expect('tam buğday ekmeği iki dilim', 'tam-bugday-ekmegi', it => it.qty === 2 && it.unit === 'dilim');
expect('yarım ekmek', 'ekmek', it => it.qty === 0.5, 'yarım = miktar');
expect('yarım ekmek kokoreç', 'kokorec', it => it.qty === 1, 'yarım ekmek = sandviç boyu, miktar değil');
expect('piña colada', 'a-pina-colada');
expect('margarita', 'pizza-margarita');
expect('yağsız tavuk göğsü 150 gram', 'tavuk-gogsu', it => it.grams === 150 && it.confidence >= 0.8);
expect('şekersiz çay', 'cay', it => it.confidence >= 0.8, 'çay zaten şekersiz: uyarı yok');
expect('yağsız tavuk pirzola', 'tavuk-pirzola', it => it.confidence >= 0.8, 'et için yağsız tarif sıfatı');
// çeşidi olmayan: temel besin + düşük güven + öneriler
const ls = expect('light simit', 'simit', it => it.confidence < 0.8 && Array.isArray(it.suggestions) && it.suggestions.length > 0 && it.variantMissing.includes('light'), 'çeşit yok → kontrol et');
check(ls && ls.suggestions.every(s => byId[s.id] && s.id !== 'simit'), 'öneriler geçerli besinler');
expect('diyet lahmacun', 'lahmacun', it => it.confidence < 0.8);

/* ---------------- ayırıcılar ---------------- */
function expectMany(text, list) {
  const r = parse(text);
  const ok = r.items.length === list.length && !r.unmatched.length && list.every((x, k) => r.items[k].foodId === x[0] && (x[1] == null || r.items[k].qty === x[1]) && (x[2] == null || r.items[k].unit === x[2]));
  check(ok, `"${text}": ${dump(r)}`);
}
expectMany('light ketçap, yarım yağlı süt ve bir elma', [['a-ketcap-light'], ['sut-yarim', 1], ['elma', 1, 'adet']]);
expectMany('diyet mayonez ve iki dilim ekmek', [['b-mayonez-light'], ['ekmek', 2, 'dilim']]);
expectMany('light kola iki kutu ve bir tost', [['kola-light', 2, 'kutu'], ['tost-kasarli', 1]]);
expectMany('iki dilim ekmek, bir kase mercimek çorbası, bir bardak ayran, yarım yağlı süt bir bardak ve bir avuç kaju',
  [['ekmek', 2, 'dilim'], ['mercimek-corbasi', 1, 'kase'], ['ayran', 1, 'bardak'], ['sut-yarim', 1, 'bardak'], ['kaju', 1, 'avuç']]);
expectMany('bir tane elma bir tane armut', [['elma', 1, 'adet'], ['armut', 1, 'adet']]);
expectMany('az yağlı yoğurt ve kalorisi azaltılmış mayonez', [['yogurt-yarim'], ['b-mayonez-light']]);

/* ---------------- yeni besinlerden rastgele örnekler ---------------- */
// her alias kendi besinine çıkmalı (sayı/miktar sözcüğüyle başlayan alias'lar hariç: "yarım iskender" = 0.5 iskender)
const QTY_START = /^(bir|bi|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on|yirmi|otuz|kirk|elli|yuz|bin|yarim|ceyrek|birkac|sifir)$/;
const pool = [];
FOODS.forEach(f => { if (!/^(a|b|c|d)-/.test(f.id)) return; [f.name].concat(f.aliases).forEach(a => {
  const t = P.foldTokens(a);
  if (!t.length || /\d|\./.test(a) || /[,;+&]/.test(a) || t.includes('ve') || t.includes('ile') || QTY_START.test(t[0])) return;
  pool.push([f.id, a]);
}); });
let seed = 20261117; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const sample = []; for (let k = 0; k < 60; k++) sample.push(pool[Math.floor(rnd() * pool.length)]);
sample.forEach(([id, a]) => { const r = parse(a); check(r.items.length === 1 && !r.unmatched.length && r.items[0].foodId === id, `örnek "${a}" -> ${id}: ${dump(r)}`); });
// ve tamamı (hızlı tarama)
const wrong = pool.filter(([id, a]) => { const r = parse(a); return !(r.items.length === 1 && !r.unmatched.length && r.items[0].foodId === id); });
check(!wrong.length, `tüm yeni alias'lar (${pool.length}) kendi besinine çıkar; hatalı: ` + wrong.slice(0, 10).map(x => x.join(':')).join(' | '));

/* ---------------- arama ---------------- */
const sr = (q, n) => P.searchFoods(q, FOODS, { limit: n || 10 }).map(f => f.id);
check(sr('albeni')[0] === 'b-ulker-albeni', 'arama: albeni -> Ülker Albeni: ' + sr('albeni', 3));
check(sr('mayonez light').slice(0, 3).includes('b-mayonez-light'), 'arama: mayonez light ilk 3: ' + sr('mayonez light', 3));
check(sr('big mac')[0] === 'c-mcd-big-mac', 'arama: big mac: ' + sr('big mac', 3));
check(sr('brokli').includes('brokoli'), 'arama: yazım hatası brokli -> brokoli: ' + sr('brokli', 5));
check(sr('tavuk gogus').includes('tavuk-gogsu'), 'arama: "tavuk gogus" -> tavuk göğsü');

/* ---------------- hız ---------------- */
const SENT = [
  'iki dilim ekmek, bir kase mercimek çorbası, bir bardak ayran, yarım yağlı süt bir bardak ve bir avuç kaju',
  'kahvaltıda iki yumurta, beyaz peynir, zeytin, domates ve bir bardak çay',
  'bir big mac, orta patates, bir kutu kola zero, ketçap ve mayonez light',
  'tavukk pirzolaa, brokolli salatası, bulgur pilavı, cacık ve ayrn',
  'kalorisi azaltılmış mayonez, light kaşar iki dilim, yağsız süt, şekersiz ketçap ve kepekli ekmek'
];
let worst = 0;
SENT.forEach(s => { parse(s); const a = now(); for (let k = 0; k < 10; k++) parse(s); const ms = (now() - a) / 10; worst = Math.max(worst, ms); check(ms < 30, `5 kalemli cümle < 30 ms: ${ms.toFixed(2)} ms — ${s}`); });
let worstS = 0;
['m', 'ma', 'may', 'mayo', 'mayon', 'mayonez', 'mayonez l', 'mayonez li', 'ülker alb', 'brokli', 'tavk gö'].forEach(q => {
  const a = now(); for (let k = 0; k < 5; k++) P.searchFoods(q, FOODS, { limit: 40 }); const ms = (now() - a) / 5; worstS = Math.max(worstS, ms);
  check(ms < 30, `arama (her tuş) < 30 ms: ${ms.toFixed(2)} ms — "${q}"`);
});

console.log(`foods.js yükleme ${loadMs.toFixed(0)} ms · en yavaş cümle ${worst.toFixed(2)} ms · en yavaş arama ${worstS.toFixed(2)} ms`);
fails.forEach(f => console.log('  ✗ ' + f));
console.log(`\n${pass} geçti, ${fails.length} kaldı (${FOODS.length} besin)`);
process.exit(fails.length ? 1 : 0);
