#!/usr/bin/env node
/*
 * Konuşma tanıma tarzı (noktalamasız, dağınık) Türkçe cümlelerle ek parser testleri.
 *   node tests/parser.speech.test.js
 * Her cümle için: besin, miktar, birim, gram aralığı ve kcal aralığı kontrol edilir.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../parser.js');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'foods.js'), 'utf8'), ctx);
const FOODS = ctx.window.FOODS;
const byId = Object.fromEntries(FOODS.map(f => [f.id, f]));
let pass = 0; const fails = [];
const has = (it, kw) => { const f = byId[it.foodId]; return f && [f.name].concat(f.aliases || []).some(a => P.fold(a).includes(P.fold(kw))); };
const inR = (v, r) => r == null || (v >= r[0] && v <= r[1]);

// [cümle, [[besin, miktar, birim, [gMin,gMax], [kcalMin,kcalMax]]...], öğün?]
const C = [
  ['sabah iki yumurta bir dilim beyaz peynir ve 5 zeytin yedim', [['yumurta', 2, 'adet', [90, 110], [140, 170]], ['beyaz peynir', 1, 'dilim', [20, 40]], ['zeytin', 5, 'adet']], 'kahvalti'],
  ['öğlen bir porsiyon kuru fasulye pilav ve ayran', [['kuru fasulye', 1, 'porsiyon', [150, 300]], ['pilav'], ['ayran']], 'ogle'],
  ['akşam yemeğinde 250 gram ızgara köfte yarım ekmek', [['köfte', 250, 'g', [250, 250], [500, 700]], ['ekmek', 0.5]], 'aksam'],
  ['iki bardak şekerli çay', [['şekerli çay', 2, 'bardak', null, [10, 80]]]],
  ['bir avuç fındık', [['fındık', 1, 'avuç', [25, 35], [150, 230]]]],
  ['bir tabak mantı', [['mantı', 1, 'tabak', [200, 400], [350, 700]]]],
  ['bir dürüm döner', [['dürüm', 1, 'adet', null, [350, 700]]]],
  ['1 kutu kola', [['kola', 1, 'kutu', [330, 330], [120, 150]]]],
  ['yüz elli gram tavuk göğsü', [['tavuk göğsü', 150, 'g', [150, 150], [200, 300]]]],
  ['bir buçuk dilim ekmek', [['ekmek', 1.5, 'dilim', [30, 50], [80, 130]]]],
  ['üç yumurta', [['yumurta', 3, 'adet', [140, 160], [210, 250]]]],
  ['3 tane haşlanmış yumurta yedim', [['yumurta', 3, 'adet', [140, 160], [210, 250]]]],
  ['kahvaltıda menemen yedim yanında iki dilim ekmek', [['menemen', 1], ['ekmek', 2, 'dilim']], 'kahvalti'],
  ['bir kase yoğurt ve bir muz', [['yoğurt', 1, 'kase'], ['muz', 1, 'adet', [90, 150]]]],
  ['bir simit bir çay', [['simit', 1, 'adet', null, [250, 400]], ['çay', 1]]],
  ['iki tane poğaça yedim', [['poğaça', 2, 'adet']]],
  ['bir fincan türk kahvesi', [['türk kahvesi', 1, 'fincan', null, [0, 10]]]],
  ['iki lahmacun bir ayran', [['lahmacun', 2, 'adet', null, [400, 800]], ['ayran', 1]]],
  ['yarım porsiyon iskender', [['iskender', 0.5, 'porsiyon']]],
  ['üç dilim baklava yedim', [['baklava', 3, 'dilim', null, [350, 700]]]],
  ['bir çay kaşığı bal', [['bal', 1, 'çay kaşığı', [4, 10]]]],
  ['bir yemek kaşığı tereyağı', [['tereyağı', 1, 'yemek kaşığı', [10, 16], [80, 120]]]],
  ['200 ml süt', [['süt', 200, 'ml', [200, 200]]]],
  ['iki dilim pizza', [['pizza', 2, 'dilim']]],
  ['bir kutu kola ve patates kızartması', [['kola', 1, 'kutu'], ['kızartma', 1]]],
  ['bir dilim kaşar iki dilim salam', [['kaşar', 1, 'dilim'], ['salam', 2, 'dilim']]],
  ['150 gram somon', [['somon', 150, 'g', [150, 150]]]],
  ['on beş tane badem', [['badem', 15, 'adet', [12, 25]]]],
  ['dört yüz gram yoğurt', [['yoğurt', 400, 'g', [400, 400]]]],
  ['bir litre su', [['su', 1000, 'ml', [1000, 1000], [0, 0]]]],
  ['bir buçuk porsiyon makarna', [['makarna', 1.5, 'porsiyon']]],
  ['iki buçuk dilim ekmek', [['ekmek', 2.5, 'dilim']]],
  ['öğlen tavuk döner yedim bir de kola', [['tavuk döner', 1], ['kola', 1]], 'ogle'],
  ['akşam evde iki kepçe mercimek çorbası', [['mercimek çorbası', 2, 'kepçe']], 'aksam'],
  ['dün akşam bir tabak makarna yedim', [['makarna', 1, 'tabak']], 'aksam'],
  ['gece yarım paket cips yedim', [['cips', 0.5, 'paket']], 'ara'],
  ['kahvaltıda bal kaymak ve ekmek', [['bal'], ['kaymak'], ['ekmek']], 'kahvalti'],
  ['yarım ekmek döner', [['döner', 1, 'adet', [150, 400]]]],
  ['yarım ekmek arası köfte', [['köfte ekmek', 1, 'adet']]],
  ['iki yumurtalı menemen', [['menemen', 1, 'porsiyon']]],
  ['öğlen bi tabak pilav bi tabak fasulye', [['pilav', 1, 'tabak'], ['fasulye', 1, 'tabak']], 'ogle'],
  ['bir kase mısır gevreği sütle', [['mısır gevreği', 1, 'kase'], ['süt']]],
  ['bir tane elma bir tane armut', [['elma', 1, 'adet'], ['armut', 1, 'adet']]],
  ['2 kaşık fıstık ezmesi', [['fıstık ezmesi', 2]]],
];

for (const [s, specs, meal] of C) {
  const r = P.parse(s, FOODS);
  const dump = JSON.stringify({ items: r.items.map(i => [i.name, i.qty, i.unit, i.grams, i.kcal]), unmatched: r.unmatched.map(u => u.text), meal: r.meal });
  const errs = [];
  if (r.items.length !== specs.length) errs.push(`kalem ${r.items.length} != ${specs.length}`);
  if (r.unmatched.length) errs.push('eşleşmeyen var');
  if (meal !== undefined && r.meal !== meal) errs.push(`öğün ${r.meal} != ${meal}`);
  specs.forEach(([food, qty, unit, g, kc], k) => {
    const it = r.items[k]; if (!it) return;
    if (!has(it, food)) errs.push(`#${k} besin ${it.name} != ${food}`);
    if (qty != null && Math.abs(it.qty - qty) > 1e-6) errs.push(`#${k} miktar ${it.qty} != ${qty}`);
    if (unit != null && it.unit !== unit) errs.push(`#${k} birim ${it.unit} != ${unit}`);
    if (!inR(it.grams, g)) errs.push(`#${k} gram ${it.grams} ∉ ${g}`);
    if (!inR(it.kcal, kc)) errs.push(`#${k} kcal ${it.kcal} ∉ ${kc}`);
    if (!Number.isFinite(it.kcal) || !Number.isFinite(it.grams)) errs.push(`#${k} sayı değil`);
  });
  if (errs.length) fails.push(`${s}\n     ${errs.join('; ')}\n     ${dump}`); else pass++;
}

// Veri bütünlüğü: her besin için pozitif/sonlu değerler, varsayılan birim tanımlı
FOODS.forEach(f => {
  const errs = [];
  ['kcal', 'p', 'c', 'f'].forEach(k => { if (!(Number.isFinite(f[k]) && f[k] >= 0)) errs.push(k); });
  if (f.kcal > 900) errs.push('kcal>900');
  const FIBER_OK = { limon: 1, 'limon-suyu': 1, kakao: 1, 'd-lime': 1, 'd-toz-biber': 1, 'd-psyllium': 1, 'd-bugday-kepegi': 1, 'a-tatlandirici-ksilitol': 1, 'a-sekerleme-sekersiz': 1 }; // lif / şeker alkolü ağırlıklı, USDA değerleri doğru
  const macro = f.p * 4 + f.c * 4 + f.f * 9 + (f.alc || 0) * 7; // alc: 100 ml'deki alkol (g)
  if (f.alc != null && !(f.alc >= 0 && f.alc <= 45)) errs.push('alc ' + f.alc);
  if (!FIBER_OK[f.id] && f.kcal > 20 && Math.abs(macro - f.kcal) / f.kcal > 0.35 && !/alkol|bira|şarap|rakı|viski|votka/i.test(f.name + f.cat)) errs.push(`makro ${Math.round(macro)} vs kcal ${f.kcal}`);
  Object.entries(f.units || {}).forEach(([u, g]) => { if (!(g > 0)) errs.push('birim ' + u); });
  if (f.def && f.def !== 'g' && f.def !== 'ml' && !(f.units || {})[f.def]) errs.push('def birimi yok: ' + f.def);
  if (errs.length) fails.push(`veri: ${f.id} ${errs.join(', ')}`); else pass++;
});
const ids = new Set(); FOODS.forEach(f => { if (ids.has(f.id)) fails.push('yinelenen id ' + f.id); ids.add(f.id); });

if (fails.length) { console.log('BAŞARISIZ:'); fails.forEach(f => console.log('  ✗ ' + f)); }
console.log(`\n${pass} geçti, ${fails.length} kaldı (${C.length} cümle, ${FOODS.length} besin)`);
process.exit(fails.length ? 1 : 0);
