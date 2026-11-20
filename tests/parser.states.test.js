#!/usr/bin/env node
/*
 * Hâl (durum) sözcükleri: yaş / kuru / çiğ / kavrulmuş / tuzlu / şekerli / füme / organik ...
 * Kural: kullanıcının yazdığı hâl sessizce düşmez.
 *   - o hâli taşıyan çeşit varsa o seçilir,
 *   - hâl besin değerini değiştirmiyorsa (organik, ev yapımı, taze elma, tuzsuz fındık) temel besin normal güvenle,
 *   - değiştiriyorsa ve çeşidi yoksa temel besin düşük güvenle + görünür not + öneriler.
 *   node tests/parser.states.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../parser.js');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'foods.js'), 'utf8'), ctx);
const FOODS = ctx.window.FOODS;
const byId = Object.fromEntries(FOODS.map(f => [f.id, f]));
let pass = 0; const fails = [];
function check(cond, msg) { if (cond) pass++; else fails.push(msg); }
const dump = r => JSON.stringify(r.items.map(i => [i.foodId, i.qty, i.unit, i.confidence, i.note || ''])) + (r.unmatched.length ? ' unmatched=' + JSON.stringify(r.unmatched.map(u => u.text)) : '');

/** tek kalem bekle: id (dizi = herhangi biri), güven (sure: ≥0.8, low: <0.8), not içeriği */
function one(q, ids, o, foods) {
  o = o || {};
  const r = P.parse(q, foods || FOODS);
  const it = r.items[0];
  ids = [].concat(ids);
  const ok = r.items.length === 1 && !r.unmatched.length && ids.includes(it.foodId) &&
    (o.qty == null || it.qty === o.qty) && (o.unit == null || it.unit === o.unit) &&
    (o.low ? it.confidence < 0.8 : it.confidence >= 0.8) &&
    (o.low ? !!it.note && (o.note || []).every(n => it.note.includes(n)) : !it.note) &&
    (o.sug == null || (it.suggestions || []).some(s => [].concat(o.sug).includes(s.id)));
  check(ok, '"' + q + '" -> ' + ids.join('|') + (o.low ? ' (düşük güven + not)' : '') + ' ; alınan ' + dump(r));
  return it;
}

/* ---- 1) hâl sözcüğü ürün adının parçası: hâl olarak ayrıştırılmaz ---- */
one('kuru fasulye', 'kuru-fasulye');
one('kuru yemiş', 'karisik-kuruyemis');
one('kuruyemiş', 'karisik-kuruyemis');
one('kuru üzüm', 'kuru-uzum');
one('kuru kayısı', 'kuru-kayisi');
one('çiğ köfte', 'cig-kofte');
one('yaş pasta', 'pasta-yas');
one('kuru pasta', ['kek', 'c-kuru-pasta']);
one('yaş maya', 'b-yas-maya');
one('kuru incir', 'incir-kuru');
one('taze incir', 'incir');
one('çifte kavrulmuş lokum', 'b-lokum-cifte-kavrulmus-fistikli');
one('köy peyniri', 'a-peynir-koy');
one('sade kahve', 'turk-kahvesi');

/* ---- 2) ada ek bir hâl önden gelince uygulanır ---- */
one('yaş kuru yemiş', 'x-yas-kuruyemis');
one('yas kuru yemis', 'x-yas-kuruyemis');
one('Yaş Kuruyemiş', 'x-yas-kuruyemis');
one('2 avuç yaş kuru yemiş', 'x-yas-kuruyemis', { qty: 2, unit: 'avuç' });
one('tuzsuz kuru yemiş', 'd-kuruyemis-tuzsuz-cig-karisik');
one('tuzsuz kuru yemis', 'd-kuruyemis-tuzsuz-cig-karisik');
one('kuru yemiş tuzsuz', 'd-kuruyemis-tuzsuz-cig-karisik');
one('100 gram tuzsuz kuru yemiş', 'd-kuruyemis-tuzsuz-cig-karisik', { qty: 100, unit: 'g' });
one('çiğ kuru yemiş', 'd-kuruyemis-tuzsuz-cig-karisik');
one('kavrulmuş kuru yemiş karışık', 'x-kuruyemis-kavrulmus');
one('tuzlu kuru yemiş', 'x-kuruyemis-standart');
{
  const r = P.parse('2 avuç yaş kuru yemiş ve bir bardak çay', FOODS);
  check(r.items.length === 2 && r.items[0].foodId === 'x-yas-kuruyemis' && r.items[1].foodId === 'cay', 'çoklu cümlede yaş kuru yemiş: ' + dump(r));
}

/* ---- 3) hâl çeşidi tercih edilir ---- */
one('yaş ceviz', ['x-ceviz-yas', 'x-ceviz-yas-kabuklu', 'd-ceviz-kabuklu']);
one('taze ceviz', ['x-ceviz-yas', 'x-ceviz-yas-kabuklu', 'd-ceviz-kabuklu']);
one('çiğ ceviz', 'd-ceviz-cig');
one('kavrulmuş fındık', 'b-findik-kavrulmus');
one('fındık kavrulmuş', 'b-findik-kavrulmus');
one('tuzlu badem', 'd-badem-tuzlu');
one('tuzsuz tereyağı', 'a-tereyagi-tuzsuz');
one('kurutulmuş domates', 'd-kuru-domates');
one('kurutulmuş elma', 'd-elma-kuru');
one('dondurulmuş çilek', 'd-cilek-donmus');
one('közlenmiş patlıcan', 'd-kozlenmis-patlican');
one('kızarmış tavuk', 'kizarmis-tavuk');
one('kavrulmuş nohut', 'd-nohut-kavrulmus');
one('sade kahve şekerli', ['a-kahve-turk-sekerli', 'turk-kahvesi-sekerli']);
one('şekerli kahve', ['a-kahve-turk-sekerli', 'turk-kahvesi-sekerli']);
one('salamura zeytin', 'b-zeytin-gemlik-salamura');
one('kahvaltıda taze kaşar', 'a-peynir-kasar-taze');

/* ---- 4) besin değerini değiştirmeyen hâller: temel besin, normal güven ---- */
one('organik yumurta', 'yumurta');
one('ev yapımı erişte', ['eriste', 'c-eriste-ev']);
one('ev yapımı mantı', 'manti');
one('taze elma', 'elma');
one('yaş üzüm', 'uzum');
one('olgun muz', 'muz');
one('ham muz', 'muz');
one('iç fındık', 'findik');
one('tuzsuz fındık', 'findik');
one('tuzlu ayran', 'ayran');
one('sade yoğurt', 'yogurt');
one('dondurulmuş bezelye', ['bezelye', 'd-bezelye-taze']);
one('haşlanmış brokoli', ['brokoli', 'd-brokoli-haslanmis']);
{
  const it = one('büyük elma', 'elma');
  check(it && it.scale > 1, 'büyük elma boy çarpanı: ' + (it && it.scale));
}

/* ---- 5) besin değerini değiştiren hâl listede yok: düşük güven + görünür not + öneri ---- */
one('taze kuru fasulye', 'kuru-fasulye', { low: true, note: ['“taze”', 'Kuru fasulye'], sug: ['taze-fasulye-yemegi', 'd-taze-fasulye-cig', 'd-taze-fasulye-haslanmis'] });
one('tütsülenmiş peynir', 'beyaz-peynir', { low: true, note: ['“tütsülenmiş”', 'hâli listede yok'] });
one('şekerli yoğurt', 'yogurt', { low: true, note: ['“şekerli”'] });
one('light simit', 'simit', { low: true, note: ['“light”', 'çeşidi listede yok', 'Simit'] });
// "yaş kuru yemiş" ürünü olmasaydı: kuru yemiş + "yaş hâli yok" notu (yaş asla sessizce düşmez)
{
  const noFresh = FOODS.filter(f => f.id !== 'x-yas-kuruyemis');
  const it = one('yaş kuru yemiş', 'karisik-kuruyemis', { low: true, note: ['“yaş” hâli listede yok, en yakın: Karışık kuruyemiş'] }, noFresh);
  check(it && it.stateMissing && it.stateMissing.includes('fresh'), 'stateMissing = fresh: ' + JSON.stringify(it && it.stateMissing));
  check(it && Array.isArray(it.suggestions), 'öneri dizisi var');
  const it2 = one('yas ceviz', 'ceviz', { low: true, note: ['“yas”'] }, FOODS.filter(f => !['d-ceviz-kabuklu', 'x-yas-kuruyemis', 'x-ceviz-yas', 'x-ceviz-yas-kabuklu'].includes(f.id)));
  check(it2 && it2.raw.includes('yas'), 'ham metin hâli içerir');
}
// sonradan gelen miktar notu silmez
one('tütsülenmiş peynir 2 dilim', 'beyaz-peynir', { low: true, qty: 2, unit: 'dilim', note: ['“tütsülenmiş”'] });

/* ---- 6) tanınmayan niteleyici de sessizce düşmez ---- */
one('lezzetli elma', 'elma', { low: true, note: ['“lezzetli” kelimesini tanımadım'] });
one('lezzetli elma 2 tane', 'elma', { low: true, qty: 2, note: ['“lezzetli”'] });

/* ---- 7) önceki şikâyetler ---- */
one('kemiksiz derisiz tavuk pirzola', 'tavuk-pirzola');
one('kemiksiz ve derisiz tavuk pirzola 150 gram', 'tavuk-pirzola', { qty: 150, unit: 'g' });
one('kalorisi azaltılmış mayonez', 'b-mayonez-light');
one('kalorisi azaltılmış mayonez 1 kaşık', 'b-mayonez-light', { qty: 1 });

/* ---- 8) "iç", "köy", "ham" yalnızca bir besinden önce hâl sayılır ---- */
{
  const r = P.parse('bir bardak çay iç', FOODS);
  check(r.items.length === 1 && r.items[0].foodId === 'cay' && !r.unmatched.length && !r.items[0].note, '"çay iç" fiil: ' + dump(r));
}


/* ---- 10) sade ürün adı: hazır yemeğe değil ürünün kendisine (kullanıcı kuralı: "patates" -> patates, kızartma değil) ---- */
{
  const DISH = new Set(['Çorbalar', 'Etli Yemekler', 'Sebze Yemekleri', 'Fast Food', 'Tatlılar', 'Meze ve Salata', 'Kebap ve Izgara']);
  // a) adı parantezsiz her besin (temel besin) kendi adıyla kendisine çıkar
  let plain = 0;
  FOODS.forEach(f => {
    if (/[()+]/.test(f.name)) return;
    plain++;
    const r = P.parse(f.name, FOODS);
    check(r.items.length === 1 && !r.unmatched.length && r.items[0].foodId === f.id, 'temel ad kendisine: "' + f.name + '" -> ' + dump(r));
  });
  check(plain > 1000, 'temel besin taraması: ' + plain);
  // b) çiğ ürün / temel gıda adları hazır yemeğe gitmez
  const PRODUCE = ['patates', 'ıspanak', 'mercimek', 'nohut', 'bulgur', 'pirinç', 'havuç', 'domates', 'biber', 'patlıcan', 'kabak', 'pırasa',
    'bamya', 'enginar', 'lahana', 'karnabahar', 'brokoli', 'soğan', 'sarımsak', 'mantar', 'barbunya', 'börülce', 'bezelye', 'bakla',
    'taze fasulye', 'semizotu', 'pancar', 'kereviz', 'elma', 'muz', 'kayısı', 'incir', 'kıyma', 'somon', 'tavuk', 'yumurta', 'süt', 'yoğurt'];
  PRODUCE.forEach(q => {
    const r = P.parse(q, FOODS), f = r.items[0] && byId[r.items[0].foodId];
    check(r.items.length === 1 && f && !DISH.has(f.cat) && !/kızartma|çorba|yemeği|pilav/i.test(f.name), 'sade ürün "' + q + '" -> ' + (f ? f.id + ' [' + f.cat + ']' : dump(r)));
  });
  one('patates', 'x-patates-cig');
  one('patates kızartması', 'patates-kizartmasi');
  one('ıspanak', 'ispanak-cig');
  one('ıspanak yemeği', 'ispanak-yemegi');
  one('mercimek', 'mercimek-haslanmis');
  one('mercimek çorbası', 'mercimek-corbasi');
}


/* ---- 11) genel sözcükler sorulur, marka + tür sözcüğü tek kalem, rakamlı adlar, bağlam ---- */
['çorba', 'sandviç', 'kebap', 'et', 'dürüm', 'meyve', 'börek', 'pide'].forEach(q => {
  const r = P.parse(q, FOODS);
  check(r.items.length <= 1 && !r.items.some(i => i.confidence >= 0.8) && (!r.items[0] || (r.items[0].note && r.items[0].suggestions.length)), 'genel sözcük sorulur: "' + q + '" -> ' + dump(r));
});
['yaş', 'tuzlu', 'kavrulmuş', 'konserve', 'taze', 'kuru'].forEach(q => {
  const r = P.parse(q, FOODS);
  check(!r.items.some(i => i.confidence >= 0.8), 'tek başına hâl sözcüğü besin uydurmaz: "' + q + '" -> ' + dump(r));
});
one('7up', 'a-sprite');
one('bir kutu 7up', 'a-sprite');
one('nescafe 3ü1 arada', ['b-nescafe-3in1', 'nescafe']);
one('m&m draje', 'b-mms-cikolata');
one('kfc çikolatalı sundae', 'c-kfc-sundae', { low: false });
{ // marka + miktar: tek kalem, miktar 2; ürünün "dilim" birimi yoksa düşük güven (kontrol et) doğru davranış
  const r = P.parse('güllüoğlu iki dilim baklava', FOODS);
  check(r.items.length === 1 && r.items[0].foodId === 'c-gulluoglu-baklava-fistikli' && r.items[0].qty === 2, '"güllüoğlu iki dilim baklava" -> tek kalem, 2 ; alınan ' + dump(r));
}
one('cappy meyve suyu', ['meyve-suyu', 'a-meyve-suyu-karisik-nektar']);
one('2 şekerli çay', 'sekerli-cay-2');
one('iki şekerli çay', 'sekerli-cay-2');
one('iki yumurtalı menemen', 'menemen', { qty: 1 });
one('kokoreç porsiyon', 'kokorec');
one('tahin helvası dilim', 'tahin-helvasi');
one('kıymalı poğaça', ['y-pogaca-kiymali', 'pogaca']);
{
  const r = P.parse('big mac orta patates ve kola', FOODS);
  check(r.items.length === 3 && r.items[1].foodId === 'c-mcd-patates-orta', 'fast food bağlamında patates kızartmadır: ' + dump(r));
  const r2 = P.parse('büyük boy patates', FOODS);
  check(r2.items.length === 1 && r2.items[0].foodId === 'patates-kizartmasi', 'boylu patates kızartmadır: ' + dump(r2));
  const r3 = P.parse('domates salatalık', FOODS);
  check(r3.items.length === 2, 'iki ayrı besin birleşmez: ' + dump(r3));
}
// hız: 5 kalemli, yazım hatalı cümle
{
  const q = 'tavukk pirzolaa, brokolli salatası, bulgur pilavı, cacık ve ayrn';
  P.parse(q, FOODS);
  let best = 1e9;
  for (let k = 0; k < 5; k++) { const t = process.hrtime.bigint(); P.parse(q, FOODS); best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6); }
  check(best < 30, '5 kalemli cümle < 30 ms: ' + best.toFixed(1));
}

/* ---- 9) değişmez: her hâl sözcüğü + yaygın besin -> sözcük kayıtta kalır, sessizce kaybolmaz ---- */
const STATE_WORDS = ['yaş', 'taze', 'kuru', 'kurutulmuş', 'çiğ', 'pişmiş', 'haşlanmış', 'kavrulmuş', 'kavrulmamış', 'fırınlanmış', 'fırında',
  'közlenmiş', 'ızgara', 'kızarmış', 'tuzlu', 'tuzsuz', 'kabuklu', 'kabuksuz', 'şekerli', 'ballı', 'konserve', 'dondurulmuş', 'salamura',
  'tütsülenmiş', 'füme', 'organik', 'sade', 'karışık', 'olgun', 'çifte kavrulmuş', 'ev yapımı', 'tam yağlı', 'yarım yağlı', 'yağsız', 'light', 'diyet', 'şekersiz'];
const BASES = ['elma', 'ceviz', 'peynir', 'tavuk göğsü', 'kuru yemiş', 'badem', 'patates', 'yoğurt'];
let inv = 0;
STATE_WORDS.forEach(w => BASES.forEach(b => {
  const q = w + ' ' + b, r = P.parse(q, FOODS), it = r.items[0];
  const fw = P.fold(w);
  const ok = r.items.length === 1 && !r.unmatched.length && P.fold(it.raw).includes(fw) &&
    (it.note ? it.confidence < 0.8 : true);
  if (ok) inv++;
  check(ok, 'hâl düşmedi: "' + q + '" -> ' + dump(r));
}));

console.log((fails.length ? fails.map(f => '  ✗ ' + f).join('\n') + '\n' : '') + '\n' + pass + ' geçti, ' + fails.length + ' kaldı (' + inv + ' hâl×besin bileşimi)');
process.exit(fails.length ? 1 : 0);
