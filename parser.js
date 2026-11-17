/*
 * Zayıfla - Türkçe doğal dil yemek ayrıştırıcı (parser)
 * Saf fonksiyonlar; tarayıcıda window.ZParser, Node'da module.exports.
 *
 *   ZParser.parse("iki dilim ekmek ve bir bardak çay içtim", FOODS)
 *   -> { items:[{foodId,name,qty,unit,unitG,grams,kcal,p,c,f,confidence,raw}], unmatched:[...], meal }
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ZParser = api;
  else if (root) root.ZParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Normalizasyon                                                       */
  /* ------------------------------------------------------------------ */
  var FOLD = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u', 'é': 'e', 'è': 'e', 'ä': 'a' };

  var HAS_UPPER = /[A-ZÇĞİÖŞÜÂÎÛÉÈÄ]/, NON_ASCII = /[^\x00-\x7f]/, FOLD_RE = /[çğıöşüâîûéèä]/g;
  function lower(s) {
    s = String(s == null ? '' : s);
    if (!HAS_UPPER.test(s) && !NON_ASCII.test(s.replace(FOLD_RE, ''))) return s; // hızlı yol: zaten küçük harf
    // Türkçe kuralı: I -> ı, İ -> i (toLocaleLowerCase('tr-TR') ile aynı, ama çok daha hızlı)
    return s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase().replace(/̇/g, '');
  }

  function foldCh(ch) { return FOLD[ch]; }
  function fold(s) {
    var out = lower(s).replace(FOLD_RE, foldCh);
    if (NON_ASCII.test(out)) { try { out = out.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* eski motor */ } }
    return out;
  }

  /** Arama / eşleştirme için: katlanmış, noktalama temizlenmiş kelimeler. */
  function foldTokens(s) {
    return fold(s).replace(/['’`][a-z]+/g, '').replace(/[^a-z0-9%]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  }

  /* ------------------------------------------------------------------ */
  /* Sayılar                                                             */
  /* ------------------------------------------------------------------ */
  var NUM_WORDS = {
    sifir: 0, bir: 1, bi: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
    on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90,
    yuz: 100, bin: 1000
  };

  function isNumWord(f) { return Object.prototype.hasOwnProperty.call(NUM_WORDS, f); }

  /** "iki yüz elli" -> 250 ; tokens: katlanmış kelime dizisi */
  function wordsToNumber(words) {
    var total = 0, current = 0, any = false;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!isNumWord(w)) return null;
      any = true;
      var v = NUM_WORDS[w];
      if (v === 100) current = (current || 1) * 100;
      else if (v === 1000) { total += (current || 1) * 1000; current = 0; }
      else current += v;
    }
    return any ? total + current : null;
  }

  /** Metindeki sayıyı çözer: "yirmi beş" -> 25, "bir buçuk" -> 1.5, "yarım" -> 0.5 */
  function parseNumberText(text) {
    var toks = tokenize(text);
    var q = parseQuantity(toks, 0);
    return q && q.len === toks.length ? q.value : null;
  }

  /* ------------------------------------------------------------------ */
  /* Birimler                                                            */
  /* ------------------------------------------------------------------ */
  // Kanonik birimler: g, ml, kg, l, cl + foods.js birim anahtarları
  var UNIT_PHRASES = [
    [['su', 'bardagi'], 'su bardağı'], [['su', 'bardak'], 'su bardağı'], [['su', 'bardaginda'], 'su bardağı'],
    [['cay', 'bardagi'], 'çay bardağı'], [['cay', 'bardak'], 'çay bardağı'], [['ince', 'belli'], 'çay bardağı'],
    [['yemek', 'kasigi'], 'yemek kaşığı'], [['yemek', 'kasik'], 'yemek kaşığı'], [['corba', 'kasigi'], 'yemek kaşığı'],
    [['tatli', 'kasigi'], 'tatlı kaşığı'], [['tatli', 'kasik'], 'tatlı kaşığı'],
    [['cay', 'kasigi'], 'çay kaşığı'], [['cay', 'kasik'], 'çay kaşığı'],
    [['kasik'], 'yemek kaşığı'], [['kasigi'], 'yemek kaşığı'], [['kasiklik'], 'yemek kaşığı'],
    [['bardak'], 'bardak'], [['bardagi'], 'bardak'], [['bardaklik'], 'bardak'], [['kupa'], 'bardak'],
    [['gram'], 'g'], [['gr'], 'g'], [['g'], 'g'], [['grm'], 'g'], [['gramlik'], 'g'], [['grlik'], 'g'],
    [['kilo'], 'kg'], [['kg'], 'kg'], [['kilogram'], 'kg'], [['kiloluk'], 'kg'],
    [['ml'], 'ml'], [['mililitre'], 'ml'], [['mililitrelik'], 'ml'], [['mllik'], 'ml'],
    [['litre'], 'l'], [['lt'], 'l'], [['l'], 'l'], [['litrelik'], 'l'], [['cl'], 'cl'],
    [['adet'], 'adet'], [['tane'], 'adet'], [['taneyi'], 'adet'], [['tanesi'], 'adet'], [['adedi'], 'adet'],
    [['dilim'], 'dilim'], [['dilimi'], 'dilim'], [['dilimlik'], 'dilim'],
    [['kase'], 'kase'], [['kasesi'], 'kase'], [['kaselik'], 'kase'],
    [['porsiyon'], 'porsiyon'], [['porsiyonu'], 'porsiyon'], [['porsiyonluk'], 'porsiyon'], [['servis'], 'porsiyon'],
    [['tabak'], 'tabak'], [['tabagi'], 'tabak'], [['tabaklik'], 'tabak'],
    [['avuc'], 'avuç'], [['avucu'], 'avuç'], [['avucluk'], 'avuç'],
    [['kepce'], 'kepçe'], [['kepcesi'], 'kepçe'], [['kepcelik'], 'kepçe'],
    [['kutu'], 'kutu'], [['kutusu'], 'kutu'], [['kutuluk'], 'kutu'],
    [['paket'], 'paket'], [['paketi'], 'paket'], [['paketlik'], 'paket'],
    [['sise'], 'şişe'], [['sisesi'], 'şişe'], [['siselik'], 'şişe'],
    [['top'], 'top'], [['topu'], 'top'],
    [['parca'], 'parça'], [['parcasi'], 'parça'], [['parcacik'], 'parça'],
    [['fincan'], 'fincan'], [['fincani'], 'fincan']
  ].sort(function (a, b) { return b[0].length - a[0].length; });

  var SHORT_UNITS = { g: 1, l: 1 }; // ancak bir sayıdan sonra birim sayılır

  // Besinde birim yoksa kullanılacak genel gram karşılıkları
  var GENERIC_UNIT_G = {
    'bardak': 200, 'su bardağı': 200, 'çay bardağı': 100, 'kase': 250, 'tabak': 300, 'porsiyon': 200,
    'kepçe': 150, 'yemek kaşığı': 15, 'tatlı kaşığı': 8, 'çay kaşığı': 4, 'avuç': 30, 'dilim': 30,
    'adet': 50, 'kutu': 330, 'paket': 100, 'şişe': 500, 'top': 60, 'parça': 50, 'fincan': 75
  };

  var UNIT_LABELS = {
    g: 'g', ml: 'ml', adet: 'adet', dilim: 'dilim', kase: 'kase', bardak: 'bardak', porsiyon: 'porsiyon',
    tabak: 'tabak', 'yemek kaşığı': 'yemek kaşığı', 'tatlı kaşığı': 'tatlı kaşığı', 'çay kaşığı': 'çay kaşığı',
    avuç: 'avuç', kepçe: 'kepçe', 'su bardağı': 'su bardağı', 'çay bardağı': 'çay bardağı', kutu: 'kutu',
    paket: 'paket', şişe: 'şişe', top: 'top', parça: 'parça', fincan: 'fincan'
  };

  function parseUnit(toks, i, afterQty) {
    if (i >= toks.length) return null;
    for (var k = 0; k < UNIT_PHRASES.length; k++) {
      var words = UNIT_PHRASES[k][0];
      if (i + words.length > toks.length) continue;
      var ok = true;
      for (var j = 0; j < words.length; j++) {
        if (toks[i + j].f !== words[j]) { ok = false; break; }
      }
      if (!ok) continue;
      if (words.length === 1 && SHORT_UNITS[words[0]] && !afterQty) continue;
      return { unit: UNIT_PHRASES[k][1], len: words.length };
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Öğün kelimeleri, ayırıcılar, dolgu kelimeleri                        */
  /* ------------------------------------------------------------------ */
  var MEAL_WORDS = {
    kahvalti: 'kahvalti', kahvaltida: 'kahvalti', kahvaltiya: 'kahvalti', kahvaltilik: 'kahvalti', kahvaltisi: 'kahvalti',
    kahvaltisinda: 'kahvalti', kahvaltidan: 'kahvalti', sabah: 'kahvalti', sabahleyin: 'kahvalti', sabahki: 'kahvalti', sabahtan: 'kahvalti',
    ogle: 'ogle', oglen: 'ogle', ogleyin: 'ogle', oglende: 'ogle', oglenki: 'ogle', ogleden: 'ogle', oglene: 'ogle',
    aksam: 'aksam', aksamleyin: 'aksam', aksamki: 'aksam', aksamda: 'aksam', aksama: 'aksam',
    gece: 'ara', geceleyin: 'ara', gecede: 'ara',
    atistirmalik: 'ara', atistirmalik_: 'ara', ikindi: 'ara', ikindide: 'ara'
  };
  var MEAL_TAIL = {
    yemek: 1, yemegi: 1, yemeginde: 1, yemeginden: 1, yemekte: 1, yemegine: 1, yemeklerinde: 1, yemekten: 1,
    ogunu: 1, ogunde: 1, ogununde: 1, ogune: 1, ogun: 1, vakti: 1, vaktinde: 1, saatinde: 1, olarak: 1, icin: 1
  };

  var SEP_WORDS = { 've': 1, 'ile': 1, 'sonra': 1, 'ardindan': 1, 'arti': 1, 'ayrica': 1, 'birde': 1, 'bide': 1, 'yaninda': 1, 'yanina': 1, 'ustune': 1, 'ustelik': 1, 'hem': 1 };

  var FILLERS = {};
  ('yedi icti aldi yedim yedik yiyorum yiyecegim yemistim yemisim yerim ye yemek yemegi yedin ictim ictik iciyorum icecegim icmistim icmisim ' +
    'icerim ic aldim aldik aliyorum tukettim tuketiyorum tuketim atistirdim ekle ekleyin ekler misin mi mu mısın ' +
    'kaydet yaz bugun ben biz da de ta te olarak icin kadar yaklasik civari civarinda asagi yukari falan filan felan ' +
    'sey seyler ee eee eh hmm sadece tamam evet ama ise dolusu biraz azicik boy boyutunda ' +
    'dun evde disarida iste galiba sanirim bence bugunku dunku tabii yani artik hepsi toplam toplamda su an simdi tam olarak bi sure gibi kadarini kadar yarisi').split(/\s+/)
    .forEach(function (w) { FILLERS[w] = 1; });
  delete FILLERS['tam'];
  delete FILLERS['bi'];

  function looksLikeVerb(f) {
    if (f.length < 4) return false;
    return /(d|t)(i|u|a|e)(m|k)$/.test(f) && /[aeiou]/.test(f.slice(0, -3)) ||
      /(iyor|uyor)(um|uz|sun|)$/.test(f) || /(acag|eceg)(im|iz)$/.test(f) || /mis(tim|im)$/.test(f);
  }

  /* ------------------------------------------------------------------ */
  /* Niteleyici (descriptor) sözcükler ve çiğ/pişmiş durumu               */
  /* ------------------------------------------------------------------ */
  var DESC = {};
  function defDesc(words, info) { words.split(' ').forEach(function (w) { DESC[w] = info; }); }
  // çiğ (pişmemiş) durum
  defDesc('cig cigi pismemis pismeden kuru', { state: 'raw' });
  // pişirme yöntemleri -> pişmiş durum
  defDesc('pismis haslanmis haslama haslanmisi izgara izgarada firinda firin firinlanmis kizarmis kizartma kizartilmis tava tavada bugulama bugulanmis sote kavrulmis', { state: 'cooked' });
  // yalnızca nitelik
  defDesc('kemiksiz kemikli derisiz derili yagli sekerli taze organik orta', {});
  defDesc('buyuk', { scale: 1.3 });
  defDesc('kucuk', { scale: 0.7 });
  defDesc('kocaman', { scale: 1.5 });
  var DESC2 = { 'tam yagli': {}, 'ev yapimi': {} };
  var STATE_ALIAS_TOKS = { cig: 'raw', pismemis: 'raw', kuru: 'raw', pismis: 'cooked', haslanmis: 'cooked', haslama: 'cooked', izgara: 'cooked', firinda: 'cooked', kizarmis: 'cooked', bugulama: 'cooked' };

  /* ---- Varyant niteleyicileri: light / diyet / yağsız / şekersiz / zero ... ----
   * Sıfat besinden önce ("light mayonez") ya da sonra ("mayonez light") gelebilir.
   * Varyant besin varsa o seçilir; yoksa temel besin düşük güvenle (onay ekranında "kontrol et") eklenir. */
  var VARIANT_PHRASES = [
    ['kalorisi azaltilmis', 'light'], ['kalori azaltilmis', 'light'], ['kalorisi azaltilmistir', 'light'], ['azaltilmis kalorili', 'light'],
    ['az kalorili', 'light'], ['dusuk kalorili', 'light'], ['kalorisi dusuk', 'light'], ['dusuk kalori', 'light'],
    ['light', 'light'], ['lait', 'light'], ['layt', 'light'], ['lite', 'light'], ['diyet', 'light'], ['diet', 'light'], ['fit', 'light'],
    ['yarim yagli', 'lowfat'], ['yari yagli', 'lowfat'], ['az yagli', 'lowfat'], ['dusuk yagli', 'lowfat'], ['yagi azaltilmis', 'lowfat'],
    ['yag orani azaltilmis', 'lowfat'], ['yag orani dusuk', 'lowfat'],
    ['yagsiz', 'nofat'], ['sifir yagli', 'nofat'], ['yagi alinmis', 'nofat'],
    ['sekersiz', 'sugarfree'], ['seker ilavesiz', 'sugarfree'], ['ilave sekersiz', 'sugarfree'], ['ilave seker icermeyen', 'sugarfree'],
    ['seker ilavesi olmayan', 'sugarfree'], ['sekeri azaltilmis', 'sugarfree'], ['tatlandiricili', 'sugarfree'],
    ['zero', 'zero'], ['sifir', 'zero'], ['sifir seker', 'zero'], ['sifir sekerli', 'zero'],
    ['protein', 'protein'], ['proteinli', 'protein'], ['yuksek proteinli', 'protein'], ['high protein', 'protein'],
    ['laktozsuz', 'lactosefree'], ['laktozu alinmis', 'lactosefree'], ['laktoz free', 'lactosefree'],
    ['tam bugday', 'whole'], ['tam bugdayli', 'whole'], ['kepekli', 'whole'], ['tam tahilli', 'whole'], ['tam tahil', 'whole'],
    ['glutensiz', 'glutenfree'], ['gluten free', 'glutenfree'], ['glutensizdir', 'glutenfree']
  ].map(function (x) { return { toks: x[0].split(' '), key: x[0], cls: x[1] }; })
    .sort(function (a, b) { return b.toks.length - a.toks.length; });
  // istenen varyant yoksa yakın akrabası da kabul edilir (diyet kola ~ şekersiz kola)
  var VARIANT_NEAR = {
    light: ['zero', 'sugarfree', 'lowfat', 'nofat'], zero: ['sugarfree', 'light'], sugarfree: ['zero', 'light'],
    lowfat: ['light', 'nofat'], nofat: ['lowfat', 'light'], protein: [], lactosefree: [], whole: [], glutenfree: []
  };
  var VARIANT_FIRST = Object.create(null);
  VARIANT_PHRASES.forEach(function (v) { (VARIANT_FIRST[v.toks[0]] = VARIANT_FIRST[v.toks[0]] || []).push(v); });

  /** toks (dize dizisi veya {f} dizisi) içinde i konumunda varyant ifadesi -> {len, key, cls} */
  function variantAt(toks, i) {
    var t = toks[i];
    if (!t) return null;
    var f = typeof t === 'string' ? t : t.f;
    var list = VARIANT_FIRST[f];
    if (!list) return null;
    for (var k = 0; k < list.length; k++) {
      var v = list[k], ok = true;
      for (var j = 1; j < v.toks.length; j++) {
        var u = toks[i + j];
        if (!u || (typeof u === 'string' ? u : u.f) !== v.toks[j]) { ok = false; break; }
      }
      if (ok) return { len: v.toks.length, key: v.key, cls: v.cls };
    }
    return null;
  }

  /** Bir alias'taki varyant sınıfları ve niteleyicisiz temel dize. "mayonez light %30" -> {cls:{light}, base:"mayonez"} */
  function variantInfo(toks) {
    var cls = null, rest = [];
    for (var i = 0; i < toks.length;) {
      var v = variantAt(toks, i);
      // "sifir" yalnızca kendi başına değil "sifir seker/yagli" ya da sondaysa niteleyici; "protein tozu" gibi ad başı da sayılır
      if (v) { (cls = cls || {})[v.cls] = 1; i += v.len; continue; }
      if (!/^[0-9.%]+$/.test(toks[i])) rest.push(toks[i]);
      i++;
    }
    if (!cls) return null;
    return { cls: cls, base: rest.join(' ') };
  }

  /** i konumunda bir niteleyici var mı? -> {len, key, info} */
  function readDesc(toks, i) {
    var t = toks[i];
    if (!t || t.f === ',') return null;
    var v = variantAt(toks, i);
    if (v) return { len: v.len, key: v.key, info: { variant: v.cls }, toks: toks.slice(i, i + v.len) };
    var nx = toks[i + 1];
    if (nx) {
      var k2 = t.f + ' ' + nx.f;
      if (DESC2[k2]) return { len: 2, key: k2, info: DESC2[k2], toks: [t, nx] };
    }
    if (Object.prototype.hasOwnProperty.call(DESC, t.f)) return { len: 1, key: t.f, info: DESC[t.f], toks: [t] };
    return null;
  }

  /* ---- çiğ / pişmiş değerleri ---------------------------------------- */
  // Besin: kcal/p/c/f (temel durum) + isteğe bağlı raw:{kcal,p,c,f} (çiğ, 100 g) veya cooked:{...} (pişmiş, 100 g).
  function hasStates(food) { return !!(food && (food.raw || food.cooked)); }
  function baseState(food) { return food && food.raw ? 'cooked' : 'raw'; }
  function stateValues(food, state) {
    if (!hasStates(food) || !state || state === baseState(food)) return food;
    var alt = state === 'raw' ? food.raw : food.cooked;
    return alt || food;
  }
  function isStateWordText(w) {
    var f = fold(w).replace(/[^a-z]/g, '');
    return /^(cig|pismis|haslanmis|haslama|izgara|firin|firinda|kizarmis|tava|bugulama)$/.test(f);
  }
  /** Kayıt adı: durumu gösterir, örn. "Tavuk göğsü (çiğ)" */
  function itemName(food, state) {
    if (!hasStates(food) || !state) return food.name;
    var m = String(food.name).match(/^(.*?)\s*\(([^)]*)\)\s*$/), base = food.name, parts = [];
    if (m) { base = m[1]; parts = m[2].split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x && !isStateWordText(x); }); }
    parts.push(state === 'raw' ? 'çiğ' : 'pişmiş');
    return base + ' (' + parts.join(', ') + ')';
  }

  /* ------------------------------------------------------------------ */
  /* Tokenizasyon                                                        */
  /* ------------------------------------------------------------------ */
  function tokenize(text) {
    var s = lower(text);
    s = s.replace(/(\d+)\s*\/\s*(\d+)/g, function (m, a, b) { return (Number(b) ? String(+(a / b).toFixed(3)) : a); });
    s = s.replace(/(\d),(\d)/g, '$1.$2');
    s = s.replace(/(\d)\.(?!\d)/g, '$1 , ');
    s = s.replace(/[^\x00-\x7fçğıöşüâîûéèä]/g, function (ch) { try { return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { return ch; } }); // piña -> pina
    s = s.replace(/['’`][a-zçğıöşüâî]+/g, '');        // Nutella'yı -> nutella
    s = s.replace(/(\d)([a-zçğıöşüâîû%])/g, '$1 $2');  // 200gr -> 200 gr
    s = s.replace(/([a-zçğıöşüâîû])(\d)/g, '$1 $2');
    s = s.replace(/[,;!?\n\r+&]|(?:\.(?!\d))/g, ' , ');
    s = s.replace(/[^0-9a-zçğıöşüâîûéè.,%\s]+/g, ' ');
    var raw = s.split(/\s+/).filter(Boolean);
    return raw.map(function (r) { return { r: r, f: r === ',' ? ',' : fold(r).replace(/[^a-z0-9.%]/g, '') }; })
      .filter(function (t) { return t.f !== ''; });
  }

  function isSepAt(toks, i) {
    var t = toks[i];
    if (!t) return 0;
    if (t.f === ',') return 1;
    if ((t.f === 'bir' || t.f === 'bi') && toks[i + 1] && (toks[i + 1].f === 'de' || toks[i + 1].f === 'da')) return 2;
    if (SEP_WORDS[t.f]) return 1;
    return 0;
  }

  function matchMealAt(toks, i) {
    var t = toks[i];
    if (!t) return null;
    var meal = MEAL_WORDS[t.f] || null, len = 1;
    if (!meal && t.f === 'ara' && toks[i + 1] && /^ogun/.test(toks[i + 1].f)) { meal = 'ara'; len = 2; }
    if (!meal && t.f === 'gece' && toks[i + 1] && /^(atistirma|yarisi)/.test(toks[i + 1].f)) { meal = 'ara'; len = 2; }
    if (!meal) return null;
    while (toks[i + len] && MEAL_TAIL[toks[i + len].f]) len++;
    return { meal: meal, len: len };
  }

  /* ------------------------------------------------------------------ */
  /* Miktar                                                              */
  /* ------------------------------------------------------------------ */
  function parseQuantity(toks, i) {
    var t = toks[i];
    if (!t) return null;
    var value = null, len = 0, fracWord = false, fuzzy = false;
    if (/^\d+(\.\d+)?$/.test(t.f)) { value = parseFloat(t.f); len = 1; }
    else if (t.f === 'yarim') { value = 0.5; len = 1; fracWord = true; }
    else if (t.f === 'ceyrek') { value = 0.25; len = 1; fracWord = true; }
    else if (t.f === 'birkac' || t.f === 'bikac') { value = 3; len = 1; fuzzy = true; }
    else if (isNumWord(t.f)) {
      var words = [];
      var j = i;
      while (toks[j] && isNumWord(toks[j].f)) {
        // "bir de" ayırıcıdır
        if ((toks[j].f === 'bir' || toks[j].f === 'bi') && toks[j + 1] && (toks[j + 1].f === 'de' || toks[j + 1].f === 'da')) break;
        // "iki bir" gibi anlamsız ardışıkları ayır: birler basamağından sonra yeni birler gelmez
        if (words.length) {
          var prev = NUM_WORDS[words[words.length - 1]], cur = NUM_WORDS[toks[j].f];
          if (prev < 10 && cur < 100) break;
          if (prev >= 10 && prev < 100 && cur >= 10 && cur < 100) break;
        }
        words.push(toks[j].f); j++;
      }
      if (!words.length) return null;
      value = wordsToNumber(words); len = words.length;
    }
    if (value === null) return null;
    // ekler: buçuk / yarım / çeyrek
    var n = toks[i + len];
    if (n && n.f === 'bucuk') { value += 0.5; len++; }
    else if (n && n.f === 'yarim' && !fracWord && !(toks[i + len + 1] && toks[i + len + 1].f === 'yagli')) { value += 0.5; len++; }
    else if (n && n.f === 'ceyrek' && !fracWord && value <= 3) { value = value * 0.25; len++; fracWord = true; }
    // "10 tane" gibi sayı sonrası "tane"yi birim olarak bırak
    return { value: value, len: len, fracWord: fracWord, fuzzy: fuzzy };
  }

  /* ------------------------------------------------------------------ */
  /* Kök bulma (ek atma)                                                 */
  /* ------------------------------------------------------------------ */
  var SUFFIXES = ['larindan', 'lerinden', 'larinda', 'lerinde', 'larini', 'lerini', 'larina', 'lerine', 'lari', 'leri',
    'sindan', 'sinden', 'sundan', 'sunden', 'sinda', 'sinde', 'sunda', 'sunde', 'sini', 'sunu', 'sina', 'sine', 'suna', 'sune',
    'lar', 'ler', 'ndan', 'nden', 'nda', 'nde', 'nin', 'nun', 'yla', 'yle', 'dan', 'den', 'tan', 'ten',
    'da', 'de', 'ta', 'te', 'la', 'le', 'yi', 'yu', 'ya', 'ye', 'si', 'su', 'ni', 'nu', 'in', 'un', 'na', 'ne', 'i', 'u', 'a', 'e'];
  var SHORT_OK = { i: 1, u: 1, yu: 1, yi: 1, ya: 1, ye: 1, a: 1, e: 1, yla: 1, yle: 1, de: 1, da: 1, den: 1, dan: 1, ten: 1, tan: 1, in: 1, un: 1, nin: 1, nun: 1 };

  var stemCache = Object.create(null);
  function soften(b) {
    var last = b[b.length - 1];
    if (last === 'g') return b.slice(0, -1) + 'k';
    if (last === 'b') return b.slice(0, -1) + 'p';
    if (last === 'd') return b.slice(0, -1) + 't';
    return null;
  }
  function stems(w) {
    var c = stemCache[w];
    if (c) return c;
    var out = Object.create(null);
    out[w] = 1;
    var frontier = [w];
    for (var depth = 0; depth < 3 && frontier.length; depth++) {
      var next = [];
      for (var x = 0; x < frontier.length; x++) {
        var cur = frontier[x];
        for (var k = 0; k < SUFFIXES.length; k++) {
          var suf = SUFFIXES[k];
          if (cur.length - suf.length >= 2 && cur.slice(-suf.length) === suf) {
            var b = cur.slice(0, -suf.length);
            if (!out[b]) { out[b] = 1; next.push(b); }
            var s = soften(b);
            if (s && !out[s]) { out[s] = 1; next.push(s); }
            // ünlü düşmesi: gogs(u) -> gogus, agz(i) -> agiz, burn(u) -> burun
            if (/[^aeiou][^aeiou]$/.test(b) && b.length >= 3) {
              var v = suf.match(/[aeiou]/);
              if (v) {
                var dropped = b.slice(0, -1) + v[0] + b.slice(-1);
                if (!out[dropped]) { out[dropped] = 1; }
              }
            }
          }
        }
      }
      frontier = next;
    }
    stemCache[w] = out;
    return out;
  }

  /** q (sorgu kelimesi) alias kelimesi a ile eşleşiyor mu? 1 = birebir, 0.95 = ek atarak, 0 = hayır */
  function tokenScore(q, a) {
    if (q === a) return 1;
    if (a.length <= 2) {
      if (q.indexOf(a) === 0 && SHORT_OK[q.slice(a.length)]) return 0.95;
      return 0;
    }
    if (q.length < 3) return 0;
    if (stems(q)[a]) return 0.95;
    if (a.length >= 4 && stems(a)[q]) return 0.93;
    // her ikisinin ortak kökü (örn. corbasini ~ corbasi)
    if (a.length >= 4 && q.length >= 4) {
      var sa = stems(a), sq = stems(q);
      for (var k in sq) if (k.length >= 4 && sa[k]) return 0.9;
    }
    return 0;
  }

  /* ------------------------------------------------------------------ */
  /* Besin indeksi                                                       */
  /* ------------------------------------------------------------------ */
  var indexCache = { foods: null, len: -1, idx: null };

  /**
   * Besin indeksi (bir kez kurulur, foods dizisi değişmedikçe önbellekten gelir).
   *  - entries: her ad/alias için katlanmış kelimeler
   *  - byFirst: ilk kelime -> entries, byStr: tam dize -> entry (her dize tek besine ait)
   *  - variants: niteleyicisiz temel dize -> varyant besinler (light, yağsız, şekersiz ...)
   * Önce açık ad ve alias'lar eklenir; addan türetilen dizeler ("Mayonez (light)" -> "mayonez")
   * yalnızca başka bir besine ait değilse eklenir. Böylece her dize tek bir besine çıkar.
   */
  function buildIndex(foods) {
    foods = foods || [];
    if (indexCache.foods === foods && indexCache.len === foods.length && indexCache.idx) return indexCache.idx;
    var entries = [], byFirst = Object.create(null), byId = Object.create(null), byStr = Object.create(null);
    var foodEntries = new Map(), variants = Object.create(null), foodCls = new Map();
    function add(food, order, alias, primary, derived) {
      var toks = foldTokens(alias);
      if (!toks.length) return;
      var str = toks.join(' ');
      var prev = byStr[str];
      if (prev && (prev.food === food || derived)) return;
      var e = { food: food, toks: toks, str: str, primary: primary, order: order, i: entries.length };
      entries.push(e);
      if (!prev) byStr[str] = e;
      (byFirst[toks[0]] = byFirst[toks[0]] || []).push(e);
      var fe = foodEntries.get(food);
      if (!fe) foodEntries.set(food, fe = []);
      fe.push(e);
    }
    // 1) adlar ve açık alias'lar
    foods.forEach(function (food, order) {
      if (!food || !food.name) return;
      byId[food.id] = food;
      add(food, order, food.name, true, false);
      if (Array.isArray(food.aliases)) for (var a = 0; a < food.aliases.length; a++) add(food, order, food.aliases[a], false, false);
    });
    // 2) addan türetilenler (parantezsiz ad, "ad + parantez içi")
    foods.forEach(function (food, order) {
      if (!food || !food.name) return;
      var noParen = String(food.name).replace(/\([^)]*\)/g, ' ').trim();
      if (noParen && noParen !== food.name) add(food, order, noParen, false, true);
      var paren = String(food.name).match(/\(([^)]*)\)/);
      if (paren) add(food, order, noParen + ' ' + paren[1], false, true);
    });
    // 3) varyant niteleyicileri
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], vr = variantInfo(e.toks);
      if (!vr) continue;
      e.cls = vr.cls;
      if (e.primary) foodCls.set(e.food, vr.cls);
      if (!vr.base) continue;
      (variants[vr.base] = variants[vr.base] || []).push(e);
    }
    var idx = { entries: entries, byFirst: byFirst, byId: byId, byStr: byStr, foods: foods, foodEntries: foodEntries, variants: variants, foodCls: foodCls, tri: null };
    indexCache = { foods: foods, len: foods.length, idx: idx };
    return idx;
  }

  /* ---- Trigram indeksi (bulanık arama için, ilk gerektiğinde kurulur) ----
   * Trigramlar tamsayıya kodlanır (41^3) ve CSR biçiminde Int32Array'lerde tutulur: hızlı ve az bellek. */
  var TRI_N = 41 * 41 * 41;
  function triCode(ch) {
    var c = ch.charCodeAt(0);
    if (c === 32) return 0;
    if (c >= 97 && c <= 122) return c - 96;
    if (c >= 48 && c <= 57) return c - 21;
    return c === 37 ? 37 : c === 46 ? 38 : 39;
  }
  function triCodes(str) {
    var s = '  ' + str + ' ', out = [], a = triCode(s[0]), b = triCode(s[1]);
    for (var k = 2; k < s.length; k++) {
      var c = triCode(s[k]);
      out.push(a * 1681 + b * 41 + c);
      a = b; b = c;
    }
    return out;
  }
  function ensureTri(idx) {
    if (idx.tri) return idx.tri;
    var ents = idx.entries, n = ents.length, counts = new Int32Array(TRI_N + 1), stamp = new Int32Array(TRI_N), codes = new Array(n);
    for (var i = 0; i < n; i++) {
      var cs = triCodes(ents[i].str), u = [];
      for (var k = 0; k < cs.length; k++) if (stamp[cs[k]] !== i + 1) { stamp[cs[k]] = i + 1; u.push(cs[k]); counts[cs[k] + 1]++; }
      codes[i] = u;
    }
    for (var g = 1; g <= TRI_N; g++) counts[g] += counts[g - 1];
    var post = new Int32Array(counts[TRI_N]), fill = counts.slice(0, TRI_N);
    for (i = 0; i < n; i++) { var uc = codes[i]; for (k = 0; k < uc.length; k++) post[fill[uc[k]]++] = i; }
    idx.tri = { off: counts, post: post, counts: new Uint16Array(n), vocab: null, vocabList: null };
    return idx.tri;
  }
  /** kelime -> entry listesi (arama için, ilk gerektiğinde) */
  function ensureVocab(idx) {
    var tri = ensureTri(idx);
    if (tri.vocab) return tri;
    var vocab = new Map();
    idx.entries.forEach(function (e, i) {
      for (var t = 0; t < e.toks.length; t++) { var l = vocab.get(e.toks[t]); if (!l) vocab.set(e.toks[t], l = []); if (l[l.length - 1] !== i) l.push(i); }
    });
    tri.vocab = vocab; tri.vocabList = Array.from(vocab.keys());
    return tri;
  }

  /** text ile en çok trigram paylaşan entry indeksleri (en fazla max tane, artan sırada). */
  function triCandidates(idx, texts, max) {
    var tri = ensureTri(idx), counts = tri.counts, touched = [], off = tri.off, post = tri.post;
    texts.forEach(function (text) {
      var cs = triCodes(text), seen = Object.create(null);
      for (var k = 0; k < cs.length; k++) {
        var g = cs[k];
        if (seen[g]) continue;
        seen[g] = 1;
        for (var j = off[g], e = off[g + 1]; j < e; j++) { var x = post[j]; if (!counts[x]) touched.push(x); counts[x]++; }
      }
    });
    var out = touched;
    if (touched.length > max) {
      out = touched.slice().sort(function (a, b) { return counts[b] - counts[a] || a - b; }).slice(0, max);
    }
    for (var c = 0; c < touched.length; c++) counts[touched[c]] = 0;
    return out.sort(function (a, b) { return a - b; });
  }

  function isBlockingTok(t) { return !t || t.f === ','; }

  /** i konumundan başlayan en uzun alias eşleşmesi */
  function matchFoodAt(toks, i, idx, boost) {
    var t = toks[i];
    if (isBlockingTok(t) || /^\d/.test(t.f)) return null;
    var keys = [t.f];
    if (t.f.length >= 3) for (var s in stems(t.f)) if (s !== t.f) keys.push(s);
    var cands = [], seen = new Set();
    keys.forEach(function (k) { (idx.byFirst[k] || []).forEach(function (e) { if (!seen.has(e)) { seen.add(e); cands.push(e); } }); });
    // kısa alias'lar (su, et) için de ilk-harf taraması
    var best = null;
    for (var c = 0; c < cands.length; c++) {
      var e = cands[c];
      if (i + e.toks.length > toks.length) continue;
      var score = 1, ok = true;
      for (var j = 0; j < e.toks.length; j++) {
        var qt = toks[i + j];
        if (isBlockingTok(qt)) { ok = false; break; }
        var sc = qt.f === e.toks[j] ? 1 : (isNumWord(qt.f) ? 0 : tokenScore(qt.f, e.toks[j]));
        if (!sc) { ok = false; break; }
        score = Math.min(score, sc);
      }
      if (!ok) continue;
      var cand = { food: e.food, len: e.toks.length, score: score, primary: e.primary, order: e.order, entry: e };
      if (!best || better(cand, best, boost)) best = cand;
    }
    return best;
  }

  function better(a, b, boost) {
    if (a.len !== b.len) return a.len > b.len;
    if (a.score !== b.score) return a.score > b.score;
    var ba = (boost && boost[a.food.id]) || 0, bb = (boost && boost[b.food.id]) || 0;
    if (ba !== bb) return ba > bb;
    if (a.primary !== b.primary) return a.primary;
    return a.order < b.order;
  }

  /* ------------------------------------------------------------------ */
  /* Bulanık eşleşme                                                     */
  /* ------------------------------------------------------------------ */
  function levenshtein(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    var prev = new Array(n + 1), cur = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  function trigrams(s) {
    s = '  ' + s + ' ';
    var out = [];
    for (var i = 0; i < s.length - 2; i++) out.push(s.substr(i, 3));
    return out;
  }
  function dice(a, b) {
    var ta = trigrams(a), tb = trigrams(b), map = Object.create(null), inter = 0;
    ta.forEach(function (g) { map[g] = (map[g] || 0) + 1; });
    tb.forEach(function (g) { if (map[g] > 0) { inter++; map[g]--; } });
    return (2 * inter) / (ta.length + tb.length);
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    var lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
    return Math.max(lev, dice(a, b) * 0.97);
  }

  function shortestStem(w) {
    var best = w;
    var st = stems(w);
    for (var k in st) if (k.length >= 3 && k.length < best.length) best = k;
    return best;
  }

  var FUZZY_MAX = 400; // trigram ön elemesinden sonra tam benzerliği hesaplanan en fazla entry

  function fuzzyFind(text, idx, boost) {
    if (!text || text.length < 3) return null;
    var stemmed = text.split(' ').map(shortestStem).join(' ');
    var best = null, ents = idx.entries;
    var cand = triCandidates(idx, stemmed !== text ? [text, stemmed] : [text], FUZZY_MAX);
    for (var ci = 0; ci < cand.length; ci++) {
      var e = ents[cand[ci]];
      var dl = Math.abs(e.str.length - text.length);
      if (dl > Math.max(4, text.length * 0.6)) continue;
      var sc = similarity(text, e.str);
      if (stemmed !== text) sc = Math.max(sc, similarity(stemmed, e.str) * 0.97);
      if (!best || sc > best.score + 1e-9 || (Math.abs(sc - best.score) < 1e-9 && better({ food: e.food, len: 0, score: 0, primary: e.primary, order: e.order }, { food: best.food, len: 0, score: 0, primary: best.primary, order: best.order }, boost))) {
        best = { food: e.food, score: sc, primary: e.primary, order: e.order };
      }
    }
    return best;
  }

  /** Eşleşmeyen metin için en yakın 3 besin önerisi (bulanık + kelime örtüşmesi). */
  function suggestFoods(text, idx, boost, limit) {
    var words = String(text || '').split(' ').filter(function (w) { return w.length >= 3 && !readDescWord(w); });
    if (!words.length) return [];
    var full = words.join(' '), bestBy = new Map(), ents = idx.entries;
    var cand = triCandidates(idx, words.length > 1 ? [full].concat(words) : [full], FUZZY_MAX * 2);
    for (var ci = 0; ci < cand.length; ci++) {
      var e = ents[cand[ci]], hit = 0, matchedToks = {};
      for (var a = 0; a < words.length; a++) {
        for (var b = 0; b < e.toks.length; b++) {
          if (e.toks[b].length < 3) continue;
          if (tokenScore(words[a], e.toks[b]) > 0 || similarity(words[a], e.toks[b]) >= 0.8) { hit++; matchedToks[b] = 1; break; }
        }
      }
      var s = similarity(full, e.str) * 0.9;
      if (hit) s = Math.max(s, 0.35 + 0.35 * (hit / words.length) + 0.25 * (Object.keys(matchedToks).length / e.toks.length));
      if (s < 0.5) continue;
      if (e.primary) s += 0.01;
      if (boost && boost[e.food.id]) s += Math.min(0.05, boost[e.food.id] / 100);
      var prev = bestBy.get(e.food);
      if (prev == null || s > prev) bestBy.set(e.food, s);
    }
    var arr = [];
    bestBy.forEach(function (sc, food) { arr.push({ food: food, score: sc }); });
    arr.sort(function (x, y) { return y.score - x.score || String(x.food.name).length - String(y.food.name).length; });
    return arr.slice(0, limit || 3).map(function (x) { return { id: x.food.id, name: x.food.name }; });
  }
  function readDescWord(w) { return Object.prototype.hasOwnProperty.call(DESC, w) || !!variantAt([w], 0); }

  /* ------------------------------------------------------------------ */
  /* Miktar -> gram                                                       */
  /* ------------------------------------------------------------------ */
  function foodUnits(food) {
    var u = (food && food.units && typeof food.units === 'object') ? food.units : {};
    var out = {};
    Object.keys(u).forEach(function (k) { var g = Number(u[k]); if (g > 0 && isFinite(g)) out[k] = g; });
    return out;
  }

  function firstCountUnit(units) {
    var pref = ['adet', 'porsiyon', 'dilim', 'bardak', 'kase', 'tabak', 'parça'];
    for (var i = 0; i < pref.length; i++) if (units[pref[i]]) return pref[i];
    var keys = Object.keys(units);
    return keys.length ? keys[0] : null;
  }

  /**
   * Birimi besine göre çözer.
   * @returns {{qty:number, unit:string, unitG:number, conf:number, fallback:boolean}}
   */
  function resolveUnit(food, qty, unit, fracWord) {
    var units = foodUnits(food);
    var def = food && food.def && (food.def === 'g' || food.def === 'ml' || units[food.def]) ? food.def : (firstCountUnit(units) || 'g');
    if (!units[def] && def !== 'g' && def !== 'ml') def = 'g';
    var conf = 1;

    if (unit === 'kg') { unit = 'g'; qty = (qty == null ? 1 : qty) * 1000; }
    else if (unit === 'l') { unit = 'ml'; qty = (qty == null ? 1 : qty) * 1000; }
    else if (unit === 'cl') { unit = 'ml'; qty = (qty == null ? 1 : qty) * 10; }

    if (!unit) {
      if (qty == null) {
        if (def === 'g' || def === 'ml') return { qty: 100, unit: def, unitG: 1, conf: 1, fallback: false };
        return { qty: 1, unit: def, unitG: units[def], conf: 1, fallback: false };
      }
      if (fracWord && units.adet && def !== 'adet') return { qty: qty, unit: 'adet', unitG: units.adet, conf: 0.95, fallback: false };
      if (def !== 'g' && def !== 'ml') return { qty: qty, unit: def, unitG: units[def], conf: 1, fallback: false };
      if (qty >= 25) return { qty: qty, unit: def, unitG: 1, conf: 0.85, fallback: false };
      var cu = firstCountUnit(units);
      if (cu) return { qty: qty, unit: cu, unitG: units[cu], conf: 0.85, fallback: false };
      return { qty: qty * 100, unit: 'g', unitG: 1, conf: 0.6, fallback: true };
    }
    if (qty == null) qty = 1;
    if (unit === 'g' || unit === 'ml') return { qty: qty, unit: unit, unitG: 1, conf: 1, fallback: false };
    if (units[unit]) return { qty: qty, unit: unit, unitG: units[unit], conf: conf, fallback: false };

    // eşdeğer birimler
    var eq = { 'bardak': ['su bardağı'], 'su bardağı': ['bardak'], 'adet': ['parça', 'top'], 'parça': ['adet', 'dilim'], 'top': ['adet'],
      'tabak': ['porsiyon'], 'kase': ['porsiyon'], 'kepçe': ['kase'], 'çay bardağı': [], 'fincan': ['çay bardağı'] };
    var alts = eq[unit] || [];
    for (var i = 0; i < alts.length; i++) {
      if (units[alts[i]]) {
        var same = (unit === 'bardak' || unit === 'su bardağı' || alts[i] === 'adet' || unit === 'adet');
        return { qty: qty, unit: same ? alts[i] : unit, unitG: units[alts[i]], conf: same ? 0.9 : 0.7, fallback: !same };
      }
    }
    if ((unit === 'porsiyon' || unit === 'tabak' || unit === 'kase' || unit === 'adet') && def !== 'g' && def !== 'ml') {
      if (unit === 'adet') return { qty: qty, unit: def, unitG: units[def], conf: 0.8, fallback: false };
      return { qty: qty, unit: unit, unitG: units[def], conf: 0.7, fallback: true };
    }
    var gg = GENERIC_UNIT_G[unit] || 100;
    if (unit === 'porsiyon' && (def === 'g' || def === 'ml')) gg = 150;
    return { qty: qty, unit: unit, unitG: gg, conf: 0.6, fallback: true };
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  /**
   * Besin + miktar + birimden kalori/makro hesaplar.
   * opts.state: 'raw' | 'cooked' (yalnızca çiğ/pişmiş değeri olan besinlerde), opts.scale: adet boyu çarpanı (büyük/küçük)
   */
  function computeItem(food, qty, unit, unitG, opts) {
    opts = opts || {};
    var g, mass = (unit === 'g' || unit === 'ml');
    var scale = !mass && opts.scale > 0 && opts.scale !== 1 ? opts.scale : 1;
    if (mass) g = qty;
    else {
      var units = foodUnits(food);
      var ug = units[unit] || unitG || GENERIC_UNIT_G[unit] || 100;
      g = qty * ug * scale;
      unitG = ug;
    }
    var st = hasStates(food) ? (opts.state === 'raw' || opts.state === 'cooked' ? opts.state : baseState(food)) : null;
    var v = st ? stateValues(food, st) : food;
    var k = (Number(v.kcal) || 0) * g / 100;
    var out = {
      foodId: food.id, name: st ? itemName(food, st) : food.name, qty: qty, unit: unit, unitG: mass ? 1 : unitG,
      grams: round1(g), kcal: Math.round(k),
      p: round1((Number(v.p) || 0) * g / 100), c: round1((Number(v.c) || 0) * g / 100), f: round1((Number(v.f) || 0) * g / 100)
    };
    if (st) out.state = st;
    if (scale !== 1) out.scale = scale;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Varyant seçimi (light, yağsız, şekersiz, zero ...)                   */
  /* ------------------------------------------------------------------ */
  function baseStrsOf(idx, food, entry) {
    var out = [], seen = Object.create(null);
    function addE(e) {
      if (!e) return;
      var vi = e.cls ? variantInfo(e.toks) : null, b = vi ? vi.base : e.str;
      if (b && !seen[b]) { seen[b] = 1; out.push(b); }
    }
    addE(entry);
    (idx.foodEntries.get(food) || []).forEach(addE);
    return out;
  }

  /** food'un istenen sınıflardaki (want) çeşidini bulur -> {food, entry, exact} */
  function findVariant(idx, food, entry, want) {
    var bases = baseStrsOf(idx, food, entry), best = null;
    for (var b = 0; b < bases.length; b++) {
      var list = idx.variants[bases[b]];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var ve = list[k];
        if (ve.food === food) continue;
        var exact = 0, near = 0, extra = 0;
        for (var w = 0; w < want.length; w++) {
          if (ve.cls[want[w]]) exact++;
          else if ((VARIANT_NEAR[want[w]] || []).some(function (n) { return ve.cls[n]; })) near++;
        }
        if (exact + near < want.length) continue;
        for (var c in ve.cls) if (want.indexOf(c) < 0) extra++;
        var sc = exact * 10 + near * 3 - extra * 2 + (ve.primary ? 1 : 0) - b * 0.5;
        if (!best || sc > best.sc || (sc === best.sc && ve.order < best.entry.order)) best = { food: ve.food, entry: ve, exact: exact === want.length, sc: sc };
      }
    }
    return best;
  }

  /** Besin zaten o özellikte mi? (çay zaten şekersiz, tavuk göğsü zaten yağsız sayılır) */
  function inherent(idx, food, want) {
    var own = idx.foodCls.get(food) || {};
    var k = Number(food.kcal) || 0, c = Number(food.c) || 0, f = Number(food.f) || 0;
    return want.every(function (w) {
      if (own[w]) return true;
      if (w === 'light' || w === 'zero') return k <= 25;
      if (w === 'sugarfree') return c <= 3 || k <= 25;
      if (w === 'nofat') return f <= 1;
      if (w === 'lowfat') return f <= 3;
      return false;
    });
  }

  /** Çeşit bulunamadığında onay ekranında gösterilecek öneriler (aynı besinin diğer çeşitleri + benzerleri). */
  function variantSuggestions(idx, food, rawToks, boost) {
    var out = [], seen = new Set([food]);
    baseStrsOf(idx, food, null).forEach(function (b) {
      (idx.variants[b] || []).forEach(function (ve) { if (!seen.has(ve.food) && out.length < 3) { seen.add(ve.food); out.push({ id: ve.food.id, name: ve.food.name }); } });
    });
    if (out.length < 3) {
      var words = rawToks.map(function (t) { return t.f; }).filter(function (w) { return !/^[0-9.]+$/.test(w) && !isNumWord(w); });
      suggestFoods(words.join(' '), idx, boost, 6).forEach(function (sg) {
        var f = idx.byId[sg.id];
        if (out.length < 3 && f && !seen.has(f)) { seen.add(f); out.push(sg); }
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Ana ayrıştırıcı                                                     */
  /* ------------------------------------------------------------------ */
  var FUZZY_ACCEPT = 0.72;

  function parse(text, foods, opts) {
    opts = opts || {};
    var idx = buildIndex(foods || []);
    var boost = opts.boost || null;
    var toks = tokenize(text);
    var items = [], unmatched = [], meal = null;
    var pending = null;           // {qty, unit, fracWord, fuzzy, raw:[]}
    var unknown = [];             // bilinmeyen kelimeler
    var last = null;              // son eklenen kalem (aynı grup içinde)
    var lastExplicit = false;
    var mods = [];                // sıradaki besine ait niteleyiciler (kemiksiz, çiğ, ızgara...)
    var modEnd = -1;              // son niteleyici dizisinin bittiği konum
    var n = toks.length;

    /** Niteleyicileri çözer: varyant besin, çiğ/pişmiş durumu, boyut çarpanı. */
    function resolveMods(food, entry, ml) {
      var res = { food: food, state: null, scale: 1, conf: 1 };
      var want = [];
      ml.forEach(function (m) {
        if (m.info.state) res.state = m.info.state;
        if (m.info.scale) res.scale = m.info.scale;
        if (m.info.variant && want.indexOf(m.info.variant) < 0) want.push(m.info.variant);
      });
      var ent = entry || null;
      if (ml.length && entry) {
        var cands = [], keys = ml.map(function (m) { return m.key; });
        cands.push(keys.join(' ') + ' ' + entry.str);
        for (var a = keys.length - 1; a >= 0; a--) { cands.push(keys[a] + ' ' + entry.str); cands.push(entry.str + ' ' + keys[a]); }
        for (var c = 0; c < cands.length; c++) {
          var e2 = idx.byStr[cands[c]];
          if (e2 && e2.food !== food) { res.food = e2.food; ent = e2; break; }
        }
      }
      // et/balık gibi çiğ/pişmiş değerli besinlerde "yağsız / az yağlı" bir tarif sıfatıdır, ayrı ürün aranmaz
      if (want.length && hasStates(food) && res.food === food && want.every(function (w) { return w === 'nofat' || w === 'lowfat'; })) want = [];
      if (want.length) {
        var have = res.food !== food ? (ent && ent.cls) || idx.foodCls.get(res.food) : null;
        if (!have || !want.every(function (w) { return have[w]; })) {
          var v = findVariant(idx, food, ent || entry, want);
          if (v) { res.food = v.food; ent = v.entry; res.conf = v.exact ? 1 : 0.85; }
          else if (!inherent(idx, food, want)) { res.conf = 0.6; res.noVariant = want; }
        }
      }
      if (ent && !res.state) {
        for (var q = 0; q < ent.toks.length; q++) if (STATE_ALIAS_TOKS[ent.toks[q]]) res.state = STATE_ALIAS_TOKS[ent.toks[q]];
      }
      if (!hasStates(res.food)) res.state = null;
      else if (!res.state) res.state = baseState(res.food);
      return res;
    }
    function modToks(ml) { var o = []; ml.forEach(function (m) { o = o.concat(m.toks); }); return o; }

    function makeItem(food, q, rawToks, conf, res) {
      var r = resolveUnit(food, q ? q.qty : null, q ? q.unit : null, q && q.fracWord);
      var it = computeItem(food, r.qty, r.unit, r.unitG, res ? { state: res.state, scale: res.scale } : null);
      var vc = res && res.conf != null ? res.conf : 1;
      it.confidence = Math.max(0.05, Math.min(1, Math.round(conf * vc * r.conf * (q && q.fuzzy ? 0.8 : 1) * 100) / 100));
      if (r.fallback) it.unitFallback = true;
      it.raw = rawToks.map(function (t) { return t.r; }).join(' ');
      if (res && res.noVariant) {
        // istenen light/şekersiz... çeşidi veritabanında yok: temel besin + benzer öneriler
        it.variantMissing = res.noVariant.slice();
        it.suggestions = variantSuggestions(idx, food, rawToks, boost);
      }
      return it;
    }

    function pushItem(food, rawToks, conf, entry) {
      var q = pending, ml = mods;
      var res = resolveMods(food, entry, ml);
      var allRaw = (q ? q.raw : []).concat(modToks(ml), rawToks);
      var it = makeItem(res.food, q, allRaw, conf, res);
      items.push(it);
      last = { item: it, food: res.food, baseFood: food, entry: entry, mods: ml.slice(), res: res, rawToks: allRaw, conf: conf, q: q };
      lastExplicit = !!q;
      pending = null;
      mods = [];
    }

    /** Besinden sonra gelen niteleyiciyi ("tavuk göğsü çiğ") son kaleme uygular. */
    function modifyLast(newMods) {
      var ml = last.mods.concat(newMods);
      var res = resolveMods(last.baseFood, last.entry, ml);
      var allRaw = last.rawToks.concat(modToks(newMods));
      var it = makeItem(res.food, last.q, allRaw, last.conf, res);
      items[items.indexOf(last.item)] = it;
      last.item = it; last.food = res.food; last.mods = ml; last.res = res; last.rawToks = allRaw;
    }

    function flushUnknown(atBoundary) {
      if (!unknown.length) return;
      var words = unknown.map(function (t) { return t.f; });
      var text = words.join(' ');
      // 1) Bir önceki besinin tamlamasının devamı mı? (tavuk + göğsü, mercimek + çorbası)
      if (last && !pending && unknown[0].__afterFood) {
        var combo = last.rawToks.filter(function (t) { return !/^\d/.test(t.f) && !isNumWord(t.f) && !parseUnit([t], 0, true); })
          .map(function (t) { return t.f; }).concat(words).join(' ');
        var fz = fuzzyFind(combo, idx, boost);
        if (fz && fz.score >= 0.8 && fz.food !== last.food) {
          items.pop();
          pending = last.q;
          pushItem(fz.food, last.rawToks.slice(last.q ? last.q.raw.length : 0).concat(unknown), fz.score * 0.95);
          unknown = [];
          return;
        }
        var possessive = unknown.length <= 2 && unknown.every(function (t) { return /(i|u|si|su|leri|lari)$/.test(t.f) && t.f.length > 3; });
        if (possessive) {
          last.item.raw += ' ' + unknown.map(function (t) { return t.r; }).join(' ');
          last.item.confidence = Math.round(last.item.confidence * 0.8 * 100) / 100;
          unknown = [];
          return;
        }
      }
      // 2) Bulanık eşleşme
      var fz2 = fuzzyFind(text, idx, boost);
      if (fz2 && fz2.score >= FUZZY_ACCEPT) {
        pushItem(fz2.food, unknown, fz2.score * 0.9);
        unknown = [];
        return;
      }
      // tek tek kelimeler için de dene (son kelime genelde isim)
      if (unknown.length > 1) {
        var lastW = unknown[unknown.length - 1];
        var fz3 = fuzzyFind(lastW.f, idx, boost);
        if (fz3 && fz3.score >= 0.85) {
          pushItem(fz3.food, unknown, fz3.score * 0.75);
          unknown = [];
          return;
        }
      }
      // baş isim (ilk kelime) için bulanık dene: "tavukk pirzolaa" -> tavuk (düşük güvenle)
      if (unknown.length > 1) {
        var firstW = unknown[0];
        var fz4 = fuzzyFind(firstW.f, idx, boost);
        if (fz4 && fz4.score >= 0.88) {
          pushItem(fz4.food, unknown, fz4.score * 0.55);
          unknown = [];
          return;
        }
      }
      // 3) Eşleşmedi: en yakın 3 öneriyle birlikte
      unmatched.push({
        suggestions: suggestFoods(text, idx, boost, 3),
        text: unknown.map(function (t) { return t.r; }).join(' '),
        qty: pending ? pending.qty : null, unit: pending ? pending.unit : null,
        raw: (pending ? pending.raw : []).concat(unknown).map(function (t) { return t.r; }).join(' ')
      });
      pending = null;
      unknown = [];
    }

    function onlyFillersUntilBoundary(k) {
      while (k < n) {
        if (isSepAt(toks, k)) return true;
        if (matchMealAt(toks, k)) return true;
        if (FILLERS[toks[k].f] || looksLikeVerb(toks[k].f)) { k++; continue; }
        return false;
      }
      return true;
    }

    var i = 0;
    while (i < n) {
      var t = toks[i];

      // öğün kelimesi
      var m = matchMealAt(toks, i);
      if (m && !(unknown.length === 0 && matchFoodAt(toks, i, idx, boost) && matchFoodAt(toks, i, idx, boost).len > m.len)) {
        flushUnknown(true);
        meal = m.meal;
        i += m.len;
        continue;
      }

      // ayırıcı
      var sep = isSepAt(toks, i);
      if (sep && t.f === 've' && i === modEnd && readDesc(toks, i + 1)) { i++; continue; } // "kemiksiz ve derisiz tavuk pirzola"
      if (sep) {
        mods = [];
        // ayırıcı kelime bir besin adının parçası mı? ("tavuk ve pilav" gibi alias)
        flushUnknown(true);
        if (pending && pending.raw.length) {
          // sahipsiz miktar: önceki kaleme ait olabilir
          if (last && !lastExplicit) applyTrailing();
          else pending = null;
        }
        last = null;
        i += sep;
        continue;
      }

      // miktar
      // "yarım yağlı süt", "sıfır kola": miktar değil niteleyici
      var vq = variantAt(toks, i);
      var q = vq && (vq.len > 1 || t.f === 'sifir') ? null : parseQuantity(toks, i);
      if (q && q.len === 1 && toks[i].f === 'yedi' && onlyFillersUntilBoundary(i + 1)) q = null; // "yedi" = fiil
      // "yarım ekmek döner", "çeyrek ekmek arası köfte": ekmek boyunu anlatır, 1 adet sandviçtir
      if (q && q.fracWord && q.len === 1 && toks[i + 1] && toks[i + 1].f === 'ekmek') {
        var whole = matchFoodAt(toks, i, idx, boost);
        if (whole && whole.len >= 3 && !pending) { q = null; } // "yarım ekmek kokoreç" adlı ayrı bir besin var
        else {
          var sw = matchFoodAt(toks, i + 1, idx, boost);
          if (sw && sw.len > 1) q = { value: 1, len: 1, fracWord: false, fuzzy: false };
        }
      }
      // "iki yumurtalı menemen": sayı sıfatı niteler, menemen 1 porsiyondur
      if (q && !q.fracWord && toks[i + q.len] && /l(i|u)$/.test(toks[i + q.len].f) && !parseUnit(toks, i + q.len, true) &&
          !matchFoodAt(toks, i + q.len, idx, boost) && matchFoodAt(toks, i + q.len + 1, idx, boost)) {
        i += q.len + 1;
        continue;
      }
      if (q) {
        var j = i + q.len;
        var u = parseUnit(toks, j, true);
        if (u) j += u.len;
        var qraw = toks.slice(i, j);
        // "yağsız tavuk göğsü 150 gram": önce besinin devamı olan kelimeleri ("göğsü") bağla
        if (last && !lastExplicit && unknown.length && unknown[0].__afterFood && onlyFillersUntilBoundary(j)) flushUnknown(false);
        // sondaki miktar: "ekmek iki dilim"
        if (last && !lastExplicit && unknown.length === 0 && onlyFillersUntilBoundary(j)) {
          pending = { qty: q.value, unit: u ? u.unit : null, fracWord: q.fracWord, fuzzy: q.fuzzy, raw: qraw };
          applyTrailing();
          i = j;
          continue;
        }
        flushUnknown(false);
        if (pending && last == null && pending.raw.length) {
          // iki miktar art arda ("iki üç") -> sonuncuyu al
        }
        pending = { qty: q.value, unit: u ? u.unit : null, fracWord: q.fracWord, fuzzy: q.fuzzy, raw: qraw };
        last = null;
        i = j;
        continue;
      }

      // miktarsız birim ("kase çorba")
      var u2 = parseUnit(toks, i, false);
      if (u2 && !(u2.len === 1 && matchFoodAt(toks, i, idx, boost))) {
        var nextFood = matchFoodAt(toks, i + u2.len, idx, boost);
        if (nextFood || !last || lastExplicit) {
          flushUnknown(false);
          pending = pending && pending.unit == null ? { qty: pending.qty, unit: u2.unit, fracWord: pending.fracWord, fuzzy: pending.fuzzy, raw: pending.raw.concat(toks.slice(i, i + u2.len)) }
            : { qty: null, unit: u2.unit, raw: toks.slice(i, i + u2.len) };
          last = null;
          i += u2.len;
          continue;
        }
      }

      // niteleyici sözcükler (kemiksiz, çiğ, ızgara, büyük ...)
      var d0 = readDesc(toks, i);
      if (d0) {
        var fm0 = matchFoodAt(toks, i, idx, boost);
        var dl = [], dj = i, d1;
        while ((d1 = readDesc(toks, dj))) {
          if (dj > i) { var fmx = matchFoodAt(toks, dj, idx, boost); if (fmx && fmx.len >= 2) break; }
          dl.push(d1); dj += d1.len;
        }
        var nextFood = dj < n && !isSepAt(toks, dj) && !matchMealAt(toks, dj) && (parseQuantity(toks, dj) || parseUnit(toks, dj, false) || matchFoodAt(toks, dj, idx, boost));
        var asFood = fm0 && (fm0.len >= 2 || !nextFood);
        // "yağsız tavuk pirzola": niteleyiciden sonraki ad ("tavuk pirzola"), niteleyicili alias'tan ("yağsız tavuk") daha uzunsa niteleyici say
        if (asFood && fm0.len >= 2 && dj < n) {
          var fmN = matchFoodAt(toks, dj, idx, boost);
          if (fmN && dj + fmN.len > i + fm0.len) asFood = false;
        }
        if (!asFood) {
          var atEnd = dj >= n || isSepAt(toks, dj) || !!matchMealAt(toks, dj) || FILLERS[toks[dj].f] || looksLikeVerb(toks[dj].f);
          if (!atEnd && last && !pending && !mods.length) {
            // "süt light bir bardak": niteleyiciden sonra yalnızca miktar geliyorsa önceki besine aittir
            var qa = parseQuantity(toks, dj), ka = dj;
            if (qa) { ka += qa.len; var ua = parseUnit(toks, ka, true); if (ua) ka += ua.len; }
            else { var ub = parseUnit(toks, ka, false); if (ub) ka += ub.len; }
            if (ka > dj && onlyFillersUntilBoundary(ka)) atEnd = true;
          }
          if (unknown.length) flushUnknown(false);
          if (last && !pending && atEnd && !mods.length) modifyLast(dl);
          else mods = mods.concat(dl);
          modEnd = dj;
          i = dj;
          continue;
        }
      }

      // besin
      var fm = matchFoodAt(toks, i, idx, boost);
      if (fm) {
        var span = toks.slice(i, i + fm.len);
        if (unknown.length) {
          // sıfatlar + besin: önce birleşik ifadeyi bulanık dene
          var combined = unknown.map(function (x) { return x.f; }).concat(fm.entry.toks).join(' ');
          var fzc = fuzzyFind(combined, idx, boost);
          if (fzc && fzc.score >= 0.85 && fzc.food !== fm.food) {
            pushItem(fzc.food, unknown.concat(span), fzc.score * 0.95);
          } else if (unknown[0].__afterFood && last) {
            // önceki besinden sonra gelen tanınmayan kelimeler ayrı bir parça
            var keepPending = pending; pending = null;
            flushUnknown(true);
            pending = keepPending;
            pushItem(fm.food, span, fm.score, fm.entry);
          } else {
            var modConf = fm.score * (unknown.length > 2 ? 0.75 : 0.9);
            pushItem(fm.food, unknown.concat(span), modConf, fm.entry);
          }
          unknown = [];
        } else {
          pushItem(fm.food, span, fm.score, fm.entry);
        }
        i += fm.len;
        continue;
      }

      // dolgu kelimeleri
      if (FILLERS[t.f] || looksLikeVerb(t.f) || t.f === 'bi' || t.f === '.') { i++; continue; }

      // bilinmeyen kelime
      t = { r: t.r, f: t.f, __afterFood: !!(last && unknown.length === 0) || (unknown.length && unknown[0].__afterFood) };
      unknown.push(t);
      i++;
    }
    flushUnknown(true);
    if (pending && pending.raw.length) {
      if (last && !lastExplicit) applyTrailing();
    }

    function applyTrailing() {
      if (!last || !pending) { pending = null; return; }
      var q2 = pending;
      var it = makeItem(last.food, q2, last.rawToks.concat(q2.raw), last.conf, last.res);
      items[items.indexOf(last.item)] = it;
      last.item = it;
      lastExplicit = true;
      pending = null;
    }

    return { items: items, unmatched: unmatched, meal: meal, text: String(text || '') };
  }

  /* ------------------------------------------------------------------ */
  /* Arama                                                               */
  /* ------------------------------------------------------------------ */
  function searchFoods(query, foods, opts) {
    opts = opts || {};
    var limit = opts.limit || 30, boost = opts.boost || null;
    var idx = buildIndex(foods || []);
    var qt = foldTokens(query);
    if (!qt.length) return [];
    var q = qt.join(' ');
    var tri = ensureVocab(idx), ents = idx.entries;
    var bestBy = new Map();
    function put(e, s) {
      if (e.primary) s += 2;
      if (boost && boost[e.food.id]) s += Math.min(8, boost[e.food.id]);
      var prev = bestBy.get(e.food);
      if (prev == null || s > prev) bestBy.set(e.food, s);
    }
    // 1) dize eşleşmeleri (ucuz, tüm liste)
    var done = new Uint8Array(ents.length);
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i], str = e.str, s = 0;
      if (str === q) s = 100;
      else if (str.lastIndexOf(q, 0) === 0) s = 90 - Math.min(10, (str.length - q.length) / 3);
      else if (str.indexOf(q) > 0) {
        s = str.indexOf(' ' + q) >= 0 ? 78 - Math.min(8, (str.length - q.length) / 4) : 60;
      }
      if (s) { if (s > 60) done[i] = 1; put(e, s); }
    }
    // 2) her kelime bir alias kelimesiyle (ön ek / ek atarak) eşleşiyor: "tavuk göğüs" -> "tavuk göğsü ızgara"
    var perWord = qt.map(function (w) {
      var hit = new Set(), v = tri.vocabList;
      for (var k = 0; k < v.length; k++) {
        var t = v[k];
        if (t.lastIndexOf(w, 0) === 0 || (w.length >= 3 && t.length >= 2 && tokenScore(w, t) > 0)) tri.vocab.get(t).forEach(function (x) { hit.add(x); });
      }
      return hit;
    });
    perWord[0].forEach(function (x) {
      if (done[x]) return;
      for (var w = 1; w < perWord.length; w++) if (!perWord[w].has(x)) return;
      done[x] = 1; put(ents[x], 72);
    });
    // 3) yazım hatası: trigram ön elemesiyle bulanık benzerlik
    if (q.length >= 3) {
      var cand = triCandidates(idx, [q], FUZZY_MAX);
      for (var c = 0; c < cand.length; c++) {
        if (done[cand[c]]) continue;
        var e2 = ents[cand[c]], sim = similarity(q, e2.str);
        e2.toks.forEach(function (t) { sim = Math.max(sim, similarity(q, t) * 0.95); });
        if (sim >= 0.6) put(e2, sim * 55);
      }
    }
    var arr = [];
    bestBy.forEach(function (s, food) { arr.push({ food: food, score: s }); });
    arr.sort(function (a, b) { return b.score - a.score || String(a.food.name).length - String(b.food.name).length; });
    return arr.slice(0, limit).map(function (x) { return x.food; });
  }

  function unitOptions(food) {
    var units = foodUnits(food);
    var keys = Object.keys(units);
    var def = food && food.def;
    keys.sort(function (a, b) { return (b === def) - (a === def); });
    if (keys.indexOf('g') < 0) keys.push('g');
    return keys;
  }

  return {
    version: '1.2.0',
    lower: lower, fold: fold, foldTokens: foldTokens, tokenize: tokenize, stems: stems,
    wordsToNumber: wordsToNumber, parseNumberText: parseNumberText,
    levenshtein: levenshtein, similarity: similarity,
    buildIndex: buildIndex, parse: parse, searchFoods: searchFoods, fuzzyFind: function (t, foods) { return fuzzyFind(foldTokens(t).join(' '), buildIndex(foods)); },
    hasStates: hasStates, baseState: baseState, stateValues: stateValues, itemName: itemName, suggestFoods: function (t, foods, n) { return suggestFoods(foldTokens(t).join(' '), buildIndex(foods), null, n || 3); },
    resolveUnit: resolveUnit, computeItem: computeItem, foodUnits: foodUnits, unitOptions: unitOptions,
    UNIT_LABELS: UNIT_LABELS, GENERIC_UNIT_G: GENERIC_UNIT_G
  };
});
