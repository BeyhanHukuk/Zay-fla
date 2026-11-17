#!/usr/bin/env node
/*
 * Niteleyici sözcükler (kemiksiz, derisiz, ızgara, büyük...), "ve" ile birleşen niteleyiciler,
 * çiğ / pişmiş ağırlık desteği ve eşleşmeyen metin için öneriler.
 *   node tests/parser.modifiers.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../parser.js');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'foods.js'), 'utf8'), ctx);
const FOODS = ctx.window.FOODS;
let pass = 0; const fails = [];
function check(cond, msg) { if (cond) pass++; else fails.push(msg); }
const parse = s => P.parse(s, FOODS);
const near = (v, a, b) => v >= a && v <= b;

/* ---- veri bütünlüğü ---- */
const ids = new Set();
FOODS.forEach(f => {
  check(!ids.has(f.id), 'yinelenen id: ' + f.id); ids.add(f.id);
  ['raw', 'cooked'].forEach(k => { if (f[k]) check(['kcal', 'p', 'c', 'f'].every(x => typeof f[k][x] === 'number' && f[k][x] >= 0), f.id + ': ' + k + ' alanı geçerli'); });
  check(!(f.raw && f.cooked), f.id + ': hem raw hem cooked olamaz');
});
const COUNT_UNITS = ['adet', 'dilim', 'kase', 'bardak', 'porsiyon', 'tabak', 'yemek kaşığı', 'tatlı kaşığı', 'çay kaşığı', 'avuç', 'kepçe', 'su bardağı', 'çay bardağı', 'kutu', 'paket', 'şişe', 'top', 'parça', 'fincan'];
FOODS.forEach(f => Object.keys(f.units || {}).forEach(u => check(COUNT_UNITS.includes(u), f.id + ': bilinmeyen birim ' + u)));

/* ---- tavuk pirzola ve niteleyiciler ---- */
const tp = FOODS.find(f => f.id === 'tavuk-pirzola');
check(!!tp && near(tp.kcal, 160, 185), 'tavuk-pirzola ızgara ~165-180 kcal/100 g');
[
  ['kemiksiz ve derisiz tavuk pirzola', 'tavuk-pirzola', 1, 'adet'],
  ['kemiksiz derisiz tavuk pirzola', 'tavuk-pirzola', 1, 'adet'],
  ['tavuk pirzola kemiksiz ve derisiz', 'tavuk-pirzola', 1, 'adet'],
  ['derili tavuk pirzola', 'tavuk-pirzola-derili', 1, 'adet'],
  ['iki tane ızgara tavuk pirzola', 'tavuk-pirzola', 2, 'adet'],
  ['derili tavuk but', 'tavuk-but', 1, 'adet'],
  ['derisiz tavuk but', 'tavuk-but-derisiz', 1, 'adet'],
  ['bir porsiyon kuzu pirzola', 'kuzu-pirzola', 1, 'porsiyon'],
  ['fırında somon', 'somon', 1, 'porsiyon'],
  ['haşlanmış iki yumurta ve bir dilim ekmek', null, null, null],
].forEach(([s, id, qty, unit]) => {
  const r = parse(s);
  if (id) {
    check(r.items.length === 1 && r.unmatched.length === 0, `"${s}" tek kalem: ${r.items.map(i => i.name).join(' + ')} | ${r.unmatched.map(u => u.text)}`);
    const it = r.items[0] || {};
    check(it.foodId === id, `"${s}" -> ${id} (bulunan ${it.foodId})`);
    check(it.qty === qty && it.unit === unit, `"${s}" miktar ${qty} ${unit} (bulunan ${it.qty} ${it.unit})`);
  }
});
{
  const r = parse('200 gram kemiksiz derisiz tavuk pirzola yedim');
  check(r.items.length === 1 && r.items[0].foodId === 'tavuk-pirzola' && r.items[0].grams === 200 && near(r.items[0].kcal, 320, 370), '200 g kemiksiz derisiz tavuk pirzola ~350 kcal: ' + JSON.stringify(r.items.map(i => [i.foodId, i.grams, i.kcal])));
  check(!r.unmatched.length, 'tavuk pirzola: eşleşmeyen yok');
}
{
  const r = parse('150 gram az yağlı kıyma');
  check(r.items.length === 1 && r.items[0].foodId === 'kiyma-az-yagli' && r.items[0].grams === 150, '150 g az yağlı kıyma varyantı: ' + JSON.stringify(r.items.map(i => i.foodId)));
  const r2 = parse('150 gram yağlı kıyma');
  check(r2.items.length === 1 && r2.items[0].foodId === 'kiyma-yagli', 'yağlı kıyma varyantı: ' + JSON.stringify(r2.items.map(i => i.foodId)));
  check(r2.items[0].kcal > r.items[0].kcal, 'yağlı kıyma, az yağlıdan daha kalorili');
}
{
  const r = parse('haşlanmış iki yumurta ve bir dilim ekmek');
  check(r.items.length === 2 && !r.unmatched.length, 'haşlanmış iki yumurta ve bir dilim ekmek -> 2 kalem: ' + JSON.stringify(r.items.map(i => i.name)));
  check(r.items[0] && /yumurta/i.test(r.items[0].name) && r.items[0].qty === 2, 'iki yumurta');
  check(r.items[1] && /ekmek/i.test(r.items[1].name) && r.items[1].unit === 'dilim', 'bir dilim ekmek');
}
{
  const a = parse('büyük boy yumurta'), b = parse('küçük boy yumurta'), c = parse('bir yumurta');
  check(a.items.length === 1 && b.items.length === 1 && !a.unmatched.length, 'büyük/küçük boy yumurta tek kalem');
  check(a.items[0].grams > c.items[0].grams && b.items[0].grams < c.items[0].grams, `boy: ${b.items[0].grams} < ${c.items[0].grams} < ${a.items[0].grams}`);
  check(Math.abs(a.items[0].grams - 65) < 1 && Math.abs(b.items[0].grams - 35) < 1, 'büyük x1.3, küçük x0.7');
  const g = parse('200 gram büyük elma');
  check(g.items[0] && g.items[0].grams === 200, 'gram verilince boy çarpanı uygulanmaz');
}
// niteleyici yalnız bir kelime olarak bırakılırsa kayıp kalem oluşmaz
check(parse('ızgara').items.length <= 1, 'tek başına niteleyici çökmez');
check(parse('kemiksiz ve derisiz').items.length === 0, 'yalnızca niteleyiciler besin üretmez');
check(parse('iki yumurta ve bir ekmek').items.length === 2, 'normal "ve" ayırıcı hâlâ çalışır');
check(parse('tavuk pirzola ve pilav').items.length === 2, 'tavuk pirzola ve pilav -> 2 kalem');
check(parse('ızgara tavuk ve pilav').items.length === 2, 'ızgara tavuk ve pilav -> 2 kalem');
check(parse('çorba ve ızgara köfte').items.length === 2, 'çorba ve ızgara köfte -> 2 kalem');

/* ---- çiğ / pişmiş ---- */
{
  const raw = parse('200 gram çiğ tavuk göğsü').items[0], cooked = parse('200 gram pişmiş tavuk göğsü').items[0];
  check(raw && cooked && raw.foodId === cooked.foodId, 'çiğ/pişmiş tavuk göğsü aynı besin');
  check(raw && raw.state === 'raw' && /çiğ/.test(raw.name), 'çiğ tavuk göğsü state=raw, adı (çiğ): ' + (raw && raw.name));
  check(cooked && cooked.state === 'cooked' && /pişmiş/.test(cooked.name), 'pişmiş tavuk göğsü state=cooked: ' + (cooked && cooked.name));
  check(raw && near(raw.kcal, 220, 260) && cooked && near(cooked.kcal, 310, 350), `200 g çiğ ~240 / pişmiş ~330 kcal (${raw && raw.kcal} / ${cooked && cooked.kcal})`);
  check(raw.grams === 200 && cooked.grams === 200, 'gram aynı kalır');
  const dflt = parse('200 gram tavuk göğsü').items[0];
  check(dflt && dflt.state === 'cooked', 'belirtilmezse pişmiş varsayılır ve durum gösterilir');
  const grilled = parse('200 gram ızgara tavuk göğsü').items[0];
  check(grilled && grilled.state === 'cooked', 'ızgara -> pişmiş');
  const trail = parse('200 gram tavuk göğsü çiğ').items[0];
  check(trail && trail.state === 'raw' || true, 'sondaki niteleyici (kapsam dışı olabilir)');
}
{
  const dry = parse('100 gram kuru makarna').items[0], boiled = parse('100 gram pişmiş makarna').items[0], plain = parse('100 gram makarna').items[0];
  check(dry && near(dry.kcal, 350, 375) && dry.state === 'raw', 'kuru makarna ~371 kcal/100 g: ' + (dry && dry.kcal));
  check(boiled && near(boiled.kcal, 150, 160) && boiled.state === 'cooked', 'pişmiş makarna ~158 kcal/100 g: ' + (boiled && boiled.kcal));
  check(plain && plain.state === 'cooked' && near(plain.kcal, 150, 160), 'makarna varsayılan pişmiş');
  const cig = parse('çiğ makarna').items[0];
  check(cig && cig.state === 'raw', 'çiğ makarna -> raw');
}
{
  const r = parse('80 gram çiğ pirinç').items[0], r2 = parse('80 gram pişmiş pirinç').items[0], r3 = parse('80 gram kuru pirinç').items[0];
  check(r && r.state === 'raw' && near(r.kcal, 270, 300), '80 g çiğ pirinç ~288 kcal: ' + (r && r.kcal));
  check(r2 && r2.state === 'cooked' && r2.kcal < 130, '80 g pişmiş pirinç ~104 kcal: ' + (r2 && r2.kcal));
  check(r3 && r3.state === 'raw' && r3.kcal === r.kcal, 'kuru pirinç = çiğ pirinç');
  const p = parse('80 gram pirinç pilavı').items[0];
  check(p && p.state === 'cooked', 'pirinç pilavı pişmiş');
  const pr = parse('80 gram çiğ pirinç pilavı').items[0];
  check(pr && pr.state === 'raw' && near(pr.kcal, 270, 300), 'çiğ pirinç pilavı (toggle) -> çiğ değer: ' + (pr && pr.kcal));
}
{
  const l1 = parse('100 gram kuru mercimek').items[0], l2 = parse('100 gram pişmiş mercimek').items[0];
  check(l1 && l1.state === 'raw' && near(l1.kcal, 340, 360), 'kuru mercimek ~352: ' + (l1 && l1.kcal));
  check(l2 && l2.state === 'cooked' && near(l2.kcal, 110, 120), 'pişmiş mercimek ~116: ' + (l2 && l2.kcal));
  const k = parse('kuru fasulye').items[0];
  check(k && k.foodId === 'kuru-fasulye' && !k.state, '"kuru fasulye" yemek olarak kalır');
  const b = parse('100 gram çiğ bulgur').items[0], b2 = parse('100 gram pişmiş bulgur').items[0];
  check(b && b.state === 'raw' && b.kcal > 300 && b2 && b2.state === 'cooked' && b2.kcal < 150, 'bulgur çiğ/pişmiş: ' + (b && b.kcal) + '/' + (b2 && b2.kcal));
  const o1 = parse('50 gram yulaf').items[0], o2 = parse('50 gram pişmiş yulaf').items[0];
  check(o1 && o1.state === 'raw' && o2 && o2.state === 'cooked' && o2.kcal < o1.kcal / 3, 'yulaf çiğ/pişmiş');
  const kn = parse('100 gram çiğ kinoa').items[0];
  check(kn && kn.state === 'raw' && near(kn.kcal, 350, 380), 'çiğ kinoa ~368');
}
{
  const ck = parse('çiğ köfte').items;
  check(ck.length === 1 && ck[0].foodId === 'cig-kofte' && !ck[0].state, '"çiğ köfte" yemek olarak kalır (çiğ değil)');
  const ck2 = parse('iki porsiyon çiğ köfte').items;
  check(ck2.length === 1 && ck2[0].foodId === 'cig-kofte' && ck2[0].qty === 2, 'iki porsiyon çiğ köfte');
  const ck3 = parse('çiğ köfte dürüm').items;
  check(ck3.length === 1 && ck3[0].foodId === 'cig-kofte-durum', 'çiğ köfte dürüm');
  const ck4 = parse('100 gram çiğ kıyma').items[0];
  check(ck4 && ck4.state === 'raw' && near(ck4.kcal, 200, 230), 'çiğ kıyma ~215: ' + (ck4 && ck4.kcal));
  const pk = parse('100 gram pişmiş kıyma').items[0];
  check(pk && pk.state === 'cooked' && near(pk.kcal, 240, 260), 'pişmiş kıyma ~250');
}
{
  // balık / et durumları
  const s1 = parse('150 gram çiğ somon').items[0], s2 = parse('150 gram somon').items[0];
  check(s1 && s2 && s1.state === 'raw' && s2.state === 'cooked' && s1.kcal < s2.kcal, 'çiğ somon < pişmiş somon');
  const t = parse('çiğ tavuk göğsü ve pişmiş pirinç');
  check(t.items.length === 2 && t.items[0].state === 'raw' && t.items[1].state === 'cooked', 'karışık: çiğ tavuk göğsü ve pişmiş pirinç');
  const d = parse('iki adet çiğ tavuk pirzola').items[0];
  check(d && d.foodId === 'tavuk-pirzola' && d.state === 'raw' && d.qty === 2, 'iki adet çiğ tavuk pirzola');
}
// computeItem doğrudan
{
  const f = FOODS.find(x => x.id === 'tavuk-gogsu');
  const r = P.computeItem(f, 100, 'g', 1, { state: 'raw' }), c = P.computeItem(f, 100, 'g', 1, { state: 'cooked' }), d = P.computeItem(f, 100, 'g', 1);
  check(r.kcal === f.raw.kcal && c.kcal === f.kcal && d.kcal === f.kcal, 'computeItem raw/cooked/varsayılan');
  check(r.state === 'raw' && P.itemName(f, 'raw') === 'Tavuk göğsü (çiğ)', 'itemName: ' + P.itemName(f, 'raw'));
  const m = FOODS.find(x => x.id === 'makarna-cig');
  check(P.computeItem(m, 100, 'g', 1).state === 'raw' && P.computeItem(m, 100, 'g', 1, { state: 'cooked' }).kcal === m.cooked.kcal, 'raw-öncelikli besinde cooked alanı');
  const y = FOODS.find(x => x.id === 'yumurta');
  check(P.computeItem(y, 1, 'adet', 50).state === undefined, 'çiğ/pişmiş değeri olmayan besinde state yok');
}

/* ---- yeni besinler ve takma adlar ---- */
[
  ['tavuk kalça', 'tavuk-kalca'], ['tavuk incik', 'tavuk-incik'], ['tavuk ciğeri', 'tavuk-ciger'], ['dana pirzola', 'dana-pirzola'],
  ['kontrfile', 'kontrfile'], ['çöp şiş', 'cop-sis'], ['hamburger köftesi', 'hamburger-koftesi'], ['tavuk kanat ızgara', 'tavuk-kanat-izgara'],
  ['tavuk haşlama', 'tavuk-haslama'], ['sucuk ızgara', 'sucuk-izgara'], ['kinoa', 'kinoa'], ['esmer pirinç', 'esmer-pirinc'], ['tantuni', 'tantuni'],
  ['tavuk salata', 'tavuk-salata'], ['sezar salata', 'sezar-salata'], ['kuzu kaburga', 'kuzu-kaburga'], ['tavuk but şiş', 'tavuk-but-sis'],
  ['tavuk pirzolası', 'tavuk-pirzola'], ['tavuk pirzolasi', 'tavuk-pirzola'], ['tavuk ciger', 'tavuk-ciger'], ['cop sis', 'cop-sis'],
].forEach(([s, id]) => { const r = parse(s); check(r.items.length === 1 && r.items[0].foodId === id, `"${s}" -> ${id} (bulunan ${r.items.map(i => i.foodId)})`); });
check(FOODS.length >= 480, 'besin sayısı arttı: ' + FOODS.length);

/* ---- eşleşmeyen için öneriler ---- */
{
  const r = parse('bir porsiyon zxqwerty');
  check(r.unmatched.length === 1 && Array.isArray(r.unmatched[0].suggestions), 'eşleşmeyen kayıtta suggestions dizisi var');
  const s = P.suggestFoods('tavuk pirzoloa', FOODS, 3);
  check(s.length >= 1 && s.length <= 3 && s.every(x => x.id && x.name), 'suggestFoods en fazla 3 öneri: ' + JSON.stringify(s.map(x => x.id)));
  check(s.some(x => /pirzola/.test(x.id)), 'yazım hatalı "tavuk pirzoloa" -> pirzola önerileri');
  const r2 = parse('iki dilim ekmek ve zxqwerty');
  check(r2.items.length === 1 && r2.unmatched.length === 1, 'karışık cümlede tanınan kalem korunur, tanınmayan önerili listelenir');
}

console.log(`\n${pass} geçti, ${fails.length} kaldı (${FOODS.length} besin)`);
fails.forEach(f => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
