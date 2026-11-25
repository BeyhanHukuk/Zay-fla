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
    return fold(normCompact(lower(s))).replace(/['’`][a-z]+/g, '').replace(/[^a-z0-9%]+/g, ' ').trim().split(/\s+/).filter(Boolean);
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
    [['fincan'], 'fincan'], [['fincani'], 'fincan'],
    [['olcek'], 'ölçek'], [['olcegi'], 'ölçek'], [['kare'], 'kare'], [['karesi'], 'kare'], [['salkim'], 'salkım'], [['salkimi'], 'salkım'],
    [['sira'], 'sıra'], [['sirasi'], 'sıra'], [['tutam'], 'tutam'], [['demet'], 'demet'], [['demeti'], 'demet']
  ].sort(function (a, b) { return b[0].length - a[0].length; });

  var SHORT_UNITS = { g: 1, l: 1 }; // ancak bir sayıdan sonra birim sayılır

  // Besinde birim yoksa kullanılacak genel gram karşılıkları
  var GENERIC_UNIT_G = {
    'bardak': 200, 'su bardağı': 200, 'çay bardağı': 100, 'kase': 250, 'tabak': 300, 'porsiyon': 200,
    'kepçe': 150, 'yemek kaşığı': 15, 'tatlı kaşığı': 8, 'çay kaşığı': 4, 'avuç': 30, 'dilim': 30,
    'adet': 50, 'kutu': 330, 'paket': 100, 'şişe': 500, 'top': 60, 'parça': 50, 'fincan': 75,
    'ölçek': 30, 'kare': 6, 'salkım': 150, 'sıra': 25, 'tutam': 2, 'demet': 50
  };

  var UNIT_LABELS = {
    g: 'g', ml: 'ml', adet: 'adet', dilim: 'dilim', kase: 'kase', bardak: 'bardak', porsiyon: 'porsiyon',
    tabak: 'tabak', 'yemek kaşığı': 'yemek kaşığı', 'tatlı kaşığı': 'tatlı kaşığı', 'çay kaşığı': 'çay kaşığı',
    avuç: 'avuç', kepçe: 'kepçe', 'su bardağı': 'su bardağı', 'çay bardağı': 'çay bardağı', kutu: 'kutu',
    paket: 'paket', şişe: 'şişe', top: 'top', parça: 'parça', fincan: 'fincan',
    'ölçek': 'ölçek', kare: 'kare', 'salkım': 'salkım', 'sıra': 'sıra', tutam: 'tutam', demet: 'demet'
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
    'tv televizyon karsisinda once sokakta yolda iste isyerinde ofiste okulda tablet kavanoz kavanozu sachet sase shot kapsul degil ' +
    'li lu lik luk lık '.replace(/ı/g, 'i') + 'dun evde disarida iste galiba sanirim bence bugunku dunku tabii yani artik hepsi toplam toplamda su an simdi tam olarak bi sure gibi kadarini kadar yarisi').split(/\s+/)
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

  /* ---- Hâl (durum) sözlüğü: yaş / kuru / çiğ / kavrulmuş / tuzlu / konserve / füme ... ----
   * Her ifade bir hâl sınıfına çıkar. Kullanıcının yazdığı hâl sessizce düşmez:
   *  - besin (adı/alias'ları) o hâli taşıyorsa ya da hâl besnin besin değerini değiştirmiyorsa (NEUTRAL, MILD) normal güven;
   *  - yoksa aynı temelin o hâli taşıyan çeşidi aranır ("tuzsuz kuru yemiş" -> çiğ, tuzsuz kuruyemiş);
   *  - o da yoksa temel besin düşük güvenle + not ("“yaş” hâli listede yok, en yakın: ...") + öneriler.
   * Hâl sözcüğü bir ürün adının parçasıysa ("kuru fasulye", "çiğ köfte", "yaş pasta") ad önce eşleşir; önüne gelen
   * ek hâl ("yaş kuru yemiş", "tuzsuz kuru yemiş") ise o ada uygulanır. */
  var STATE_PHRASES = [
    ['yas', 'fresh'], ['taze', 'fresh'], ['tazesi', 'fresh'],
    ['kuru', 'dried'], ['kurusu', 'dried'], ['kurutulmus', 'dried'], ['kurutulmuslar', 'dried'], ['gun kurusu', 'dried'],
    ['cig', 'raw'], ['cigi', 'raw'], ['pismemis', 'raw'], ['pismeden', 'raw'],
    ['pismis', 'cooked'], ['pisirilmis', 'cooked'], ['sote', 'cooked'],
    ['haslanmis', 'boiled'], ['haslama', 'boiled'], ['haslanmisi', 'boiled'], ['haslamasi', 'boiled'], ['buharda', 'boiled'],
    ['buharda pismis', 'boiled'], ['bugulama', 'boiled'], ['bugulanmis', 'boiled'],
    ['izgara', 'grilled'], ['izgarada', 'grilled'], ['izgarasi', 'grilled'], ['mangalda', 'grilled'],
    ['firinda', 'baked'], ['firin', 'baked'], ['firinlanmis', 'baked'], ['firinda pismis', 'baked'],
    ['kozlenmis', 'charred'], ['kozde', 'charred'], ['kozleme', 'charred'],
    ['kizarmis', 'fried'], ['kizartma', 'fried'], ['kizartmasi', 'fried'], ['kizartilmis', 'fried'], ['tava', 'fried'], ['tavada', 'fried'],
    ['kavrulmus', 'roasted'], ['kavrulmamis', 'unroasted'], ['cifte kavrulmus', 'double'],
    ['tuzlu', 'salted'], ['tuzsuz', 'unsalted'], ['tuz ilavesiz', 'unsalted'],
    ['kabuklu', 'inshell'], ['kabuksuz', 'shelled'], ['ic', 'shelled'], ['ici', 'shelled'],
    ['sekerli', 'sweet'], ['balli', 'honey'],
    ['konserve', 'canned'], ['konservesi', 'canned'],
    ['dondurulmus', 'frozen'], ['donuk', 'frozen'], ['donmus', 'frozen'],
    ['tursu', 'pickled'], ['tursusu', 'pickled'], ['salamura', 'brined'], ['salamurasi', 'brined'],
    ['tutsulenmis', 'smoked'], ['tutsu', 'smoked'], ['fume', 'smoked'], ['isli', 'smoked'],
    ['organik', 'organic'], ['dogal', 'organic'], ['ev yapimi', 'homemade'], ['ev usulu', 'homemade'], ['koy', 'village'], ['koy usulu', 'village'],
    ['sikma', 'squeezed'], ['sikilmis', 'squeezed'], ['taze sikma', 'squeezed'], ['taze sikilmis', 'squeezed'],
    ['sade', 'plain'], ['karisik', 'mixed'], ['olgun', 'ripe'], ['ham', 'unripe'], ['tam yagli', 'fullfat']
  ].map(function (x) { return { toks: x[0].split(' '), key: x[0], cls: x[1] }; })
    .sort(function (a, b) { return b.toks.length - a.toks.length; });
  var STATE_FIRST = Object.create(null);
  STATE_PHRASES.forEach(function (v) { (STATE_FIRST[v.toks[0]] = STATE_FIRST[v.toks[0]] || []).push(v); });
  // besin değerini değiştirmeyen hâller: her zaman normal güvenle temel besine
  var STATE_NEUTRAL = { squeezed: 1, organic: 1, homemade: 1, village: 1, plain: 1, mixed: 1, ripe: 1, unripe: 1, frozen: 1, fullfat: 1 };
  // besin karşıt hâli taşımıyorsa değeri değiştirmeyen hâller (taze elma = elma; ama taze ceviz != ceviz)
  var STATE_OPP = {
    fresh: ['dried'], dried: ['fresh'], raw: ['cooked', 'boiled', 'grilled', 'baked', 'charred', 'fried', 'roasted', 'smoked', 'double'],
    cooked: ['raw'], boiled: ['raw', 'fried'], grilled: ['raw', 'fried'], baked: ['raw', 'fried'], charred: ['raw'],
    unsalted: ['salted'], salted: ['unsalted'], shelled: ['inshell'], inshell: ['shelled'], unroasted: ['roasted', 'double'],
    roasted: ['unroasted', 'raw'], fried: ['raw', 'boiled'], sweet: ['plain'], honey: ['plain'], plain: ['sweet', 'honey']
  };
  // tuz kaloriyi değiştirmez: tuzlu/tuzsuz yalnızca tercih (çeşidi varsa o seçilir), yoksa not gerekmez
  var STATE_MILD = { fresh: 1, raw: 1, cooked: 1, boiled: 1, grilled: 1, baked: 1, charred: 1, salted: 1, unsalted: 1, shelled: 1, unroasted: 1 };
  // çiğ/pişmiş değerli besinlerde (et, pirinç...) bu hâller raw/cooked değerleriyle karşılanır
  var STATE_COOKING = { raw: 1, dried: 1, cooked: 1, boiled: 1, grilled: 1, baked: 1, charred: 1 };
  // yalnızca ardından bir besin gelirse hâl sayılır ("iç" fiil, "koy" fiil, "ham" ...)
  var STATE_GATED = { ic: 1, ici: 1, koy: 1, ham: 1, tursu: 1, tursusu: 1, isli: 1, tutsu: 1, kozleme: 1, kizartmasi: 1, haslamasi: 1, izgarasi: 1, kurusu: 1, tazesi: 1, konservesi: 0, salamurasi: 0 };

  function stateAt(toks, i) {
    var t = toks[i];
    if (!t) return null;
    var f = typeof t === 'string' ? t : t.f;
    var list = STATE_FIRST[f];
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
  /** Bir alias'taki hâl sınıfları ve hâlsiz temel dize. "kuru yemis" -> {cls:{dried}, base:"yemis"} */
  function stateInfo(toks) {
    var cls = null, rest = [];
    for (var i = 0; i < toks.length;) {
      var v = stateAt(toks, i);
      if (v) { (cls = cls || {})[v.cls] = 1; i += v.len; continue; }
      rest.push(toks[i]); i++;
    }
    return cls ? { cls: cls, base: rest.join(' ') } : null;
  }
  // tek başına söylenince hangi çeşit olduğu belli olmayan genel sözcükler: sorulur (düşük güven + öneriler)
  var GENERIC_WORDS = { corba: 1, sandvic: 1, kebap: 1, kebab: 1, et: 1, durum: 1, meyve: 1, pide: 1, tatli: 1, icecek: 1, 'gazli icecek': 1,
    'soguk icecek': 1, borek: 1, menu: 1, sos: 1, atistirmalik: 1, cerez: 0 };
  // bir besinin hemen ardından gelen tür sözcüğü ayrı kalem olmaz ("subway hindi sandviç", "aşure çorbası", "ranch sos")
  var SWALLOW_GENERIC = { sandvic: 1, sandvici: 1, burger: 1, menu: 1, menusu: 1, sos: 1, sosu: 1, corba: 1, corbasi: 1, icecek: 1, icecegi: 1, tatli: 1, tatlisi: 1 };
  var STATE_ALIAS_TOKS = { cig: 'raw', pismemis: 'raw', kuru: 'raw', pismis: 'cooked', haslanmis: 'cooked', haslama: 'cooked', izgara: 'cooked', firinda: 'cooked', kizarmis: 'cooked', bugulama: 'cooked' };

  STATE_PHRASES.forEach(function (v) {
    if (v.toks.length === 1) {
      if (STATE_GATED[v.key] && !/^(ic|ici|koy|ham)$/.test(v.key)) return; // yalnızca ad içinde anlamlı
      var prev = DESC[v.key] || {}, info = {};
      for (var k in prev) info[k] = prev[k];
      info.st = v.cls;
      if (v.cls === 'dried' && !info.state) info.state = 'raw';
      DESC[v.key] = info;
    } else {
      var prev2 = DESC2[v.key] || {}, info2 = {};
      for (var k2 in prev2) info2[k2] = prev2[k2];
      info2.st = v.cls;
      if (v.cls === 'boiled' || v.cls === 'baked') info2.state = 'cooked';
      DESC2[v.key] = info2;
    }
  });

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
  // rakamla yazılan ürün adları tek parça kalır: 7up, v8, b12, c4, 3in1
  var KEEP_TOK = /^(\d+up|\d+in\d|[a-z]\d{1,2})$/;
  function lastWord(str, o) {
    var a = o, b = o;
    while (a > 0 && /[0-9a-zçğıöşüâîû]/.test(str[a - 1])) a--;
    while (b < str.length && /[0-9a-zçğıöşüâîû]/.test(str[b])) b++;
    return str.slice(a, b);
  }
  /** "3'ü 1 arada", "3ü1", "3 in 1" -> "3in1" (alias'lar ve sorgu aynı biçime gelir) */
  function normCompact(s) {
    return s.replace(/(^|[^0-9.,])([2-5])(?:\s*['’`]?\s*(?:ü|u|si|sı|ı|i|in)\s*1(?:\s*arada)?|\s+1\s+arada)(?=$|[^0-9a-zçğıöşü])/g, function (m, pre, n) { return pre + n + 'in1'; });
  }

  function tokenize(text) {
    var s = lower(text);
    s = s.replace(/(\d+)\s*\/\s*(\d+)/g, function (m, a, b) { return (Number(b) ? String(+(a / b).toFixed(3)) : a); });
    s = s.replace(/(\d),(\d)/g, '$1.$2');
    s = s.replace(/(\d)\.(?!\d)/g, '$1 , ');
    s = s.replace(/[^\x00-\x7fçğıöşüâîûéèä]/g, function (ch) { try { return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { return ch; } }); // piña -> pina
    s = normCompact(s);
    s = s.replace(/['’`][a-zçğıöşüâî]+/g, '');        // Nutella'yı -> nutella
    s = s.replace(/(\d)([a-zçğıöşüâîû%])/g, function (m, a, b, o, str) { return KEEP_TOK.test(lastWord(str, o)) ? m : a + ' ' + b; });  // 200gr -> 200 gr (7up kalır)
    s = s.replace(/([a-zçğıöşüâîû])(\d)/g, function (m, a, b, o, str) { return KEEP_TOK.test(lastWord(str, o)) ? m : a + ' ' + b; });
    s = s.replace(/(\S)&(\S)/g, '$1 $2').replace(/\s&\s/g, ' ');   // m&m, ben & jerry's
    s = s.replace(/[,;!?\n\r+]|(?:\.(?!\d))/g, ' , ');
    s = s.replace(/[^0-9a-zçğıöşüâîûéèä.,%\s]+/g, ' ');
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
    // 4) hâl sözcükleri (yaş, kuru, çiğ, kavrulmuş, tuzlu ...): besinin taşıdığı hâller + hâlsiz temel -> çeşitler
    var stateBase = Object.create(null), foodSt = new Map(), nameSt = new Map();
    for (i = 0; i < entries.length; i++) {
      var se = entries[i], si = stateInfo(se.toks);
      if (!si) continue;
      se.st = si.cls; se.stBase = si.base;
      var fs = foodSt.get(se.food);
      if (!fs) foodSt.set(se.food, fs = {});
      for (var sc in si.cls) fs[sc] = 1;
      if (se.primary) nameSt.set(se.food, si.cls);
      if (si.base) (stateBase[si.base] = stateBase[si.base] || []).push(se);
    }
    // 5) marka benzeri önekler: kendi başına bir besin adı olmayan, ama ≥3 besin adının başında geçen sözcükler ("kfc", "subway", "tavuk")
    var nameSet = Object.create(null), prefixCount = Object.create(null);
    foods.forEach(function (food) {
      if (!food || !food.name) return;
      var nt = foldTokens(String(food.name).replace(/\([^)]*\)/g, ' '));
      nameSet[nt.join(' ')] = 1;
      for (var k = 1; k <= Math.min(2, nt.length - 1); k++) { var pk = nt.slice(0, k).join(' '); prefixCount[pk] = (prefixCount[pk] || 0) + 1; }
      // adın ortasında/sonunda geçen sözcük marka değildir ("beyaz peynir" -> "peynir")
      for (var m = 1; m < nt.length; m++) { prefixCount[nt[m]] = -1e9; if (m + 1 < nt.length) prefixCount[nt[m] + ' ' + nt[m + 1]] = -1e9; }
    });
    var idx = { entries: entries, byFirst: byFirst, byId: byId, byStr: byStr, foods: foods, foodEntries: foodEntries, variants: variants, foodCls: foodCls,
      nameSet: nameSet, prefixCount: prefixCount,
      stateBase: stateBase, foodSt: foodSt, nameSt: nameSt, tri: null };
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
  function matchFoodAt(toks, i, idx, boost, allowNum) {
    var t = toks[i];
    if (isBlockingTok(t) || (!allowNum && /^\d+(\.\d+)?$/.test(t.f))) return null;
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
    // komşu harf yer değiştirmesi (kyaısı, rkoa) tek hata sayılır (Damerau / OSA)
    var pp = new Array(n + 1), prev = new Array(n + 1), cur = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      cur[0] = i;
      var ca = a.charCodeAt(i - 1);
      for (j = 1; j <= n; j++) {
        var cb = b.charCodeAt(j - 1);
        var cost = ca === cb ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb && pp[j - 2] + 1 < v) v = pp[j - 2] + 1;
        cur[j] = v;
      }
      var tmp = pp; pp = prev; prev = cur; cur = tmp;
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
  function suggestFoods(text, idx, boost, limit, maxCand) {
    var words = String(text || '').split(' ').filter(function (w) { return w.length >= 3 && !readDescWord(w); });
    if (!words.length) return [];
    var full = words.join(' '), bestBy = new Map(), ents = idx.entries;
    var cand = triCandidates(idx, words.length > 1 ? [full].concat(words) : [full], maxCand || FUZZY_MAX * 2);
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

  /* ------------------------------------------------------------------ */
  /* Hâl seçimi (yaş / kuru / çiğ / kavrulmuş / tuzlu ...)               */
  /* ------------------------------------------------------------------ */
  /** Besinin kendi hâli (adı + eşleşen alias + kategorisi): karşıt hâl kontrolü için */
  function ownStates(idx, food, entry) {
    var o = {}, k;
    var ns = idx.nameSt.get(food);
    if (ns) for (k in ns) o[k] = 1;
    if (entry && entry.st) for (k in entry.st) o[k] = 1;
    if (food && food.cat === 'Kuruyemiş' && !o.fresh) o.dried = 1;
    return o;
  }
  /** Besin bu hâli açıkça taşıyor mu (adı/alias'ları ya da çiğ/pişmiş değerleri)? */
  function stateCarried(idx, food, entry, cls) {
    var all = idx.foodSt.get(food);
    if (all && all[cls]) return true;
    if (hasStates(food) && STATE_COOKING[cls]) return true;
    return !!ownStates(idx, food, entry)[cls];
  }
  /** İstenen hâl bu besinle karşılanıyor mu (taşıyor ya da hâl besin değerini değiştirmiyor)? */
  function stateSatisfied(idx, food, entry, cls) {
    if (STATE_NEUTRAL[cls]) return true;
    if (stateCarried(idx, food, entry, cls)) return true;
    var own = ownStates(idx, food, entry);
    if (STATE_MILD[cls]) return !(STATE_OPP[cls] || []).some(function (o) { return own[o]; });
    return false;
  }
  function stateBasesOf(idx, food, entry) {
    var out = [], seen = Object.create(null);
    function addE(e) {
      if (!e) return;
      var b = e.st ? e.stBase : e.str;
      if (b && !seen[b]) { seen[b] = 1; out.push(b); }
    }
    addE(entry);
    (idx.foodEntries.get(food) || []).forEach(addE);
    return out;
  }
  /** Aynı temelin istenen hâlleri taşıyan çeşidi: "kuru yemiş" + yaş -> "yaş kuru yemiş" */
  function findStateVariant(idx, food, entry, need) {
    // ad içindeki hâl ("kuru" yemiş) korunur; nötr olanlar ("sade" kahve) istenen hâlle çelişirse düşer
    var keep = entry && entry.st ? Object.keys(entry.st).filter(function (k) {
      return !(STATE_NEUTRAL[k] && need.some(function (n) { return (STATE_OPP[n] || []).indexOf(k) >= 0 || (STATE_OPP[k] || []).indexOf(n) >= 0; }));
    }) : [];
    var req = need.concat(keep.filter(function (k) { return need.indexOf(k) < 0; }));
    var bases = stateBasesOf(idx, food, entry), best = null;
    for (var b = 0; b < bases.length; b++) {
      var list = idx.stateBase[bases[b]];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var ve = list[k];
        if (ve.food === food) continue;
        if (!req.every(function (c) { return ve.st[c]; })) continue;
        var extra = 0;
        for (var c in ve.st) if (req.indexOf(c) < 0) extra++;
        var sc = -extra * 2 + (ve.primary ? 1 : 0) - b * 0.5;
        if (!best || sc > best.sc || (sc === best.sc && ve.order < best.entry.order)) best = { food: ve.food, entry: ve, sc: sc };
      }
    }
    return best;
  }
  /** Hâl bulunamadığında öneriler: aynı temelin istenen hâllerden birini taşıyan çeşitleri */
  function stateSuggestions(idx, food, entry, need) {
    var out = [], seen = new Set([food]);
    stateBasesOf(idx, food, entry).forEach(function (b) {
      (idx.stateBase[b] || []).forEach(function (ve) {
        if (seen.has(ve.food) || out.length >= 3) return;
        if (need.some(function (c) { return ve.st[c]; })) { seen.add(ve.food); out.push({ id: ve.food.id, name: ve.food.name }); }
      });
    });
    return out;
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
  /* Kemikli / derili / bütün alımlar: brüt ağırlıktan yenen net ete      */
  /* ------------------------------------------------------------------ */
  /*
   * "1,5 kiloluk bütün tavuk yedim, kemiğini ve derisini yemedim", "1 kilo kemikli pirzola, kemiğini ve yağını yemedim":
   * kullanıcı brüt (satın alınan) ağırlığı söyler; kemik / deri / yağ / kılçık / kafa payı düşülür ve yalnızca yenen
   * net et, o etin besin kaydıyla yazılır. Notta varsayım açıkça gösterilir, gram onay ekranında düzeltilebilir.
   *
   * Yalnızca bağlam açıksa uygulanır: "kemikli", "kemiğiyle", "kemik dahil", "bütün/tüm (tavuk, balık...)",
   * "brüt", "temizlenmemiş", "...kiloluk" (bütün hayvan: tavuk, hindi, balık) ya da "kemiğini/derisini/yağını/
   * kılçığını ... yemedim / ayıkladım / çıkardım / attım" gibi bir ayıklama cümlesi. "200 gram tavuk göğsü" değişmez.
   *
   * Varsayım: söylenen ağırlık ÇİĞ (satın alma / kasap) ağırlığıdır; net et çiğ değerlerle hesaplanır (besin çiğ/pişmiş
   * değer taşıyorsa). "pişmiş ağırlığı/hali" denirse oran aynı kalır, pişmiş değerler kullanılır.
   * Adet / porsiyon ile söylenen kalemlerin birim ağırlıkları zaten yenen kısımdır: oran uygulanmaz, yalnızca
   * "derisini yemedim" / "derisiyle" tercihi (derili / derisiz besin) uygulanır.
   *
   * Oranlar = yenen kısım / brüt çiğ ağırlık (yaklaşık, ev mutfağına yuvarlanmış):
   *  - Bütün tavuk: USDA SR 05006 / 05011 (broiler, pişirmeye hazır karkas): kemik artığı %32 -> derili et 0,68;
   *    derisiz et 0,48 (artık %52 = %32 kemik + %12 deri + %8 ayrılabilir yağ).
   *  - Tavuk parçaları: FAO "Food Composition Table for Use in East Asia" (1972) kemik/atık: göğüs %21, baget %40,
   *    kalça %25, kanat %51; deri payları USDA SR parça kayıtlarından (göğüs ~%9, baget ~%10, kalça ~%13, kanat ~%16).
   *  - Hindi: USDA SR hindi parçalarına göre yaklaşık (tavuğa benzer, kemik payı biraz düşük).
   *  - Kuzu / dana: USDA SR perakende kesim artıkları (pirzola ~%25, kaburga %30-40, incik %30-40 kemik; ayrılabilir
   *    yağ da ayıklanınca yalnız yağsız et) ve FAO (koyun eti: kemik + kesilen yağ atığı %22-31).
   *  - Bütün balık (temizlenmemiş): FAO balık işleme verimleri; kafa, iç, kılçık, yüzgeç çıkınca yenen et tipik olarak
   *    %40-60 (yassı balıklarda düşük, hamsi / sardalyada yüksek).
   */
  // b: yalnız kemik çıkar (deri / yağ yenir) · s: kemik + deri çıkar (kanatlı) · y: kemik + yağ çıkar (kırmızı et)
  // on / off: yenen kısım hangi besinle kaydedilir (deri ya da yağ yendi / yenmedi)
  var YIELD = {
    'tavuk-butun': { k: 'kanatli', label: 'bütün tavuk', b: 0.68, s: 0.48, on: 'tavuk-eti-derili', off: 'tavuk-eti-derisiz', whole: 1, unitG: 1300 },
    'tavuk-gogus': { k: 'kanatli', label: 'kemikli tavuk göğsü', short: 'tavuk göğsü', b: 0.79, s: 0.70, on: 'tavuk-gogsu-derili', off: 'tavuk-gogsu' },
    'tavuk-but': { k: 'kanatli', label: 'kemikli tavuk but', short: 'tavuk but', b: 0.70, s: 0.58, on: 'tavuk-but', off: 'tavuk-but-derisiz' },
    'tavuk-baget': { k: 'kanatli', label: 'kemikli tavuk baget', short: 'tavuk baget', b: 0.60, s: 0.50, on: 'tavuk-but', off: 'tavuk-baget' },
    'tavuk-kalca': { k: 'kanatli', label: 'kemikli tavuk kalça', short: 'tavuk kalça', b: 0.75, s: 0.62, on: 'tavuk-but', off: 'tavuk-kalca' },
    'tavuk-kanat': { k: 'kanatli', label: 'tavuk kanat', b: 0.49, s: 0.33, on: 'tavuk-kanat', off: 'tavuk-eti-derisiz' },
    'hindi-butun': { k: 'kanatli', label: 'bütün hindi', b: 0.70, s: 0.55, on: 'hindi-eti-derili', off: 'y-hindi-but', whole: 1, unitG: 5000 },
    'hindi-gogus': { k: 'kanatli', label: 'kemikli hindi göğsü', short: 'hindi göğsü', b: 0.82, s: 0.74, on: 'hindi-eti-derili', off: 'hindi-gogus' },
    'hindi-but': { k: 'kanatli', label: 'kemikli hindi but', short: 'hindi but', b: 0.70, s: 0.60, on: 'hindi-eti-derili', off: 'y-hindi-but' },
    'hindi-kanat': { k: 'kanatli', label: 'hindi kanat', b: 0.52, s: 0.38, on: 'hindi-eti-derili', off: 'y-hindi-but' },
    'kuzu-pirzola': { k: 'kirmizi', label: 'kemikli kuzu pirzola', short: 'kuzu pirzola', b: 0.75, y: 0.55, on: 'kuzu-pirzola', off: 'kuzu-eti-yagsiz' },
    'kuzu-kaburga': { k: 'kirmizi', label: 'kuzu kaburga', b: 0.68, y: 0.45, on: 'kuzu-kaburga', off: 'kuzu-eti-yagsiz' },
    'kuzu-incik': { k: 'kirmizi', label: 'kuzu incik', b: 0.60, y: 0.52, on: 'kuzu-eti', off: 'kuzu-eti-yagsiz' },
    'kuzu-but': { k: 'kirmizi', label: 'kemikli kuzu but', short: 'kuzu but', b: 0.80, y: 0.68, on: 'y-kuzu-but', off: 'kuzu-eti-yagsiz' },
    'kuzu-kemikli': { k: 'kirmizi', label: 'kemikli kuzu eti', short: 'kuzu eti', b: 0.72, y: 0.58, on: 'kuzu-eti', off: 'kuzu-eti-yagsiz' },
    'dana-pirzola': { k: 'kirmizi', label: 'kemikli dana pirzola', short: 'dana pirzola', b: 0.82, y: 0.70, on: 'dana-pirzola', off: 'y-dana-but' },
    'dana-kaburga': { k: 'kirmizi', label: 'dana kaburga', b: 0.58, y: 0.45, on: 'dana-kaburga', off: 'y-dana-but' },
    'dana-incik': { k: 'kirmizi', label: 'dana incik', b: 0.68, y: 0.62, on: 'dana-kusbasi', off: 'y-dana-but' },
    'dana-kemikli': { k: 'kirmizi', label: 'kemikli dana eti', short: 'dana eti', b: 0.78, y: 0.66, on: 'dana-kusbasi', off: 'y-dana-but' }
  };
  // bütün balık: [deri yenir, deri de çıkar, ad] (kafa, iç ve kılçık her durumda çıkar)
  var FISH_YIELD = {
    'cipura': [0.50, 0.45, 'çipura'], 'levrek': [0.50, 0.45, 'levrek'], 'hamsi-tava': [0.62, 0.58, 'hamsi'], 'hamsi-bugulama': [0.62, 0.58, 'hamsi'],
    'sardalya': [0.60, 0.55, 'sardalya'], 'alabalik': [0.55, 0.50, 'alabalık'], 'uskumru': [0.58, 0.53, 'uskumru'], 'lufer': [0.55, 0.50, 'lüfer'],
    'istavrit': [0.52, 0.48, 'istavrit'], 'mezgit': [0.50, 0.45, 'mezgit'], 'kalkan': [0.40, 0.36, 'kalkan'], 'somon': [0.62, 0.57, 'somon'],
    'y-barbun': [0.50, 0.45, 'barbun'], 'y-mercan': [0.45, 0.41, 'mercan'], 'y-kefal': [0.55, 0.50, 'kefal'], 'y-dil-baligi': [0.45, 0.41, 'dil balığı'],
    'y-sazan': [0.45, 0.41, 'sazan'], 'y-balik-izgara': [0.50, 0.45, 'balık'], 'y-balik-tava': [0.50, 0.45, 'balık']
  };
  // yalnızca bu besinler (çiğ/pişmiş et, parça) brüt ağırlıktan hesaplanır; döner, sote, köfte vb. hazır yemekler değil.
  // "tavuk pirzola" kemiksiz bir üründür ("kemikli tavuk pirzola" ayrı bir kayıt): kapsam dışı.
  var YIELD_FAMILY = {};
  ('tavuk-gogsu tavuk-gogsu-haslanmis tavuk-gogsu-derili tavuk-but tavuk-but-derisiz tavuk-kanat tavuk-kanat-izgara tavuk-baget tavuk-kalca ' +
    'tavuk-incik tavuk-haslama firin-pilic tavuk-eti-derisiz tavuk-eti-derili').split(' ').forEach(function (id) { YIELD_FAMILY[id] = 'tavuk'; });
  'hindi-gogus y-hindi-but hindi-eti-derili'.split(' ').forEach(function (id) { YIELD_FAMILY[id] = 'hindi'; });
  'kuzu-pirzola kuzu-eti kuzu-eti-yagsiz y-kuzu-but kuzu-kaburga c-kuzu-incik'.split(' ').forEach(function (id) { YIELD_FAMILY[id] = 'kuzu'; });
  'dana-pirzola dana-kaburga y-dana-incik dana-kusbasi dana-biftek y-dana-but'.split(' ').forEach(function (id) { YIELD_FAMILY[id] = 'dana'; });

  // "kemiğini ... yemedim / ayıkladım / çıkardım / attım / hariç"
  var Y_REMOVE = /^(yeme(d|m|y|z|den)|yemiyor|yenme|at(t|d)i|atip|atarak|atil|ayikla|cikar|ayir|birak|siyir|soy(d|u|a)|temizle|haric|disinda|olmadan|sayma)/;
  // "derisini de yedim"
  var Y_EAT = /^(yedim|yedik|yedi|yiyorum|yiyoruz|yerim|yemistim|yemisim|yenildi|yendi)$/;
  // "bütün / tüm" + bütün hayvan adı
  var Y_WHOLE_WORD = /^(tavu|pilic|hindi|cipura|levrek|hamsi|sardalya|alabalik|uskumru|lufer|palamut|cinekop|istavrit|mezgit|kalkan|barbun|mercan|kefal|sazan|somon|balik)/;
  // "tavuk derisi", "zeytin yağı": besin adının parçası, ayıklanan parça değil
  var Y_OWNER = /^(tavu|pilic|hindi|balik|kuzu|dana|et|zeytin|tere|aycicek|misir|findik|susam|kanola|palm|kuyruk|sivi|bitkisel|hindistan|ordek|kaz)/;

  /** i konumunda ayıklanan parça sözcüğü: kemik / kılçık / deri / yağ / kafa -> {kind, len, w (…-iyle), acc (belirtme hâli)} */
  function yPart(toks, i) {
    var t = toks[i];
    if (!t || t.f === ',') return null;
    var f = t.f, prev = toks[i - 1] && toks[i - 1].f, kind = null, len = 1;
    if (/^kemi(k|g)/.test(f)) { if (/^kemik(li|siz|lik)/.test(f)) return null; kind = 'bone'; }
    else if (/^kilci(k|g)/.test(f)) { if (/^kilcik(li|siz)/.test(f)) return null; kind = 'bone'; }
    else if (/^deri(si|leri)?(ni|nden|ne|yi|yle|yla|ile)?$/.test(f)) kind = 'skin';
    else if (/^yag(i|lari)(ni|ndan|yla)?$/.test(f)) kind = 'fat';
    else if (f === 'yagli' && toks[i + 1] && /^(kism|kisim|yer|taraf|parca)/.test(toks[i + 1].f)) { kind = 'fat'; len = 2; f = toks[i + 1].f; }
    else if (/^kafa(si|lari)?(ni|yla)?$/.test(f)) kind = 'head';
    if (!kind) return null;
    var w = /(yla|yle|ile)$/.test(f), acc = /(ni|nu|yi|yu|nden|ndan)$/.test(f);
    // iyelikli yalın hâl ("tavuk derisi", "zeytin yağı") besin adının parçasıdır
    if (!w && !acc && prev && Y_OWNER.test(prev)) return null;
    return { kind: kind, len: len, w: w, acc: acc };
  }

  /**
   * Cümledeki brüt / ayıklama ifadelerini bulur. Ayıklama cümleleri ("kemiğini ve derisini yemedim") metinden çıkarılır
   * (ayrı besin sanılmasınlar); "kemikli", "bütün", "kiloluk" yerinde kalır, yalnızca işaret olarak okunur.
   * -> null | {marks:[{pos, gross|whole|wholeHint|clean|cooked|boneOff|skinOff|fatOff|headOff|skinOn|fatOn}], removed, toks, text}
   */
  function yieldScan(toks) {
    var keep = [], marks = [], removed = false;
    function mark(fl, pos) { fl.pos = pos == null ? keep.length : pos; marks.push(fl); }
    for (var i = 0; i < toks.length;) {
      var t = toks[i], f = t.f;
      if (yPart(toks, i)) {
        var j = i, parts = [], withs = 0, accs = 0;
        for (;;) {
          if (toks[j] && toks[j].f === 'hem') j++;
          var q = yPart(toks, j);
          if (!q) break;
          parts.push(q); if (q.w) withs++; if (q.acc) accs++;
          j += q.len;
          var c = toks[j];
          if (c && /^(ve|ile|veya|,|hem)$/.test(c.f) && yPart(toks, j + 1 + (toks[j + 1] && toks[j + 1].f === 'hem' ? 1 : 0))) { j++; continue; }
          if (c && /^(de|da)$/.test(c.f) && yPart(toks, j + 1)) { j++; continue; }   // "derisini de kemiğini de yemedim"
          break;
        }
        var fl = null;
        if (parts.length && withs === parts.length) {
          // "kemiğiyle 1 kilo", "derisiyle (birlikte) yedim"
          fl = {};
          parts.forEach(function (p) { if (p.kind === 'skin') fl.skinOn = 1; else if (p.kind === 'fat') fl.fatOn = 1; else fl.gross = 1; });
          if (toks[j] && /^(birlikte|beraber)$/.test(toks[j].f)) j++;
        } else if (parts.length && !withs) {
          var k = j, de = false;
          if (toks[k] && /^(de|da)$/.test(toks[k].f)) { de = true; k++; }
          if (toks[k] && toks[k].f === 'hic') k++;
          var v = toks[k] && toks[k].f;
          if (v && /^dahil/.test(v)) {
            fl = {};
            parts.forEach(function (p) { if (p.kind === 'skin') fl.skinOn = 1; else if (p.kind === 'fat') fl.fatOn = 1; else fl.gross = 1; });
          } else if (v && Y_REMOVE.test(v)) {
            fl = {};
            parts.forEach(function (p) { fl[p.kind + 'Off'] = 1; });
          } else if (v && Y_EAT.test(v) && (de || accs === parts.length)) {
            fl = {};
            parts.forEach(function (p) { if (p.kind === 'skin') fl.skinOn = 1; else if (p.kind === 'fat') fl.fatOn = 1; });
          }
          if (fl) j = k + 1;
        }
        if (fl) {
          // "tavuğun derisini yemedim": iyelik sözcüğü önceki besinin tekrarıdır, o da çıkar
          var pv = keep[keep.length - 1];
          if (pv && /(nin|nun|in|un)$/.test(pv.f) && pv.f.length >= 5 && keep.slice(0, -1).some(function (x) { return x.f.slice(0, 4) === pv.f.slice(0, 4); })) keep.pop();
          mark(fl); removed = true; i = j;
          continue;
        }
      }
      // "1,5 kg brüt tavuk", "brüt 1 kilo kuzu" (ama "köpüklü şarap brüt" değil)
      if (f === 'brut' && ((keep.length && /^(\d+(\.\d+)?|kg|kilo|kiloluk|gram|gr|g|gramlik)$/.test(keep[keep.length - 1].f)) ||
          (toks[i + 1] && (/^(\d|agirlik)/.test(toks[i + 1].f) || isNumWord(toks[i + 1].f) || Y_WHOLE_WORD.test(toks[i + 1].f) || /^(kuzu|dana|et|pirzola|kaburga|incik)/.test(toks[i + 1].f))))) {
        mark({ gross: 1 }); removed = true; i++;
        if (toks[i] && /^agirlik/.test(toks[i].f)) i++;
        continue;
      }
      if (/^temizlenmemis/.test(f)) { mark({ gross: 1 }); removed = true; i++; continue; }
      if (/^temizle(dim|dik|yip|yerek|nince|ndikten|yince|nip|ndi)$/.test(f)) { mark({ clean: 1 }); removed = true; i++; continue; }
      if (f === 'pismis' && toks[i + 1] && /^(agirlig|agirlik|hali|haliyle|tartim)/.test(toks[i + 1].f)) {
        mark({ cooked: 1 }); keep.push(t); i += 2; removed = true;
        continue;
      }
      if ((f === 'butun' || f === 'tum') && toks[i + 1] && Y_WHOLE_WORD.test((toks[i + 1].f === 'bir' && toks[i + 2] ? toks[i + 2] : toks[i + 1]).f)) {
        mark({ whole: 1, gross: 1 });
        // "bütün bir tavuk": "bütün" miktardan önce kalınca ayrı bir sözcük sanılır, çıkar
        if (toks[i + 1].f === 'bir') { removed = true; i++; continue; }
      }
      else if (f === 'kemikli' || f === 'kilcikli') mark({ gross: 1 });
      else if (f === 'kiloluk' || f === 'gramlik') mark({ wholeHint: 1 });
      keep.push(t); i++;
    }
    if (!marks.length) return null;
    return { marks: marks, removed: removed, toks: keep, text: keep.map(function (x) { return x.r; }).join(' ') };
  }

  /** Kalemin brüt hesap profili: {row, fish, key} ya da null */
  function yieldProfile(it) {
    var id = it.foodId, w = ' ' + foldTokens(it.raw || '').join(' ') + ' ';
    if (FISH_YIELD[id]) {
      var fy = FISH_YIELD[id].slice();
      if (/ (palamut|cinekop|kofana)/.test(w)) fy[2] = / palamut/.test(w) ? 'palamut' : 'çinekop';
      return { key: 'fish', fish: fy, w: w };
    }
    var fam = YIELD_FAMILY[id];
    if (!fam) return null;
    if (fam === 'tavuk' && / hindi/.test(w)) fam = 'hindi';
    var part;
    if (fam === 'tavuk' || fam === 'hindi') {
      part = /gog(u|s)/.test(w) ? 'gogus' : /(baget|incik)/.test(w) ? 'baget' : /kalca/.test(w) ? 'kalca' : /kana(t|d)/.test(w) ? 'kanat'
        : / but(u|lar|lari)? /.test(w) ? 'but' : 'butun';
      if (fam === 'hindi' && (part === 'baget' || part === 'kalca')) part = 'but';
    } else {
      if (fam === 'kuzu' && / (dana|sigir|biftek)/.test(w)) fam = 'dana';
      else if (fam === 'dana' && / kuzu/.test(w)) fam = 'kuzu';
      part = /pirzola/.test(w) ? 'pirzola' : /kaburga/.test(w) ? 'kaburga' : /incik/.test(w) ? 'incik'
        : fam === 'kuzu' && / but(u)? /.test(w) ? 'but' : 'kemikli';
    }
    var key = fam + '-' + part;
    return YIELD[key] ? { key: key, row: YIELD[key], w: w } : null;
  }

  function fmtDec(x) { return String(Math.round(x * 100) / 100).replace('.', ','); }
  function fmtMass(g) { return g >= 1000 ? fmtDec(g / 1000) + ' kg' : Math.round(g) + ' g'; }
  function joinTr(list) { return list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' ve ' + list[list.length - 1]; }

  /** Tek kaleme brüt -> net hesabını uygular; değişiklik yoksa null */
  function yieldItem(it, prof, fl, idx) {
    var row = prof.row, fish = prof.fish, w = prof.w;
    var poultry = !!(row && row.k === 'kanatli'), whole = !!(fish || (row && row.whole));
    var mass = it.unit === 'g' || it.unit === 'ml';
    var boneCtx = !!(fl.gross || fl.boneOff || fl.headOff || fl.clean || (fl.wholeHint && whole));
    var stripStated = !!(row && !poultry ? fl.fatOff : fl.skinOff);
    var strip;
    if (row && !poultry) strip = !fl.fatOn && !!(fl.fatOff || fl.clean || / yagsiz /.test(w));
    else strip = !fl.skinOn && !!(fl.skinOff || (fl.clean && poultry) || / derisiz /.test(w));
    var ratio = 1;
    if (boneCtx) ratio = fish ? (strip ? fish[1] : fish[0]) : (strip ? (poultry ? row.s : row.y) : row.b);
    else if (stripStated) ratio = fish ? fish[1] / fish[0] : (poultry ? row.s : row.y) / row.b;
    // ne kemik bağlamı ne de deri/yağ cümlesi var ("500 gramlık tavuk göğsü"): dokunma
    if (!boneCtx && !stripStated && !fl.skinOn && !fl.fatOn) return null;
    var target = fish ? idx.byId[it.foodId] : idx.byId[strip ? row.off : row.on];
    if (!target) return null;

    // adet / porsiyon: birim ağırlığı zaten yenen kısım; yalnızca derili / derisiz (yağlı / yağsız) tercihi
    var gross, assumed = false;
    if (!mass) {
      if (boneCtx && whole && row && fl.whole && (fl.boneOff || fl.skinOff || fl.clean || fl.headOff)) {
        gross = (it.qty > 0 ? it.qty : 1) * row.unitG; assumed = true;
      } else {
        if (fish || target.id === it.foodId) return null;
        if (!(fl.skinOff || fl.skinOn || fl.fatOff || fl.fatOn || fl.clean)) return null;
        var tu = foodUnits(target);
        if (!tu[it.unit]) return null;
        var sw = computeItem(target, it.qty, it.unit, tu[it.unit], { state: it.state, scale: it.scale });
        sw.confidence = it.confidence; sw.raw = it.raw;
        sw.yieldNote = poultry ? (strip ? 'Deri yenmedi: derisiz değerler' : 'Derisiyle yendi: derili değerler') : (strip ? 'Yağı ayıklandı: yağsız değerler' : 'Yağıyla yendi');
        return sw;
      }
    } else gross = it.grams;
    if (ratio === 1 && target.id === it.foodId) return null;
    if (!(gross > 0)) return null;

    var cooked = !!fl.cooked || / pismis /.test(w);
    var net = ratio === 1 ? gross : Math.max(5, Math.round(gross * ratio / 5) * 5);
    var state = hasStates(target) ? (ratio === 1 ? it.state : (cooked ? 'cooked' : 'raw')) : null;
    var out = computeItem(target, net, 'g', 1, { state: state });
    out.raw = it.raw;
    out.confidence = it.confidence;
    if (target.id === it.foodId && it.note) { out.note = it.note; if (it.suggestions) out.suggestions = it.suggestions; }
    // "bütün" kelimesi tanınmadığı için düşen güven geri gelir
    if (it.note && /^“(bütün|butun|tüm|tum)” kelimesini tanımadım/.test(it.note)) {
      delete out.note; delete out.suggestions;
      out.confidence = Math.min(1, Math.round(it.confidence / 0.75 * 100) / 100);
    }
    if (ratio === 1) {
      out.yieldNote = poultry ? (strip ? 'Deri yenmedi: derisiz değerler' : 'Derisiyle yendi: derili değerler') : (strip ? 'Yağı ayıklandı: yağsız değerler' : 'Yağıyla yendi');
      return out;
    }
    var removed = [], kept = '';
    if (boneCtx) {
      if (fish) { removed.push('kılçık', 'kafa'); if (strip) removed.push('deri'); }
      else {
        removed.push('kemik');
        if (strip) removed.push(poultry ? 'deri' : 'yağ'); else kept = poultry ? 'deri dahil' : 'yağ dahil';
      }
    } else removed.push(fish || poultry ? 'deri' : 'yağ');
    var label = fish ? (boneCtx ? 'bütün ' + fish[2] : fish[2]) : (boneCtx ? row.label : (row.short || row.label));
    var from = assumed ? fmtDec(it.qty > 0 ? it.qty : 1) + ' ' + label + ' (ort. ' + fmtMass(row.unitG) + ' varsaydım)' : fmtMass(gross) + ' ' + label;
    out.yield = { gross: Math.round(gross), net: net, ratio: Math.round(ratio * 100) / 100, removed: removed, from: label, basis: state === 'cooked' || (!state && cooked) ? 'cooked' : 'raw', assumed: assumed };
    out.yieldNote = from + ' → ≈ ' + net + ' g net et (' + joinTr(removed) + ' çıkarıldı' + (kept ? '; ' + kept : '') + ')' + (cooked ? ', pişmiş ağırlık' : '');
    // kayıt listesinde gösterilecek kısa not ("720 g · brüt 1,5 kg bütün tavuk")
    out.yieldShort = assumed ? fmtDec(it.qty > 0 ? it.qty : 1) + ' ' + label + ' (ort. ' + fmtMass(row.unitG) + ')' : 'brüt ' + fmtMass(gross) + ' ' + label;
    if (assumed) out.confidence = Math.min(out.confidence, 0.75);
    return out;
  }

  /** Ayrıştırılmış kalemlere işaretleri dağıtır ve brüt -> net hesabını uygular */
  function applyYield(res, ys, idx) {
    var items = res.items;
    if (!items.length) return;
    // kalemlerin cümledeki başlangıç konumları (raw'ın ilk sözcüğü, sırayla)
    var starts = [], cur = 0;
    items.forEach(function (it) {
      var first = String(it.raw || '').split(' ')[0], pos = -1;
      for (var k = cur; k < ys.toks.length; k++) if (ys.toks[k].r === first) { pos = k; break; }
      if (pos < 0) pos = cur; else cur = pos + 1;
      starts.push(pos);
    });
    var prof = items.map(yieldProfile), flags = items.map(function () { return null; });
    ys.marks.forEach(function (m) {
      // işaret, kendinden önce başlayan son uygun kaleme; yoksa sonraki ilk uygun kaleme aittir
      var best = -1, k;
      for (k = 0; k < items.length; k++) if (prof[k] && starts[k] <= m.pos) best = k;
      if (best < 0) for (k = 0; k < items.length; k++) if (prof[k]) { best = k; break; }
      if (best < 0) return;
      var fl = flags[best] || (flags[best] = {});
      for (var key in m) if (key !== 'pos') fl[key] = 1;
    });
    items.forEach(function (it, k) {
      if (!flags[k]) return;
      var n = yieldItem(it, prof[k], flags[k], idx);
      if (n) items[k] = n;
    });
  }

  /**
   * Ana giriş: brüt / ayıklama ifadesi yoksa parseCore ile birebir aynıdır.
   */
  function parse(text, foods, opts) {
    var ys = yieldScan(tokenize(text));
    if (!ys) return parseCore(text, foods, opts);
    var res = parseCore(ys.removed ? ys.text : text, foods, opts);
    res.text = String(text || '');
    applyYield(res, ys, buildIndex(foods || []));
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* Ana ayrıştırıcı                                                     */
  /* ------------------------------------------------------------------ */
  var FUZZY_ACCEPT = 0.72;

  function parseCore(text, foods, opts) {
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
    var wordCache = new Map();
    var qtyPrev = null;   // miktardan hemen önceki kalem ("güllüoğlu | iki dilim | baklava")

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
      // hâller: yaş / kuru / çiğ / kavrulmuş / tuzlu ... (hiçbiri sessizce düşmez)
      var stMods = ml.filter(function (m) { return m.info.st; });
      if (stMods.length) {
        // 1) besin bu hâli zaten taşımıyorsa önce o hâli taşıyan çeşit tercih edilir (nötr hâller dahil: "tuzlu badem")
        var openM = stMods.filter(function (m) { return !stateCarried(idx, res.food, ent, m.info.st); });
        var clsOf = function (list) { var o = []; list.forEach(function (m) { if (o.indexOf(m.info.st) < 0) o.push(m.info.st); }); return o; };
        var sv = null;
        if (openM.length) {
          sv = findStateVariant(idx, res.food, ent, clsOf(openM));
          if (!sv && res.food !== food) sv = findStateVariant(idx, food, entry, clsOf(openM));
        }
        if (sv) { res.food = sv.food; ent = sv.entry; openM = []; }
        // 2) çeşit yoksa: besin değerini değiştirmeyenler kabul, değiştirenler için hâlleri taşıyan çeşit ya da not
        var needM = openM.filter(function (m) { return !stateSatisfied(idx, res.food, ent, m.info.st); });
        if (needM.length) {
          var need = clsOf(needM);
          sv = needM.length < openM.length ? findStateVariant(idx, res.food, ent, need) : null;
          if (!sv && needM.length < openM.length && res.food !== food) sv = findStateVariant(idx, food, entry, need);
          if (sv) { res.food = sv.food; ent = sv.entry; }
          else {
            res.conf = Math.min(res.conf, 0.65);
            res.noState = need;
            res.missWords = (res.missWords || []).concat(needM.map(function (m) { return m.toks.map(function (t) { return t.r; }).join(' '); }));
            res.stateSug = stateSuggestions(idx, res.food, ent, need);
          }
        }
      }
      if (res.noVariant) {
        var vw = ml.filter(function (m) { return m.info.variant && res.noVariant.indexOf(m.info.variant) >= 0; })
          .map(function (m) { return m.toks.map(function (t) { return t.r; }).join(' '); });
        res.missWords = vw.concat(res.missWords || []);
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
      if (res && res.noState) {
        // istenen hâl (yaş, tuzsuz, kavrulmuş ...) listede yok: temel besin + not + öneriler
        it.stateMissing = res.noState.slice();
        var sg = (res.stateSug || []).slice(), have = new Set(sg.map(function (x) { return x.id; }).concat([food.id]));
        (it.suggestions || variantSuggestions(idx, food, rawToks, boost)).forEach(function (x) { if (sg.length < 3 && !have.has(x.id)) { have.add(x.id); sg.push(x); } });
        it.suggestions = sg;
      }
      if (res && res.missWords && res.missWords.length) {
        it.note = '“' + res.missWords.join(', ') + '” ' + (res.noState ? 'hâli' : 'çeşidi') + ' listede yok, en yakın: ' + it.name;
      }
      return it;
    }

    /** marka sözcükleri (bs) + ürün sözcükleri (ws): hepsini (ürünün başını mutlaka) içeren en kısa alias */
    function brandRefine(bs, ws) {
      var tri = ensureVocab(idx), sets = null;
      function hits(w) {
        var h = new Set(), list = tri.vocab.get(w) || [];
        list.forEach(function (x) { h.add(x); });
        if (w.length >= 4) tri.vocabList.forEach(function (v) { if (v !== w && v.length >= 3 && tokenScore(w, v) > 0) (tri.vocab.get(v) || []).forEach(function (x) { h.add(x); }); });
        return h;
      }
      bs.forEach(function (w) { var h = hits(w); sets = sets ? new Set([...sets].filter(function (x) { return h.has(x); })) : h; });
      if (!sets || !sets.size) return null;
      var head = hits(ws[ws.length - 1]), best = null;
      sets.forEach(function (x) {
        if (!head.has(x)) return;
        var e = idx.entries[x], matched = 0;
        ws.forEach(function (w) { if (e.toks.some(function (t) { return t === w || (w.length >= 3 && tokenScore(w, t) > 0); })) matched++; });
        var extra = e.toks.length - bs.length - matched;
        var sc = matched * 2 - Math.max(0, extra) * 0.5 + (e.primary ? 0.1 : 0);
        if (!best || sc > best.sc || (sc === best.sc && e.order < best.e.order)) best = { e: e, sc: sc, matched: matched };
      });
      if (!best) return null;
      return { food: best.e.food, entry: best.e, str: best.e.str, toks: best.e.toks, score: best.matched === ws.length ? 0.95 : 0.8, cls: best.e.cls, st: best.e.st, stBase: best.e.stBase, primary: best.e.primary, order: best.e.order };
    }

    /** f besininin ad/alias/kategori sözcükleri (marka + tür sözcüğü yutmak için) */
    function foodWords(f) {
      var c = wordCache.get(f);
      if (c) return c;
      c = Object.create(null);
      (idx.foodEntries.get(f) || []).forEach(function (e) { e.toks.forEach(function (t) { c[t] = 1; }); });
      foldTokens(f.cat || '').forEach(function (t) { c[t] = 1; });
      wordCache.set(f, c);
      return c;
    }
    function coveredBy(rawToks, f) {
      var w = foodWords(f);
      return rawToks.length > 0 && rawToks.every(function (t) {
        if (w[t.f]) return true;
        for (var k in w) if (k.length >= 3 && tokenScore(t.f, k) > 0) return true;
        return false;
      });
    }

    function pushItem(food, rawToks, conf, entry) {
      if (!last && qtyPrev && pending && !qtyPrev.q && !mods.length && !unknown.length && items.indexOf(qtyPrev.item) >= 0 &&
          rawToks.length <= 2 && (food === qtyPrev.food || coveredBy(rawToks, qtyPrev.food))) last = qtyPrev;
      qtyPrev = null;
      // "kfc sundae", "popeyes iki parça tavuk", "subway hindi sandviç": önceki kalem yalnızca marka/nitelik idiyse birleşik ürünü ara
      if (last && last.span && !mods.length && items[items.length - 1] === last.item && !last.q && !unknown.length && entry) {
        var bs = last.span.map(function (x) { return x.f; }), bstr = bs.join(' ');
        if (!idx.nameSet[bstr] && (idx.prefixCount[bstr] || 0) >= 3) {
          var ref = brandRefine(bs, rawToks.map(function (x) { return x.f; }));
          if (ref) {
            var keepQ = pending;
            items.pop();
            pending = keepQ;
            var lastSpan = last.span;
            last = null;
            pushItem(ref.food, lastSpan.concat(rawToks), Math.min(conf, ref.score), ref);
            return;
          }
        }
      }
      // "cappy meyve suyu", "magnum çikolata", "erikli su": aynı besin ya da onun tür sözcüğü ikinci kalem olmaz
      if (last && (!pending || !last.q) && !mods.length && items.indexOf(last.item) >= 0 && !unknown.length &&
          (food === last.food || food === last.baseFood || (rawToks.length <= 2 && coveredBy(rawToks, last.food)) ||
           (!pending && rawToks.length === 1 && SWALLOW_GENERIC[rawToks[0].f]))) {
        last.item.raw += ' ' + rawToks.map(function (t) { return t.r; }).join(' ');
        last.rawToks = last.rawToks.concat(rawToks);
        if (pending) applyTrailing();   // "güllüoğlu iki dilim baklava": miktar markalı kaleme
        return;
      }
      var q = pending, ml = mods;
      var res = resolveMods(food, entry, ml);
      var allRaw = (q ? q.raw : []).concat(modToks(ml), rawToks);
      var it = makeItem(res.food, q, allRaw, conf, res);
      items.push(it);
      last = { item: it, food: res.food, baseFood: food, entry: entry, mods: ml.slice(), res: res, rawToks: allRaw, conf: conf, q: q, span: rawToks };
      lastExplicit = !!q;
      pending = null;
      mods = [];
    }

    /** son kalem yeniden kurulduğunda tanınmayan kelime notunu korur */
    function keepUnk(it) {
      if (last && last.unk) {
        if (!it.note && last.unk.note) { it.note = last.unk.note; if (!it.suggestions) it.suggestions = last.unk.suggestions; }
        if (last.unk.conf != null) it.confidence = Math.min(it.confidence, last.unk.conf);
      }
      return it;
    }

    /** Besinden sonra gelen niteleyiciyi ("tavuk göğsü çiğ") son kaleme uygular. */
    function modifyLast(newMods) {
      var ml = last.mods.concat(newMods);
      var res = resolveMods(last.baseFood, last.entry, ml);
      var allRaw = last.rawToks.concat(modToks(newMods));
      var it = keepUnk(makeItem(res.food, last.q, allRaw, last.conf, res));
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
        var possessive = unknown.length <= 2 && unknown.every(function (t) { return /(i|u|si|su|leri|lari)$/.test(t.f) && t.f.length >= 3; });
        if (possessive) {
          last.item.raw += ' ' + unknown.map(function (t) { return t.r; }).join(' ');
          last.item.confidence = Math.round(last.item.confidence * 0.8 * 100) / 100;
          unknown = [];
          return;
        }
        // besinden sonra gelen tanınmayan sözcük ("ruffles orijinal", "protein tozu ölçek") ayrı besin değil: not + düşük güven
        var fzA = fuzzyFind(text, idx, boost);
        if (!fzA || fzA.score < 0.86) {
          var uw = unknown.map(function (t) { return t.r; }).join(' ');
          last.item.raw += ' ' + uw;
          last.rawToks = last.rawToks.concat(unknown);
          last.item.confidence = Math.min(last.item.confidence, 0.75);
          if (!last.item.note) last.item.note = '“' + uw + '” kelimesini tanımadım, en yakın: ' + last.item.name;
          last.unk = { note: last.item.note, suggestions: last.item.suggestions, conf: 0.75 };
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

    /** niteleyici; "iç", "köy", "ham" yalnızca ardından besin gelirse ("iç fındık", "köy yumurtası") */
    function descAt(k) {
      var d = readDesc(toks, k);
      if (d && d.len === 1 && STATE_GATED[d.key] && !matchFoodAt(toks, k + 1, idx, boost)) return null;
      if (!d) d = typoDesc(k);
      return d;
    }
    /** yazım hatalı niteleyici ("kruu", "tazee", "kavrulmş"): tanınmayan sözcük bir niteleyiciye tek harf uzaklıktaysa */
    function typoDesc(k) {
      var t = toks[k];
      if (!t || t.f.length < 4 || /\d/.test(t.f) || FILLERS[t.f] || matchFoodAt(toks, k, idx, boost)) return null;
      var nx = toks[k + 1];
      if (!nx || isSepAt(toks, k + 1) || !matchFoodAt(toks, k + 1, idx, boost)) return null;   // yalnızca bir besinden önce
      var bestK = null;
      for (var key in DESC) {
        if (key.length < 4 || Math.abs(key.length - t.f.length) > 1) continue;
        if (levenshtein(t.f, key) <= 1) { bestK = key; break; }
      }
      return bestK ? { len: 1, key: bestK, info: DESC[bestK], toks: [t] } : null;
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

      if (t.f === 'az' && toks[i + 1] && /^(once|evvel)$/.test(toks[i + 1].f)) { i += 2; continue; } // "az önce"

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
      if (sep && t.f === 've' && i === modEnd && descAt(i + 1)) { i++; continue; } // "kemiksiz ve derisiz tavuk pirzola"
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
        qtyPrev = null;
        i += sep;
        continue;
      }

      // sayıyla başlayan ürün adı: "2 şekerli çay", "duble rakı", "yarım ekmek döner", "100 portakal suyu"
      if (parseQuantity(toks, i) || /^(cift|tek|duble)$/.test(t.f)) {
        var nmf = matchFoodAt(toks, i, idx, boost, true);
        var nq = parseQuantity(toks, i);
        if (nmf && nmf.len >= 2 && !parseUnit(toks, i + nmf.len - 1, true) && !(nq && parseUnit(toks, i + nq.len, true))) {
          var nspan = toks.slice(i, i + nmf.len);
          flushUnknown(false);
          pushItem(nmf.food, nspan, nmf.score, nmf.entry);
          i += nmf.len;
          continue;
        }
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
      if (q && !q.fracWord && toks[i + q.len] && /l(i|u)$/.test(toks[i + q.len].f) && !parseUnit(toks, i + q.len, true)) {
        var mA = matchFoodAt(toks, i + q.len, idx, boost), mB = matchFoodAt(toks, i + q.len + 1, idx, boost);
        if (mB && (!mA || (mA.food === mB.food && mA.len === mB.len + 1))) {
          i += q.len + (mA ? 0 : 1);   // "iki yumurtalı menemen" ("yumurtalı menemen" alias'ı varsa onu kullan)
          continue;
        }
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
        qtyPrev = last;
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
        // "kokoreç porsiyon", "pizza dilim": sondaki sayısız birim önceki kaleme aittir
        if (last && !lastExplicit && !unknown.length && onlyFillersUntilBoundary(i + u2.len)) {
          var lu = foodUnits(last.food);
          if (lu[u2.unit]) { pending = { qty: null, unit: u2.unit, raw: toks.slice(i, i + u2.len) }; applyTrailing(); }
          else { last.item.raw += ' ' + toks.slice(i, i + u2.len).map(function (x) { return x.r; }).join(' '); last.rawToks = last.rawToks.concat(toks.slice(i, i + u2.len)); }
          i += u2.len;
          continue;
        }
      }

      // niteleyici sözcükler (kemiksiz, çiğ, ızgara, büyük ...)
      var d0 = descAt(i);
      if (d0) {
        var fm0 = matchFoodAt(toks, i, idx, boost);
        var dl = [], dj = i, d1;
        while ((d1 = descAt(dj))) {
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
      // "kıymalı poğaça", "peynirli simit": -lı sıfatı (yalnızca ek atarak bir besine benziyor) ardından gelen besini niteler
      if (fm && fm.len === 1 && fm.score < 1 && /l(i|u)$/.test(t.f) && !isSepAt(toks, i + 1) && matchFoodAt(toks, i + 1, idx, boost)) fm = null;
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
            // tanınmayan niteleyici sessizce düşmez: düşük güven + not ("“lezzetli” kelimesini tanımadım")
            var modConf = fm.score * 0.75;
            var unkWords = unknown.map(function (x) { return x.r; }).join(' ');
            pushItem(fm.food, unknown.concat(span), modConf, fm.entry);
            if (!last.item.note) {
              last.item.note = '“' + unkWords + '” kelimesini tanımadım, en yakın: ' + last.item.name;
              if (!last.item.suggestions) last.item.suggestions = suggestFoods(unknown.map(function (x) { return x.f; }).concat(fm.entry.toks).join(' '), idx, boost, 4, 150)
                .filter(function (x) { return x.id !== last.item.foodId; }).slice(0, 3);
              last.unk = { note: last.item.note, suggestions: last.item.suggestions };
            }
          }
          unknown = [];
        } else {
                    pushItem(fm.food, span, fm.score, fm.entry);
          if ((GENERIC_WORDS[fm.entry.str]) && last && last.item.foodId === fm.food.id && !last.mods.length) {
            // "çorba", "sandviç", "kebap": hangisi olduğu belli değil -> sor
            var gw = span.map(function (x) { return x.r; }).join(' ');
            last.item.confidence = Math.min(last.item.confidence, 0.5);
            last.item.note = '“' + gw + '” çok genel, hangisi?';
            last.item.suggestions = searchFoods(gw, foods, { limit: 5 }).filter(function (f) { return f.id !== fm.food.id; }).slice(0, 4)
              .map(function (f) { return { id: f.id, name: f.name }; });
            last.unk = { note: last.item.note, suggestions: last.item.suggestions, conf: 0.5 };
          }
        }
        i += fm.len;
        continue;
      }
      // "dondurma mı yedim": soru eki -> emin değil
      if ((t.f === 'mi' || t.f === 'mu') && last && items.indexOf(last.item) >= 0 && toks[i - 1] && last.rawToks.indexOf(toks[i - 1]) >= 0) {
        last.item.confidence = Math.min(last.item.confidence, 0.6);
        last.unk = last.unk || { note: null, suggestions: null };
        last.unk.conf = 0.6;
        i++;
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
      var it = keepUnk(makeItem(last.food, q2, last.rawToks.concat(q2.raw), last.conf, last.res));
      items[items.indexOf(last.item)] = it;
      last.item = it;
      lastExplicit = true;
      pending = null;
    }

    // "big mac orta patates", "büyük boy patates", "zinger ve patates": boyla ya da fast food zinciriyle söylenen patates kızartmadır
    var potato = idx.byStr['patates'] && idx.byStr['patates'].food;
    if (potato) items.forEach(function (it, k) {
      if (it.foodId !== potato.id) return;
      var rt = tokenize(it.raw).map(function (x) { return x.f; });
      var sized = rt.some(function (w) { return w === 'boy' || w === 'orta' || w === 'buyuk' || w === 'kucuk'; });
      var ff = items.filter(function (o) { return o !== it && idx.byId[o.foodId] && idx.byId[o.foodId].cat === 'Fast Food'; })[0];
      if (!sized && !ff) return;
      if (rt.some(function (w) { return /^(cig|haslanmis|haslama|firinda|firin|kozde|kumpir)$/.test(w); })) return;
      var size = rt.indexOf('buyuk') >= 0 ? 'buyuk' : rt.indexOf('kucuk') >= 0 ? 'kucuk' : 'orta';
      var target = null;
      if (ff) {
        var bt = foldTokens(String(idx.byId[ff.foodId].name).replace(/\([^)]*\)/g, ' '))[0];
        if (bt && (idx.prefixCount[bt] || 0) >= 3) {
          var cand = idx.entries.filter(function (e) { return e.toks[0] === bt && e.toks.indexOf('patates') >= 0; });
          cand.sort(function (a, b) { return (b.toks.indexOf(size) >= 0) - (a.toks.indexOf(size) >= 0) || a.toks.length - b.toks.length; });
          if (cand[0]) target = cand[0].food;
        }
      }
      if (!target && idx.byStr['patates kizartmasi']) target = idx.byStr['patates kizartmasi'].food;
      if (!target) return;
      var r2 = resolveUnit(target, it.unit === 'g' || it.unit === 'ml' ? it.qty : (it.qty !== 1 ? it.qty : null), it.unit === 'g' || it.unit === 'ml' ? it.unit : null, false);
      var it2 = computeItem(target, r2.qty, r2.unit, r2.unitG, null);
      it2.confidence = Math.min(it.confidence, 0.9); it2.raw = it.raw;
      items[k] = it2;
    });

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
    version: '1.6.0',
    lower: lower, fold: fold, foldTokens: foldTokens, tokenize: tokenize, stems: stems,
    wordsToNumber: wordsToNumber, parseNumberText: parseNumberText,
    levenshtein: levenshtein, similarity: similarity,
    buildIndex: buildIndex, parse: parse, searchFoods: searchFoods, fuzzyFind: function (t, foods) { return fuzzyFind(foldTokens(t).join(' '), buildIndex(foods)); },
    hasStates: hasStates, baseState: baseState, stateValues: stateValues, itemName: itemName, suggestFoods: function (t, foods, n) { return suggestFoods(foldTokens(t).join(' '), buildIndex(foods), null, n || 3); },
    resolveUnit: resolveUnit, computeItem: computeItem, foodUnits: foodUnits, unitOptions: unitOptions,
    UNIT_LABELS: UNIT_LABELS, GENERIC_UNIT_G: GENERIC_UNIT_G
  };
});
