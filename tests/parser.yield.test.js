#!/usr/bin/env node
/*
 * Kemikli / derili / bütün alımlar: brüt ağırlıktan yenen net ete (yenebilir oran) testleri.
 * Çalıştırma:  node tests/parser.yield.test.js
 *
 * "1,5 kiloluk bütün tavuk yedim, kemiğini ve derisini yemedim" -> derisiz tavuk eti, 1500 g x 0,48 = 720 g (çiğ)
 * "1 kilo kemikli pirzola yedim, kemiğini ve yağını yemedim"   -> yağsız kuzu eti, 1000 g x 0,55 = 550 g (çiğ)
 * Bağlam yoksa ("200 gram tavuk göğsü") hiçbir şey değişmez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('../parser.js');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'foods.js'), 'utf8'), ctx);
const FOODS = ctx.window.FOODS;
const byId = Object.fromEntries(FOODS.map(f => [f.id, f]));

let pass = 0;
const fails = [];
function check(name, fn) {
  try { fn(); pass++; } catch (e) { fails.push(name + '\n     ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }
const dump = r => JSON.stringify({ items: r.items.map(i => [i.foodId, i.qty, i.unit, i.grams, i.kcal, i.state, i.confidence, i.yieldNote || '']), unmatched: r.unmatched.map(u => u.text) });

/**
 * yes(cümle, besinId, netGram, {state, ratio, items, idx, removed, conf})
 * Brüt hesabı uygulanmalı: kalem besinId, gram = netGram (±5), kcal = gram x 100 g değeri (çiğ/pişmiş).
 */
function yes(s, id, net, o = {}) {
  check('evet: ' + s, () => {
    const r = P.parse(s, FOODS);
    const n = o.items || 1;
    assert(r.items.length === n, `kalem sayısı ${r.items.length} != ${n}: ${dump(r)}`);
    assert(!r.unmatched.length, `eşleşmeyen parça kaldı: ${dump(r)}`);
    const it = r.items[o.idx || 0];
    assert(it.foodId === id, `besin ${it.foodId} != ${id}: ${dump(r)}`);
    assert(it.unit === 'g', `birim g değil: ${dump(r)}`);
    assert(Math.abs(it.grams - net) <= 5, `net ${it.grams} g != ${net} g: ${dump(r)}`);
    assert(it.yield && it.yieldNote && it.yieldShort, `yield notu yok: ${dump(r)}`);
    assert(it.yieldNote.indexOf(String(it.grams)) >= 0, `not net gramı göstermiyor: ${it.yieldNote}`);
    const st = o.state || 'raw';
    const f = byId[id];
    if (P.hasStates(f)) {
      assert(it.state === st, `hâl ${it.state} != ${st}: ${dump(r)}`);
      const v = P.stateValues(f, st);
      assert(Math.abs(it.kcal - Math.round(v.kcal * it.grams / 100)) <= 1, `kcal ${it.kcal} net gramla hesaplanmamış: ${dump(r)}`);
    }
    if (o.ratio != null) assert(Math.abs(it.yield.ratio - o.ratio) < 0.011, `oran ${it.yield.ratio} != ${o.ratio}`);
    if (o.removed) o.removed.forEach(w => assert(it.yield.removed.indexOf(w) >= 0, `çıkarılanlarda "${w}" yok: ${it.yield.removed}`));
    if (o.keep) assert(it.yieldNote.indexOf(o.keep) >= 0, `notta "${o.keep}" yok: ${it.yieldNote}`);
    if (o.minConf != null) assert(it.confidence >= o.minConf, `güven ${it.confidence} < ${o.minConf}`);
    if (o.maxConf != null) assert(it.confidence <= o.maxConf, `güven ${it.confidence} > ${o.maxConf}`);
    if (o.other) o.other.forEach(([k, oid]) => assert(r.items[k].foodId === oid && !r.items[k].yield, `#${k} ${r.items[k].foodId} != ${oid} (yieldsiz): ${dump(r)}`));
  });
}

/** no(cümle, [[besinId, gram]]): brüt hesabı UYGULANMAMALI; kalemler aynen beklenen gibi */
function no(s, specs) {
  check('hayır: ' + s, () => {
    const r = P.parse(s, FOODS);
    assert(r.items.length === specs.length, `kalem sayısı ${r.items.length} != ${specs.length}: ${dump(r)}`);
    specs.forEach(([id, g], k) => {
      const it = r.items[k];
      assert(it.foodId === id, `#${k} besin ${it.foodId} != ${id}: ${dump(r)}`);
      if (g != null) assert(it.grams === g, `#${k} gram ${it.grams} != ${g}: ${dump(r)}`);
      assert(!it.yield && !it.yieldNote, `#${k} brüt hesabı uygulanmamalıydı: ${dump(r)}`);
    });
  });
}

/* ---- veri: hedef besinler var, çiğ/pişmiş değerli ---- */
['tavuk-eti-derisiz', 'tavuk-eti-derili', 'tavuk-gogsu-derili', 'kuzu-eti-yagsiz', 'hindi-eti-derili', 'tavuk-but', 'tavuk-but-derisiz', 'tavuk-baget',
  'tavuk-kalca', 'tavuk-kanat', 'tavuk-gogsu', 'kuzu-pirzola', 'kuzu-eti', 'kuzu-kaburga', 'y-kuzu-but', 'dana-pirzola', 'dana-kaburga', 'dana-kusbasi',
  'y-dana-but', 'y-hindi-but', 'hindi-gogus', 'cipura', 'levrek', 'hamsi-tava']
  .forEach(id => check('veri: ' + id, () => { assert(byId[id], 'besin yok'); assert(P.hasStates(byId[id]), 'çiğ/pişmiş değeri yok'); }));

/* ---- kullanıcının iki örneği ---- */
yes('1,5 kiloluk bütün tavuk yedim, kemiğini ve derisini yemedim', 'tavuk-eti-derisiz', 720, { ratio: 0.48, removed: ['kemik', 'deri'], minConf: 1 });
yes('1 kilo kemikli pirzola yedim, kemiğini ve yağını yemedim', 'kuzu-eti-yagsiz', 550, { ratio: 0.55, removed: ['kemik', 'yağ'], minConf: 1 });

/* ---- bütün tavuk: yazım / ses varyantları ---- */
yes('bir buçuk kiloluk bütün tavuk yedim kemiğini ve derisini yemedim', 'tavuk-eti-derisiz', 720);
yes('Bir buçuk kiloluk bütün tavuk yedim. Kemiğini ve derisini yemedim.', 'tavuk-eti-derisiz', 720);
yes('1.5 kilo bütün tavuk yedim kemiklerini ve derisini yemedim', 'tavuk-eti-derisiz', 720);
yes('1,5 kg bütün tavuk yedim, derisini ve kemiklerini yemedim', 'tavuk-eti-derisiz', 720);
yes('1500 gram bütün tavuk yedim kemiğini derisini yemedim', 'tavuk-eti-derisiz', 720);
yes('1,5 kg bütün tavuk derisini yemedim', 'tavuk-eti-derisiz', 720);
yes('1,5 kiloluk bütün tavuk yedim derisini de kemiğini de yemedim', 'tavuk-eti-derisiz', 720);
yes('1,5 kiloluk bütün tavuk yedim, derisini hiç yemedim', 'tavuk-eti-derisiz', 720);
yes('1,5 kiloluk bütün piliç yedim tavuğun derisini yemedim', 'tavuk-eti-derisiz', 720);
yes('kemiğini ve derisini yemediğim 1,5 kiloluk bütün tavuk', 'tavuk-eti-derisiz', 720);
yes('akşam 1,5 kiloluk bütün tavuk yedim kemiğini ve derisini ayıkladım', 'tavuk-eti-derisiz', 720);
yes('1,5 kg brüt tavuk yedim kemiğini ve derisini çıkardım', 'tavuk-eti-derisiz', 720);
yes('1,5 kg temizlenmemiş tavuk yedim, temizledim', 'tavuk-eti-derisiz', 720);
yes('iki kiloluk bütün tavuk yedim kemiğini ve derisini attım', 'tavuk-eti-derisiz', 960);
// deri yendi: yalnızca kemik düşer
yes('1.5 kilo bütün tavuk yedim derisiyle yedim', 'tavuk-eti-derili', 1020, { ratio: 0.68, keep: 'deri dahil' });
yes('1,5 kiloluk bütün tavuk yedim derisiyle birlikte, kemiğini yemedim', 'tavuk-eti-derili', 1020);
yes('1,5 kiloluk bütün tavuk yedim kemiğini yemedim derisini de yedim', 'tavuk-eti-derili', 1020);
yes('1,5 kiloluk bütün tavuk yedim', 'tavuk-eti-derili', 1020);
yes('1,5 kiloluk tavuk yedim', 'tavuk-eti-derili', 1020);
yes('1,5 kiloluk bütün tavuk yedim derisi dahil', 'tavuk-eti-derili', 1020);
// adetle bütün tavuk: ortalama 1,3 kg varsayılır, kontrol edilsin diye güven düşük
yes('1 bütün tavuk yedim kemiğini ve derisini yemedim', 'tavuk-eti-derisiz', 625, { maxConf: 0.79 });
yes('bütün bir tavuk yedim kemiklerini ve derisini yemedim', 'tavuk-eti-derisiz', 625, { maxConf: 0.79 });
// pişmiş ağırlık söylenirse pişmiş değerler
yes('1,5 kiloluk bütün tavuk yedim pişmiş ağırlığı, kemiğini ve derisini yemedim', 'tavuk-eti-derisiz', 720, { state: 'cooked' });

/* ---- tavuk parçaları ---- */
yes('800 gram kemikli tavuk but derisini yemedim', 'tavuk-but-derisiz', 465, { ratio: 0.58 });
yes('800 gram kemikli tavuk but derisiyle birlikte yedim', 'tavuk-but', 560, { ratio: 0.7 });
yes('1 kilo kemikli tavuk but yedim', 'tavuk-but', 700);
yes('kemiğiyle 1 kilo tavuk but yedim derisini yemedim', 'tavuk-but-derisiz', 580);
yes('1 kilo tavuk baget yedim kemiklerini ve derisini yemedim', 'tavuk-baget', 500, { ratio: 0.5 });
yes('1 kilo tavuk baget kemikli', 'tavuk-but', 600);
yes('500 gram tavuk kalça kemikli derisiyle', 'tavuk-but', 375);
yes('500 gram kemikli tavuk kalça derisini yemedim', 'tavuk-kalca', 310);
yes('1 kilo tavuk kanat kemikli', 'tavuk-kanat', 490, { ratio: 0.49 });
yes('1 kilo kanat yedim kemiklerini attım', 'tavuk-kanat', 490);
yes('1 kilo tavuk kanat yedim kemiğini ve derisini yemedim', 'tavuk-eti-derisiz', 330);
yes('1 kilo kemikli tavuk göğsü derisini yemedim', 'tavuk-gogsu', 700, { ratio: 0.7 });
yes('1 kilo kemikli tavuk göğsü derisiyle yedim', 'tavuk-gogsu-derili', 790);
// kemik bağlamı yok, yalnızca "derisini yemedim": brüt içindeki deri payı düşer
yes('300 gram tavuk but yedim derisini yemedim', 'tavuk-but-derisiz', 250);

/* ---- hindi ---- */
yes('2 kilo bütün hindi derisiz yedim kemiğini yemedim', 'y-hindi-but', 1100);
yes('1 kilo kemikli hindi but derisini yemedim', 'y-hindi-but', 600);
yes('1 kilo kemikli hindi but yedim', 'hindi-eti-derili', 700);

/* ---- kuzu / dana ---- */
yes('1 kilo kemikli pirzola yedim', 'kuzu-pirzola', 750, { ratio: 0.75, keep: 'yağ dahil' });
yes('bir kilo kemikli kuzu pirzola yedim kemiklerini ve yağlarını yemedim', 'kuzu-eti-yagsiz', 550);
yes('kemiğiyle 1 kilo kuzu pirzola yedim', 'kuzu-pirzola', 750);
yes('1 kilo pirzola yedim kemiklerini attım', 'kuzu-pirzola', 750);
yes('1 kilo pirzola yedim kemik dahil', 'kuzu-pirzola', 750);
yes('1 kilo pirzola kemikleri hariç', 'kuzu-pirzola', 750);
yes('1 kilo kemikli pirzola yedim yağlı kısımlarını yemedim', 'kuzu-eti-yagsiz', 550);
yes('yarım kilo kemikli kuzu', 'kuzu-eti', 360, { ratio: 0.72 });
yes('yarım kilo kemikli kuzu eti yedim yağını ayıkladım', 'kuzu-eti-yagsiz', 290);
yes('kemikli 1 kilo kuzu yedim yağını yemedim', 'kuzu-eti-yagsiz', 580);
yes('1 kilo kuzu kaburga kemikli', 'kuzu-kaburga', 680);
yes('1 kilo kemikli kuzu but yedim', 'y-kuzu-but', 800);
yes('1 kilo dana kaburga yedim kemiklerini ve yağını ayıkladım', 'y-dana-but', 450);
yes('1 kilo dana incik kemikli', 'dana-kusbasi', 680);
yes('1 kilo kemikli et yedim', 'dana-kusbasi', 780);
yes('kemikli 1 kilo dana pirzola', 'dana-pirzola', 820);
yes('1 kilo kemikli pirzola yedim pişmiş ağırlığı, kemiğini ayıkladım', 'kuzu-pirzola', 750, { state: 'cooked' });

/* ---- bütün balık ---- */
yes('1 kilo çipura kılçığını ayıkladım', 'cipura', 500, { removed: ['kılçık'] });
yes('1 kilo bütün çipura yedim kılçığını ve kafasını yemedim', 'cipura', 500);
yes('bütün levrek 800 gram kılçığını yemedim', 'levrek', 400);
yes('1 kilo bütün hamsi yedim kafasını ve kılçığını ayıkladım', 'hamsi-tava', 620);
yes('yarım kilo hamsi kılçıklarını ayıkladım', 'hamsi-tava', 310);
yes('1 kilo palamut yedim kılçığını ayıkladım', 'lufer', 550);
yes('1 kilo bütün çipura yedim derisini ve kılçığını yemedim', 'cipura', 450);

/* ---- karışık öğünler: işaret doğru kaleme gider ---- */
yes('1 kilo pirzola kemikli ve bir kase pilav', 'kuzu-pirzola', 750, { items: 2, other: [[1, 'pirinc-pilavi']] });
yes('bir kase pilav ve kemikli 1 kilo kuzu ve salata', 'kuzu-eti', 720, { items: 3, idx: 1, other: [[0, 'pirinc-pilavi'], [2, 'mevsim-salata']] });
yes('1,5 kiloluk bütün tavuk ve salata yedim, kemiğini ve derisini yemedim', 'tavuk-eti-derisiz', 720, { items: 2, other: [[1, 'mevsim-salata']] });
yes('2 dilim ekmek, 1 kilo kemikli pirzola, kemiğini ve yağını yemedim, bir bardak ayran', 'kuzu-eti-yagsiz', 550, { items: 3, idx: 1 });

/* ---- adetle söylenen parçalar: oran yok, yalnızca derili/derisiz tercihi ---- */
check('adet: "2 tavuk but yedim derisini yemedim" -> 2 adet derisiz but', () => {
  const r = P.parse('2 tavuk but yedim derisini yemedim', FOODS);
  assert(r.items.length === 1 && !r.unmatched.length, dump(r));
  const it = r.items[0];
  assert(it.foodId === 'tavuk-but-derisiz' && it.qty === 2 && it.unit === 'adet' && !it.yield, dump(r));
});
check('adet: "tavuk but derisiyle yedim" -> derili but', () => {
  const r = P.parse('tavuk but derisiyle yedim', FOODS);
  assert(r.items.length === 1 && r.items[0].foodId === 'tavuk-but' && !r.unmatched.length, dump(r));
});
no('2 çipura kılçığını ayıkladım', [['cipura', 300]]);

/* ---- ayıklama cümlesi tek başına besin üretmez ---- */
check('yalnızca "kemiğini ve derisini yemedim" boş sonuç', () => {
  const r = P.parse('kemiğini ve derisini yemedim', FOODS);
  assert(!r.items.length && !r.unmatched.length, dump(r));
});

/* ---- olumsuz: bağlam yoksa davranış aynen korunur ---- */
no('200 gram tavuk göğsü', [['tavuk-gogsu', 200]]);
no('1 kilo tavuk', [['tavuk-gogsu', 1000]]);
no('1,5 kilo tavuk yedim', [['tavuk-gogsu', 1500]]);
no('500 gramlık tavuk göğsü', [['tavuk-gogsu', 500]]);
no('kemiksiz tavuk but 200 gram', [['tavuk-but', 200]]);
no('kemiksiz derisiz tavuk pirzola', [['tavuk-pirzola', 120]]);
no('200 gram kemiksiz derisiz tavuk pirzola yedim', [['tavuk-pirzola', 200]]);
no('kemikli tavuk pirzola', [['tavuk-pirzola-derili', 130]]);
no('200 gram kemikli tavuk pirzola', [['tavuk-pirzola-derili', 200]]);
no('derili tavuk but', [['tavuk-but', 100]]);
no('derisiz tavuk but', [['tavuk-but-derisiz', 90]]);
no('2 adet tavuk but derisiz', [['tavuk-but-derisiz', 180]]);
no('tavuk derisi', [['y-tavuk-derisi', 15]]);
no('tavuk derisi yedim', [['y-tavuk-derisi', 15]]);
no('kemik suyu', [['b-hazir-et-suyu', null]]);
no('bütün piliç', [['firin-pilic', 150]]);
no('kuzu pirzola 3 adet', [['kuzu-pirzola', 180]]);
no('pirzola', [['kuzu-pirzola', 60]]);
no('300 gram kuzu pirzola', [['kuzu-pirzola', 300]]);
no('1 kilo pirzola', [['kuzu-pirzola', 1000]]);
no('150 gram çipura', [['cipura', 150]]);
no('2 tavuk but', [['tavuk-but', 200]]);
no('bütün buğday ekmeği', [['tam-bugday-ekmegi', null]]);
no('bütün ekmek tavuk döner', [['c-td-tam-ekmek-tavuk-doner', null]]);
no('köpüklü şarap brüt', [['a-sarap-kopuklu', null]]);
no('zeytin yağı ile salata', [['zeytinyagi', null], ['mevsim-salata', null]]);
no('1 porsiyon tavuk döner', [['doner-tavuk', 150]]);
no('kuzu tandır 1 porsiyon', [['kuzu-tandir', 150]]);

console.log(`\n${pass} geçti, ${fails.length} kaldı`);
if (fails.length) { console.log('\nBAŞARISIZ:'); fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fails.length ? 1 : 0);
