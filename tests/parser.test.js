#!/usr/bin/env node
/*
 * parser.js birim testleri. Çalıştırma:  node tests/parser.test.js
 * Varsayılan olarak ../foods.js kullanılır; yoksa (veya FOODS=stub ise) tests/foods-stub.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('../parser.js');

function loadFoods(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.window.FOODS || ctx.FOODS;
}

const realPath = path.join(__dirname, '..', 'foods.js');
const stubPath = path.join(__dirname, 'foods-stub.js');
const useStub = process.env.FOODS === 'stub' || !fs.existsSync(realPath);
const FOODS = loadFoods(useStub ? stubPath : realPath);
const byId = Object.fromEntries(FOODS.map(f => [f.id, f]));

let pass = 0, fail = 0;
const failures = [];

function foodHas(item, kw) {
  const f = byId[item.foodId];
  if (!f) return false;
  const k = P.fold(kw);
  return [f.name].concat(f.aliases || []).some(a => P.fold(a).includes(k));
}
function near(a, b, tol = 0.01) { return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); }

function check(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push(name + '\n     ' + e.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/**
 * expect(sentence, [{food, qty, unit, grams, minConf, maxConf}], {meal, unmatched})
 */
function expect(sentence, specs, opts = {}) {
  check(sentence, () => {
    const r = P.parse(sentence, FOODS);
    const dump = () => JSON.stringify({ items: r.items.map(i => [i.name, i.qty, i.unit, i.grams, i.confidence]), unmatched: r.unmatched.map(u => u.text), meal: r.meal });
    assert(r.items.length === specs.length, `kalem sayısı ${r.items.length} != ${specs.length}: ${dump()}`);
    specs.forEach((s, k) => {
      const it = r.items[k];
      assert(foodHas(it, s.food), `#${k} besin "${s.food}" bekleniyordu, "${it.name}" geldi: ${dump()}`);
      if (s.qty != null) assert(near(it.qty, s.qty), `#${k} miktar ${it.qty} != ${s.qty}: ${dump()}`);
      if (s.unit != null) assert(it.unit === s.unit, `#${k} birim ${it.unit} != ${s.unit}: ${dump()}`);
      if (s.grams != null && (useStub || ['g', 'ml'].includes(it.unit))) assert(near(it.grams, s.grams), `#${k} gram ${it.grams} != ${s.grams}: ${dump()}`);
      if (s.minConf != null) assert(it.confidence >= s.minConf, `#${k} güven ${it.confidence} < ${s.minConf}: ${dump()}`);
      if (s.maxConf != null) assert(it.confidence <= s.maxConf, `#${k} güven ${it.confidence} > ${s.maxConf}: ${dump()}`);
      assert(it.kcal >= 0 && Number.isFinite(it.kcal), `#${k} kcal geçersiz`);
    });
    if (opts.meal !== undefined) assert(r.meal === opts.meal, `öğün ${r.meal} != ${opts.meal}: ${dump()}`);
    if (opts.unmatched !== undefined) {
      assert(r.unmatched.length === opts.unmatched.length, `eşleşmeyen ${JSON.stringify(r.unmatched)} != ${JSON.stringify(opts.unmatched)}`);
      opts.unmatched.forEach((u, k) => assert(r.unmatched[k].text.includes(u), `eşleşmeyen #${k} "${r.unmatched[k].text}" içinde "${u}" yok`));
    } else {
      assert(r.unmatched.length === 0, `beklenmeyen eşleşmeyen parça: ${dump()}`);
    }
  });
}

/* ---------------- Sayı kelimeleri ---------------- */
[['bir', 1], ['yirmi beş', 25], ['iki yüz elli', 250], ['yüz', 100], ['bin iki yüz', 1200], ['doksan dokuz', 99],
 ['bir buçuk', 1.5], ['yarım', 0.5], ['çeyrek', 0.25], ['iki buçuk', 2.5], ['on iki', 12], ['3', 3], ['1,5', 1.5], ['1/2', 0.5]]
  .forEach(([t, v]) => check('sayı: ' + t, () => { const n = P.parseNumberText(t); assert(n === v, `${t} -> ${n} (beklenen ${v})`); }));

check('normalize: İ/I türkçe küçük harf', () => {
  assert(P.lower('İSTANBUL') === 'istanbul', P.lower('İSTANBUL'));
  assert(P.fold('ÇAĞLA ŞÜKRÜ ÖĞÜN') === 'cagla sukru ogun', P.fold('ÇAĞLA ŞÜKRÜ ÖĞÜN'));
});

/* ---------------- Cümleler ---------------- */
expect('3 yumurta yedim', [{ food: 'yumurta', qty: 3, unit: 'adet', grams: 150, minConf: 0.9 }]);
expect('200 gram tavuk göğsü ve bir kase mercimek çorbası yedim', [
  { food: 'tavuk göğsü', qty: 200, unit: 'g', grams: 200 },
  { food: 'mercimek çorbası', qty: 1, unit: 'kase', grams: 250 }]);
expect('iki dilim ekmek, yarım porsiyon pilav bir de ayran içtim', [
  { food: 'ekmek', qty: 2, unit: 'dilim', grams: 50 },
  { food: 'pilav', qty: 0.5, unit: 'porsiyon', grams: 75 },
  { food: 'ayran', qty: 1 }]);
expect('bir buçuk bardak süt', [{ food: 'süt', qty: 1.5, unit: 'bardak', grams: 300 }]);
expect('150 gr makarna', [{ food: 'makarna', qty: 150, unit: 'g', grams: 150 }]);
expect('10 tane fındık', [{ food: 'fındık', qty: 10, unit: 'adet', grams: 15 }]);
expect('çeyrek ekmek', [{ food: 'ekmek', qty: 0.25, unit: 'adet', grams: 62.5 }]);
expect('kahvaltıda iki yumurta, beyaz peynir ve zeytin yedim', [
  { food: 'yumurta', qty: 2 }, { food: 'peynir', qty: 1 }, { food: 'zeytin' }], { meal: 'kahvalti' });
expect('öğlen bir tabak kuru fasulye ile pilav yedim', [
  { food: 'fasulye', qty: 1, unit: 'tabak' }, { food: 'pilav' }], { meal: 'ogle' });
expect('akşam yemeğinde 4 köfte ve salata', [{ food: 'köfte', qty: 4 }, { food: 'salata' }], { meal: 'aksam' });
expect('yirmi beş gram bal', [{ food: 'bal', qty: 25, unit: 'g', grams: 25 }]);
expect('iki yüz elli ml süt içtim', [{ food: 'süt', qty: 250, unit: 'ml', grams: 250 }]);
expect('yarım kilo yoğurt', [{ food: 'yoğurt', qty: 500, unit: 'g', grams: 500 }]);
expect('1,5 su bardağı ayran', [{ food: 'ayran', qty: 1.5, unit: 'su bardağı' }]);
expect('bir kutu kola içtim', [{ food: 'kola', qty: 1, unit: 'kutu', grams: 330 }]);
expect('2 yemek kaşığı zeytinyağı', [{ food: 'zeytinyağı', qty: 2, unit: 'yemek kaşığı', grams: 26 }]);
expect('üç çay kaşığı şeker', [{ food: 'şeker', qty: 3, unit: 'çay kaşığı', grams: 12 }]);
expect('bir avuç fındık', [{ food: 'fındık', qty: 1, unit: 'avuç', grams: 30 }]);
expect('iki top dondurma', [{ food: 'dondurma', qty: 2, unit: 'top', grams: 120 }]);
expect('bir kepçe mercimek çorbası', [{ food: 'mercimek çorbası', qty: 1, unit: 'kepçe', grams: 125 }]);
expect('yumurtayı ve ekmeği yedim', [{ food: 'yumurta' }, { food: 'ekmek' }]);
expect('mercimek çorbasını içtim', [{ food: 'mercimek çorbası' }]);
expect('ekmek iki dilim', [{ food: 'ekmek', qty: 2, unit: 'dilim' }]);
expect('simit artı çay', [{ food: 'simit' }, { food: 'çay' }]);
expect('bir lahmacun sonra bir ayran', [{ food: 'lahmacun', qty: 1 }, { food: 'ayran', qty: 1 }]);
expect('menemn yedim', [{ food: 'menemen', maxConf: 0.95, minConf: 0.5 }]);
expect('bir tabak xyzqwe yedim', [], { unmatched: ['xyzqwe'] });
expect('on iki zeytin', [{ food: 'zeytin', qty: 12 }]);
expect('bir dilim kaşar peyniri', [{ food: 'kaşar', qty: 1, unit: 'dilim' }]);
expect('bi bardak çay', [{ food: 'çay', qty: 1, unit: 'bardak' }]);
expect('yarım litre su', [{ food: 'su', qty: 500, unit: 'ml', grams: 500 }]);
expect('2.5 dilim ekmek', [{ food: 'ekmek', qty: 2.5, unit: 'dilim' }]);
expect('patates kızartması bir porsiyon', [{ food: 'kızartma', qty: 1, unit: 'porsiyon' }]);
expect('iki elma bir muz', [{ food: 'elma', qty: 2 }, { food: 'muz', qty: 1 }]);
expect('KAHVALTIDA Simit Ve Çay', [{ food: 'simit' }, { food: 'çay' }], { meal: 'kahvalti' });
expect('tavuk gogsu 150 gr', [{ food: 'tavuk göğsü', qty: 150, unit: 'g' }]);
expect('yüz gram tavuk göğsü', [{ food: 'tavuk göğsü', qty: 100, unit: 'g' }]);
expect('10 adet fındık ve 1 muz', [{ food: 'fındık', qty: 10, unit: 'adet' }, { food: 'muz', qty: 1 }]);
expect('üç yüz gram kuru fasulye', [{ food: 'fasulye', qty: 300, unit: 'g' }]);
expect('ara öğünde bir elma', [{ food: 'elma', qty: 1 }], { meal: 'ara' });
expect('sabah 2 dilim peynir 5 zeytin ve 1 domates', [{ food: 'peynir', qty: 2, unit: 'dilim' }, { food: 'zeytin', qty: 5 }, { food: 'domates', qty: 1 }], { meal: 'kahvalti' });
expect('200gr yoğurt', [{ food: 'yoğurt', qty: 200, unit: 'g' }]);
expect('ekmek peynir domates', [{ food: 'ekmek' }, { food: 'peynir' }, { food: 'domates' }]);
expect('bir bardak portakal suyu içtim', [{ food: 'portakal suyu', qty: 1, unit: 'bardak' }]);
expect('iki bardak su içtim', [{ food: 'su', qty: 2, unit: 'bardak' }]);
check('boş metin', () => { const r = P.parse('', FOODS); assert(r.items.length === 0 && r.unmatched.length === 0, 'boş değil'); });
check('sadece dolgu', () => { const r = P.parse('yedim içtim', FOODS); assert(r.items.length === 0 && r.unmatched.length === 0, JSON.stringify(r)); });
check('null foods güvenli', () => { const r = P.parse('iki yumurta', null); assert(r.items.length === 0 && r.unmatched.length === 1, JSON.stringify(r)); });

/* Stub'a özgü birim geri düşüş testleri */
if (useStub) {
  check('birim yoksa varsayılana düş + düşük güven', () => {
    const r = P.parse('bir porsiyon yumurta', FOODS);
    assert(r.items.length === 1 && r.items[0].unitFallback && r.items[0].confidence <= 0.75, JSON.stringify(r.items));
  });
  check('kase ekmek -> genel birim, düşük güven', () => {
    const r = P.parse('bir kase ekmek', FOODS);
    assert(r.items.length === 1 && r.items[0].confidence <= 0.7, JSON.stringify(r.items));
  });
}

/* Arama */
check('arama: "merc" mercimek önerir', () => {
  const res = P.searchFoods('merc', FOODS, { limit: 5 });
  assert(res.length && res.some(f => P.fold(f.name).includes('mercimek')), res.map(f => f.name).join(','));
});
check('arama: yazım hatası "yogrt"', () => {
  const res = P.searchFoods('yogrt', FOODS, { limit: 5 });
  assert(res.length && P.fold(res[0].name).includes('yogurt'), res.map(f => f.name).join(','));
});

console.log(`\nVeri: ${useStub ? 'tests/foods-stub.js (stub)' : 'foods.js'} (${FOODS.length} besin)`);
if (failures.length) {
  console.log('\nBAŞARISIZ:');
  failures.forEach(f => console.log('  ✗ ' + f));
}
console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
