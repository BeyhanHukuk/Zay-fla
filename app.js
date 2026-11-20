/* Zayıfla — ana uygulama (vanilla JS, derleme gerektirmez) */
(function () {
  'use strict';

  var P = window.ZParser, C = window.ZCharts, N = window.ZNotify, NC = window.ZNotifyCore;
  var FOODS = Array.isArray(window.FOODS) ? window.FOODS : [];
  var APP_VERSION = '1.4.1';

  /* ======================================================================
     Yardımcılar
     ====================================================================== */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
  function todayKey() { return keyOf(new Date()); }
  function dayDiff(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 864e5); }
  function isValidKey(k) { return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(parseKey(k)); }
  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  var MONTHS_S = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  var DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  var DAYS_S = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  function fmtLong(k) { var d = parseKey(k); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + DAYS[d.getDay()]; }
  function fmtShort(k) { var d = parseKey(k); return d.getDate() + ' ' + MONTHS_S[d.getMonth()]; }
  function fmtDateY(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function fmt(v, dec) {
    if (v == null || !isFinite(v)) return '–';
    dec = dec == null ? 0 : dec;
    try { return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: dec, minimumFractionDigits: 0 }); }
    catch (e) { return String(Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).replace('.', ','); }
  }
  function fmtQty(q) { return fmt(q, q < 10 ? 2 : 1); }
  function parseNum(s) { if (typeof s === 'number') return s; var v = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : NaN; }
  function num(v, def) { v = Number(v); return isFinite(v) ? v : (def === undefined ? 0 : def); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* yok */ } }
  function round1(x) { return Math.round(x * 10) / 10; }

  var ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    scale: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7.5 10a4.5 4.5 0 0 1 9 0"/><path d="m12 10 1.6-2.2"/>',
    settings: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2 1.2-6.8-5-4.9 6.9-1z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5.5 12 3c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/>',
    trend: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    sparkle: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 17v4"/><path d="M17 19h4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01"/><path d="M12 12h.01"/><path d="M15.5 12h.01"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8"/><path d="m16 7 3 3"/><path d="m19 4 2 2"/>'
  };
  function icon(name, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; }

  var MEALS = [
    { id: 'kahvalti', label: 'Kahvaltı', emoji: '🌅' },
    { id: 'ogle', label: 'Öğle', emoji: '☀️' },
    { id: 'aksam', label: 'Akşam', emoji: '🌙' },
    { id: 'ara', label: 'Ara öğün', emoji: '🍎' }
  ];
  var MEAL_BY = {}; MEALS.forEach(function (m) { MEAL_BY[m.id] = m; });
  function guessMeal(d) {
    d = d || new Date();
    var m = d.getHours() * 60 + d.getMinutes();
    if (m >= 300 && m < 660) return 'kahvalti';
    if (m >= 660 && m < 900) return 'ogle';
    if (m >= 900 && m < 1050) return 'ara';
    if (m >= 1050 && m < 1320) return 'aksam';
    return 'ara';
  }

  var ACTIVITY = [
    { id: 'sedanter', label: 'Hareketsiz', desc: 'Masa başı iş, çok az yürüyüş', f: 1.2, emoji: '🪑' },
    { id: 'hafif', label: 'Az hareketli', desc: 'Haftada 1–3 gün hafif egzersiz', f: 1.375, emoji: '🚶' },
    { id: 'orta', label: 'Orta derecede aktif', desc: 'Haftada 3–5 gün egzersiz', f: 1.55, emoji: '🏃' },
    { id: 'aktif', label: 'Aktif', desc: 'Haftada 6–7 gün spor', f: 1.725, emoji: '🏋️' },
    { id: 'cokaktif', label: 'Çok aktif', desc: 'Ağır fiziksel iş ya da günde 2 antrenman', f: 1.9, emoji: '🔥' }
  ];
  var PACES = [
    { v: 0.25, label: 'Rahat', desc: 'Haftada 0,25 kg · sürdürmesi en kolay' },
    { v: 0.5, label: 'Önerilen', desc: 'Haftada 0,5 kg · dengeli ve güvenli' },
    { v: 0.75, label: 'Hızlı', desc: 'Haftada 0,75 kg · disiplin ister' },
    { v: 1, label: 'Çok hızlı', desc: 'Haftada 1 kg · zorlayıcı, kısa süreli' }
  ];
  var LB = 2.20462;

  /* ======================================================================
     Depolama (sürümlü şema, bozuk veriye dayanıklı)
     ====================================================================== */
  var STORE_KEY = 'zayifla.data';
  var SCHEMA = 2; // 2: elle kalori hedefi (manual)
  var MANUAL_MIN = 500, MANUAL_MAX = 6000;
  var LOW_KCAL_MSG = 'Bu hedef önerilen alt sınırın altında. Uzun süre çok düşük kalori kas kaybı ve halsizlik yapabilir; doktor/diyetisyen kontrolünde uygulaman önerilir.';
  var storageOK = true;
  var pendingNotice = null;

  function defaults() {
    return {
      v: SCHEMA, createdAt: Date.now(), profile: null, targets: null, manual: { on: false, kcal: null },
      settings: { theme: 'system', wUnit: 'kg', glassMl: 250, waterGoal: 8 },
      days: {}, weights: [], waists: [], custom: [], favs: [], recents: [], meals: [],
      reminders: NC ? NC.merge({}) : {}, remLog: {}, adaptive: { dismissedAt: 0 },
      ui: { installDismissed: false, wRange: '1A', calRange: 7 }
    };
  }

  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var kcal = num(e.kcal, NaN);
    if (!isFinite(kcal) || kcal < 0 || kcal > 20000) return null;
    var out = {
      id: String(e.id || uid()), foodId: e.foodId == null ? null : String(e.foodId), name: String(e.name || 'Besin').slice(0, 120),
      qty: num(e.qty, 1), unit: String(e.unit || 'porsiyon'), unitG: num(e.unitG, 0), grams: num(e.grams, 0),
      kcal: Math.round(kcal), p: round1(num(e.p)), c: round1(num(e.c)), f: round1(num(e.f)),
      meal: MEAL_BY[e.meal] ? e.meal : 'ara', ts: num(e.ts, Date.now()), quick: !!e.quick
    };
    if (e.state === 'raw' || e.state === 'cooked') out.state = e.state;   // çiğ / pişmiş tartı
    var sc = num(e.scale, 1);
    if (sc > 0 && sc !== 1 && sc <= 3) out.scale = sc;                    // büyük / küçük boy çarpanı
    return out;
  }
  function cleanFood(f) {
    if (!f || typeof f !== 'object' || !f.name || !isFinite(Number(f.kcal))) return null;
    var units = {};
    if (f.units && typeof f.units === 'object') Object.keys(f.units).forEach(function (k) { var g = Number(f.units[k]); if (g > 0) units[k] = g; });
    return {
      id: String(f.id || 'c_' + uid()), name: String(f.name).slice(0, 80), aliases: Array.isArray(f.aliases) ? f.aliases.map(String) : [],
      cat: 'Özel', kcal: num(f.kcal), p: num(f.p), c: num(f.c), f: num(f.f), units: units,
      def: f.def && (f.def === 'g' || units[f.def]) ? f.def : 'g', custom: true
    };
  }
  function sanitize(d) {
    var s = defaults();
    if (!d || typeof d !== 'object') return s;
    // gelecekteki sürüm geçişleri burada: if (d.v < 3) {...}
    s.createdAt = num(d.createdAt, s.createdAt);
    var pr = d.profile;
    if (pr && typeof pr === 'object' && num(pr.weight) > 20 && num(pr.height) > 80 && num(pr.age) > 5) {
      s.profile = {
        sex: pr.sex === 'e' ? 'e' : 'k', age: clamp(num(pr.age), 10, 110), height: clamp(num(pr.height), 100, 250),
        weight: clamp(num(pr.weight), 25, 400), goal: clamp(num(pr.goal, pr.weight), 25, 400),
        activity: ACTIVITY.some(function (a) { return a.id === pr.activity; }) ? pr.activity : 'hafif',
        pace: [0.25, 0.5, 0.75, 1].indexOf(num(pr.pace)) >= 0 ? num(pr.pace) : 0.5,
        startDate: isValidKey(pr.startDate) ? pr.startDate : todayKey()
      };
    }
    // v1 -> v2: elle hedef. Eski sürümde elle ayarlanmış hedef (targets.manual) varsa korunur; diğer herkes için kapalı.
    var mn = d.manual;
    if (mn && typeof mn === 'object') {
      var mk = Math.round(num(mn.kcal));
      if (mk >= MANUAL_MIN && mk <= MANUAL_MAX) s.manual = { on: !!mn.on, kcal: mk };
    } else if (d.targets && d.targets.manual && num(d.targets.kcal) >= MANUAL_MIN && num(d.targets.kcal) <= MANUAL_MAX) {
      s.manual = { on: true, kcal: Math.round(num(d.targets.kcal)) };
    }
    if (d.targets && num(d.targets.kcal) >= MANUAL_MIN) {
      s.targets = { kcal: Math.round(num(d.targets.kcal)), p: num(d.targets.p), c: num(d.targets.c), f: num(d.targets.f), manual: !!d.targets.manual, bmr: num(d.targets.bmr), tdee: num(d.targets.tdee), floorApplied: !!d.targets.floorApplied, deficit: num(d.targets.deficit) };
    }
    if (d.settings && typeof d.settings === 'object') {
      var st = d.settings;
      s.settings.theme = ['system', 'light', 'dark'].indexOf(st.theme) >= 0 ? st.theme : 'system';
      s.settings.wUnit = st.wUnit === 'lb' ? 'lb' : 'kg';
      s.settings.glassMl = clamp(num(st.glassMl, 250), 100, 1000);
      s.settings.waterGoal = clamp(Math.round(num(st.waterGoal, 8)), 1, 20);
    }
    if (d.days && typeof d.days === 'object') {
      Object.keys(d.days).forEach(function (k) {
        if (!isValidKey(k)) return;
        var day = d.days[k] || {};
        var entries = (Array.isArray(day.entries) ? day.entries : []).map(cleanEntry).filter(Boolean);
        var water = clamp(Math.round(num(day.water)), 0, 40);
        if (entries.length || water) s.days[k] = { entries: entries, water: water };
      });
    }
    var seenW = {};
    s.weights = (Array.isArray(d.weights) ? d.weights : []).filter(function (w) { return w && isValidKey(w.date) && num(w.kg) > 20 && num(w.kg) < 400; })
      .map(function (w) { return { date: w.date, kg: round1(num(w.kg) * 100) / 100 }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .filter(function (w) { if (seenW[w.date]) return false; seenW[w.date] = 1; return true; });
    var seenB = {};
    s.waists = (Array.isArray(d.waists) ? d.waists : []).filter(function (w) { return w && isValidKey(w.date) && num(w.cm) > 30 && num(w.cm) < 250; })
      .map(function (w) { return { date: w.date, cm: round1(num(w.cm)) }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .filter(function (w) { if (seenB[w.date]) return false; seenB[w.date] = 1; return true; });
    s.custom = (Array.isArray(d.custom) ? d.custom : []).map(cleanFood).filter(Boolean);
    s.favs = (Array.isArray(d.favs) ? d.favs : []).map(String).slice(0, 200);
    s.recents = (Array.isArray(d.recents) ? d.recents : []).filter(function (r) { return r && r.id; }).map(function (r) { return { id: String(r.id), qty: num(r.qty, 1), unit: String(r.unit || ''), ts: num(r.ts) }; }).slice(0, 30);
    s.meals = (Array.isArray(d.meals) ? d.meals : []).filter(function (m) { return m && m.name && Array.isArray(m.items); })
      .map(function (m) { return { id: String(m.id || uid()), name: String(m.name).slice(0, 60), items: m.items.map(cleanEntry).filter(Boolean) }; }).filter(function (m) { return m.items.length; });
    if (NC) s.reminders = NC.merge(d.reminders);
    if (d.remLog && typeof d.remLog === 'object') s.remLog = d.remLog;
    if (d.adaptive && typeof d.adaptive === 'object') s.adaptive = { dismissedAt: num(d.adaptive.dismissedAt) };
    if (d.ui && typeof d.ui === 'object') {
      s.ui.installDismissed = !!d.ui.installDismissed;
      s.ui.wRange = ['1H', '1A', '3A', 'T'].indexOf(d.ui.wRange) >= 0 ? d.ui.wRange : '1A';
      s.ui.calRange = d.ui.calRange === 30 ? 30 : 7;
    }
    if (s.profile && s.manual.on) s.targets = computeTargets(s.profile, s.profile.weight, s.manual);
    else if (s.profile && !s.targets) s.targets = calcTargets(s.profile, null);
    if (s.targets) s.targets.manual = !!(s.manual.on && s.profile);
    return s;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { storageOK = false; }
    if (!raw) return defaults();
    try { return sanitize(JSON.parse(raw)); }
    catch (e) {
      try { localStorage.setItem(STORE_KEY + '.bozuk.' + Date.now(), raw); } catch (_) { /* yer yok */ }
      pendingNotice = 'Kayıtlı veriler okunamadı. Eski veri yedeklendi ve temiz bir başlangıç yapıldı.';
      return defaults();
    }
  }
  var saveErrShown = false;
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); saveErrShown = false; }
    catch (e) { if (!saveErrShown) { saveErrShown = true; toast('Kaydedilemedi: tarayıcı depolaması dolu ya da kapalı olabilir.'); } }
  }

  var state = load();

  /* ======================================================================
     Alan mantığı
     ====================================================================== */
  function activityOf(id) { for (var i = 0; i < ACTIVITY.length; i++) if (ACTIVITY[i].id === id) return ACTIVITY[i]; return ACTIVITY[1]; }

  function calcTargets(pr, weightNow) {
    var w = weightNow || pr.weight;
    var bmr = 10 * w + 6.25 * pr.height - 5 * pr.age + (pr.sex === 'e' ? 5 : -161);
    var tdee = bmr * activityOf(pr.activity).f;
    var lose = pr.goal < w - 0.2;
    var deficit = lose ? pr.pace * 7700 / 7 : 0;
    var floor = pr.sex === 'e' ? 1500 : 1200;
    var raw = tdee - deficit;
    var kcal = Math.max(floor, Math.round(raw / 10) * 10);
    return Object.assign({ bmr: Math.round(bmr), tdee: Math.round(tdee), deficit: Math.round(Math.max(0, tdee - kcal)), floorApplied: raw < floor, manual: false, kcal: kcal }, macroSplit(kcal, w, pr.goal));
  }
  function macroSplit(kcal, w, goal) {
    var pW = Math.min(w, Math.max(goal || w, w * 0.85));
    var p = Math.round(clamp(1.8 * pW, kcal * 0.2 / 4, kcal * 0.35 / 4));
    var f = Math.round(kcal * 0.3 / 9);
    var c = Math.max(50, Math.round((kcal - p * 4 - f * 9) / 4));
    return { p: p, c: c, f: f };
  }
  function kcalFloor(sex) { return sex === 'e' ? 1500 : 1200; }
  /** Elle hedefte makrolar kaloriyle orantılı: protein ~1,6 g/kg (en çok kalorinin %40'ı), yağ %30, kalanı karbonhidrat */
  function manualMacros(kcal, w) {
    var p = Math.round(Math.min(1.6 * w, kcal * 0.4 / 4));
    var f = Math.round(kcal * 0.3 / 9);
    var c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { p: p, c: c, f: f };
  }
  /** Geçerli hedef: elle hedef açıksa o, değilse hesaplanan öneri. */
  function computeTargets(pr, w, manual) {
    var calc = calcTargets(pr, w);
    if (!(manual && manual.on && manual.kcal >= MANUAL_MIN)) return calc;
    return Object.assign({}, calc, { manual: true, kcal: manual.kcal, floorApplied: false, deficit: Math.round(Math.max(0, calc.tdee - manual.kcal)) }, manualMacros(manual.kcal, w || pr.weight));
  }
  function applyTargets() {
    if (state.profile) state.targets = computeTargets(state.profile, currentWeight(), state.manual);
  }
  function refreshTargets() { applyTargets(); }
  function recommendedKcal() { return state.profile ? calcTargets(state.profile, currentWeight()).kcal : 0; }
  function manualHint(v, sex) {
    if (!isFinite(v)) return { warn: false, html: '' };
    if (v < MANUAL_MIN || v > MANUAL_MAX) return { warn: true, html: 'Hedef ' + fmt(MANUAL_MIN) + '–' + fmt(MANUAL_MAX) + ' kcal arasında olmalı.' };
    if (v < kcalFloor(sex)) return { warn: true, html: LOW_KCAL_MSG };
    return { warn: false, html: '' };
  }

  // Besinler
  var _all = null, _byId = null;
  function invalidateFoods() { _all = null; _byId = null; }
  function allFoods() { if (!_all) _all = state.custom.concat(FOODS); return _all; }
  function foodById(id) {
    if (!_byId) { _byId = {}; allFoods().forEach(function (f) { _byId[f.id] = f; }); }
    return id == null ? null : _byId[id] || null;
  }
  function boostMap() {
    var b = {};
    state.recents.forEach(function (r, i) { b[r.id] = (b[r.id] || 0) + Math.max(1, 6 - i * 0.25); });
    state.favs.forEach(function (id) { b[id] = (b[id] || 0) + 4; });
    return b;
  }
  function isLiquid(food) { return /içecek|icecek|süt|sut|meyve suyu/i.test(food.cat || '') || !!(food.units && (food.units.bardak || food.units['şişe'] || food.units['su bardağı'])); }
  function unitOpts(food, cur, curG) {
    var opts = P.unitOptions(food);
    if (isLiquid(food) && opts.indexOf('ml') < 0) opts.push('ml');
    if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
    var units = P.foodUnits(food);
    return opts.map(function (u) {
      var g = u === 'g' || u === 'ml' ? null : (units[u] || curG);
      return { v: u, label: (P.UNIT_LABELS[u] || u) + (g ? ' (' + fmt(g, 1) + ' g)' : '') };
    });
  }
  function portionText(it) {
    if (it.quick) return 'Hızlı giriş · ' + fmt(it.kcal) + ' kcal';
    var s = fmtQty(it.qty) + ' ' + (P.UNIT_LABELS[it.unit] || it.unit);
    if (it.unit !== 'g' && it.unit !== 'ml' && it.grams) s += ' · ' + fmt(it.grams) + ' g';
    return s;
  }

  // Günler
  function dayOf(k) { return state.days[k] || { entries: [], water: 0 }; }
  function ensureDay(k) { if (!state.days[k]) state.days[k] = { entries: [], water: 0 }; return state.days[k]; }
  function totalsOf(entries) {
    var t = { kcal: 0, p: 0, c: 0, f: 0 };
    entries.forEach(function (e) { t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f; });
    return t;
  }
  function dayTotals(k) { return totalsOf(dayOf(k).entries); }
  function pruneDay(k) { var d = state.days[k]; if (d && !d.entries.length && !d.water) delete state.days[k]; }
  function hasLog(k) { var d = state.days[k]; return !!(d && d.entries.length); }

  function toEntry(it, meal) {
    return cleanEntry({ id: uid(), foodId: it.foodId, name: it.name, qty: it.qty, unit: it.unit, unitG: it.unitG, grams: it.grams, kcal: it.kcal, p: it.p, c: it.c, f: it.f, meal: meal, ts: Date.now(), quick: it.quick, state: it.state, scale: it.scale });
  }
  function pushRecent(it) {
    if (!it.foodId) return;
    state.recents = state.recents.filter(function (r) { return r.id !== it.foodId; });
    state.recents.unshift({ id: it.foodId, qty: it.qty, unit: it.unit, state: it.state, ts: Date.now() });
    state.recents = state.recents.slice(0, 30);
  }
  function addItems(k, meal, items, silent) {
    var d = ensureDay(k);
    var added = items.map(function (it) { return toEntry(it, meal); }).filter(Boolean);
    added.forEach(function (e) { d.entries.push(e); pushRecent(e); });
    save(); haptic(); render(); notifySync();
    if (!silent) {
      var kc = added.reduce(function (a, e) { return a + e.kcal; }, 0);
      toast((added.length > 1 ? added.length + ' kalem' : esc(added[0] ? added[0].name : 'Kalem')) + ' eklendi · ' + fmt(kc) + ' kcal', {
        action: 'Geri al', onAction: function () {
          var ids = added.map(function (e) { return e.id; });
          d.entries = d.entries.filter(function (e) { return ids.indexOf(e.id) < 0; });
          pruneDay(k); save(); render(); notifySync();
        }
      });
    }
    return added;
  }
  function deleteEntry(k, id) {
    var d = state.days[k]; if (!d) return;
    var idx = -1;
    d.entries.forEach(function (e, i) { if (e.id === id) idx = i; });
    if (idx < 0) return;
    var removed = d.entries.splice(idx, 1)[0];
    pruneDay(k); save(); render(); notifySync();
    toast(esc(removed.name) + ' silindi', { action: 'Geri al', onAction: function () { var dd = ensureDay(k); dd.entries.splice(idx, 0, removed); save(); render(); notifySync(); } });
  }

  // Kilo ve trend
  var ALPHA = 0.1;
  function trendSeries() {
    var out = [], t = null, prev = null;
    state.weights.forEach(function (w) {
      var dn = Math.round(parseKey(w.date) / 864e5);
      if (t == null) t = w.kg;
      else { var gap = Math.max(1, dn - prev); var a = 1 - Math.pow(1 - ALPHA, gap); t = t + a * (w.kg - t); }
      prev = dn;
      out.push({ date: w.date, y: w.kg, t: t });
    });
    return out;
  }
  function currentWeight() {
    var tr = trendSeries();
    if (tr.length) return tr[tr.length - 1].t;
    return state.profile ? state.profile.weight : null;
  }
  /** kg/gün eğim (son 28 gün trend üzerinde doğrusal regresyon) */
  function trendRate() {
    var tr = trendSeries();
    if (tr.length < 2) return null;
    var last = tr[tr.length - 1].date;
    var pts = tr.filter(function (p) { return dayDiff(p.date, last) <= 28; });
    if (pts.length < 2) pts = tr.slice(-2);
    var span = dayDiff(pts[0].date, pts[pts.length - 1].date);
    if (span < 6) return null;
    var xs = pts.map(function (p) { return dayDiff(pts[0].date, p.date); }), ys = pts.map(function (p) { return p.t; });
    var n = xs.length, mx = xs.reduce(function (a, b) { return a + b; }) / n, my = ys.reduce(function (a, b) { return a + b; }) / n;
    var num_ = 0, den = 0;
    for (var i = 0; i < n; i++) { num_ += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    return den ? num_ / den : null;
  }
  function goalForecast() {
    if (!state.profile) return null;
    var cw = currentWeight(), goal = state.profile.goal, rate = trendRate();
    if (cw == null) return null;
    var remaining = cw - goal;
    if (Math.abs(remaining) < 0.3) return { reached: true };
    if (rate == null) return { needData: true };
    if ((remaining > 0 && rate >= -0.005) || (remaining < 0 && rate <= 0.005)) return { wrongWay: true, rate: rate };
    var days = Math.abs(remaining / rate);
    if (days > 365 * 3) return { tooFar: true, rate: rate };
    var d = new Date(); d.setDate(d.getDate() + Math.round(days));
    return { date: d, days: Math.round(days), rate: rate };
  }
  function bmiInfo(kg) {
    if (!state.profile || !kg) return null;
    var h = state.profile.height / 100, b = kg / (h * h);
    var cat = b < 18.5 ? 'Zayıf' : b < 25 ? 'Normal' : b < 30 ? 'Fazla kilolu' : b < 35 ? 'Obez (1. derece)' : b < 40 ? 'Obez (2. derece)' : 'Obez (3. derece)';
    return { bmi: b, cat: cat };
  }
  function wU() { return state.settings.wUnit; }
  function toDisp(kg) { return wU() === 'lb' ? kg * LB : kg; }
  function fromDisp(v) { return wU() === 'lb' ? v / LB : v; }
  function fmtW(kg, dec) { return kg == null ? '–' : fmt(toDisp(kg), dec == null ? 1 : dec) + ' ' + wU(); }

  // Seri
  function isLoggedDay(k) { return hasLog(k) || state.weights.some(function (w) { return w.date === k; }); }
  function streak() {
    var k = todayKey(), n = 0;
    if (!isLoggedDay(k)) k = addDays(k, -1);
    while (isLoggedDay(k)) { n++; k = addDays(k, -1); if (n > 3650) break; }
    return n;
  }

  // Uyarlanabilir hedef (gerçek harcama tahmini)
  function adaptiveEstimate() {
    if (!state.profile || !state.targets) return null;
    var tr = trendSeries();
    var end = addDays(todayKey(), -1), start = addDays(end, -27);
    var inWin = tr.filter(function (p) { return p.date >= start && p.date <= end; });
    if (inWin.length < 2) return null;
    var a = inWin[0], b = inWin[inWin.length - 1];
    var span = dayDiff(a.date, b.date);
    if (span < 10) return null;
    var logged = [], k = a.date;
    while (k <= b.date) { var t = dayTotals(k); if (t.kcal >= 500) logged.push(t.kcal); k = addDays(k, 1); }
    if (logged.length < 14) return { notEnough: true, logged: logged.length };
    var avgIn = logged.reduce(function (x, y) { return x + y; }) / logged.length;
    var tdee = avgIn - (b.t - a.t) * 7700 / span;
    tdee = clamp(tdee, 1100, 5000);
    var floor = state.profile.sex === 'e' ? 1500 : 1200;
    var lose = state.profile.goal < b.t - 0.2;
    var suggested = Math.max(floor, Math.round((tdee - (lose ? state.profile.pace * 1100 : 0)) / 10) * 10);
    return { tdee: Math.round(tdee), avgIn: Math.round(avgIn), suggested: suggested, days: logged.length, change: b.t - a.t, span: span };
  }

  /* ======================================================================
     Arayüz altyapısı: tema, toast, alt sayfa
     ====================================================================== */
  function applyTheme() {
    var t = state.settings.theme, root = document.documentElement;
    if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    var dark = t === 'dark' || (t === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    $$('meta[name="theme-color"]').forEach(function (m) {
      if (t === 'system') m.setAttribute('content', /dark/.test(m.getAttribute('media') || '') ? '#0b100e' : '#f4f6f5');
      else m.setAttribute('content', dark ? '#0b100e' : '#f4f6f5');
    });
    var sb = $('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (sb) sb.setAttribute('content', dark ? 'black' : 'default');
  }

  function toast(html, opts) {
    opts = opts || {};
    var box = $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span>' + html + '</span>' + (opts.action ? '<button type="button">' + esc(opts.action) + '</button>' : '');
    box.classList.toggle('top', sheetStack.length > 0);
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(t);
    var done = false;
    function close() { if (done) return; done = true; t.classList.add('out'); setTimeout(function () { t.remove(); }, 260); }
    if (opts.action) t.querySelector('button').addEventListener('click', function () { close(); opts.onAction && opts.onAction(); });
    setTimeout(close, opts.ms || (opts.action ? 5000 : 3000));
    return close;
  }

  var sheetStack = [], ignorePop = 0;
  function openSheet(o) {
    var layer = document.createElement('div');
    layer.className = 'sheet-layer';
    layer.innerHTML = '<div class="sheet-backdrop"></div><div class="sheet' + (o.full ? ' full' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '">' +
      '<div class="sheet-grab"></div><div class="sheet-head"><h2>' + esc(o.title) + '</h2>' + (o.headExtra || '') +
      '<button type="button" class="icon-btn filled" data-close aria-label="Kapat">' + icon('x') + '</button></div>' +
      '<div class="sheet-body"></div><div class="sheet-foot" hidden></div></div>';
    $('#sheets').appendChild(layer);
    var s = {
      layer: layer, el: layer.querySelector('.sheet'), body: layer.querySelector('.sheet-body'), foot: layer.querySelector('.sheet-foot'),
      closed: false, onClose: o.onClose,
      setBody: function (h) { s.body.innerHTML = h; }, setFoot: function (h) { s.foot.hidden = !h; s.foot.innerHTML = h || ''; },
      close: function () { closeSheet(s, true); }
    };
    if (o.body) s.setBody(o.body);
    if (o.foot) s.setFoot(o.foot);
    layer.querySelector('.sheet-backdrop').addEventListener('click', s.close);
    layer.querySelector('[data-close]').addEventListener('click', s.close);
    // aşağı kaydırarak kapatma
    var grab = layer.querySelector('.sheet-grab'), head = layer.querySelector('.sheet-head'), y0 = null, dy = 0;
    [grab, head].forEach(function (h) {
      h.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; dy = 0; s.el.style.transition = 'none'; }, { passive: true });
      h.addEventListener('touchmove', function (e) { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); s.el.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
      h.addEventListener('touchend', function () { s.el.style.transition = ''; s.el.style.transform = ''; if (dy > 90) s.close(); y0 = null; });
    });
    sheetStack.push(s);
    $('#toasts').classList.add('top');
    try { history.pushState({ zsheet: sheetStack.length }, ''); } catch (e) { /* yoksay */ }
    requestAnimationFrame(function () { requestAnimationFrame(function () { layer.classList.add('open'); }); });
    return s;
  }
  function closeSheet(s, fromUI) {
    if (s.closed) return;
    s.closed = true;
    var i = sheetStack.indexOf(s);
    if (i >= 0) sheetStack.splice(i, 1);
    if (!sheetStack.length) $('#toasts').classList.remove('top');
    s.layer.classList.remove('open');
    setTimeout(function () { s.layer.remove(); }, 320);
    if (s.onClose) try { s.onClose(); } catch (e) { console.error(e); }
    if (fromUI && history.state && history.state.zsheet) { ignorePop++; history.back(); }
  }
  function closeAllSheets() { sheetStack.slice().reverse().forEach(function (s) { closeSheet(s, true); }); }
  window.addEventListener('popstate', function () {
    if (ignorePop > 0) { ignorePop--; return; }
    var top = sheetStack[sheetStack.length - 1];
    if (top) closeSheet(top, false);
  });

  function confirmSheet(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var answered = false;
      var s = openSheet({
        title: title, body: '<p class="muted" style="margin:4px 0 8px">' + text + '</p>',
        foot: '<div class="btn-row"><button class="btn" data-no>Vazgeç</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-yes>' + esc(okLabel) + '</button></div>',
        onClose: function () { if (!answered) resolve(false); }
      });
      s.foot.querySelector('[data-no]').onclick = function () { s.close(); };
      s.foot.querySelector('[data-yes]').onclick = function () { answered = true; resolve(true); s.close(); };
    });
  }

  /* ======================================================================
     Yönlendirme ve görünüm
     ====================================================================== */
  var TABS = ['bugun', 'ilerleme', 'kilo', 'koc', 'ayarlar'];
  var route = 'bugun';
  var viewDate = todayKey();
  var lastToday = todayKey();
  var deferredPrompt = null;
  var calSel = null;

  function routeFromHash() { var h = (location.hash || '').replace('#', ''); return TABS.indexOf(h) >= 0 ? h : 'bugun'; }

  function render() {
    var view = $('#view');
    var onboarding = !state.profile;
    $('#tabbar').hidden = onboarding;
    var coachBar = !onboarding && route === 'koc' && coachChatReady();
    $('#quickbar').hidden = onboarding || route !== 'bugun';
    $('#coachbar').hidden = !coachBar;
    view.className = 'view' + (onboarding ? ' no-tabs' : '') + (!onboarding && (route === 'bugun' || coachBar) ? ' has-quickbar' : '');
    if (onboarding) { renderOnboarding(); return; }
    $$('#tabbar .tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === route); });
    if (route === 'bugun') renderToday();
    else if (route === 'ilerleme') renderProgress();
    else if (route === 'kilo') renderWeight();
    else if (route === 'koc') renderCoach();
    else renderSettings();
  }

  /* ---------------------------- Onboarding ---------------------------- */
  var ob = { step: 0, sex: null, age: '', height: '', weight: '', goal: '', activity: 'hafif', pace: 0.5, manualOn: false, manualKcal: '' };
  function obProfile() {
    return { sex: ob.sex, age: parseNum(ob.age), height: parseNum(ob.height), weight: fromDisp(parseNum(ob.weight)), goal: fromDisp(parseNum(ob.goal)), activity: ob.activity, pace: ob.pace, startDate: todayKey() };
  }
  function obValid(step) {
    var p = obProfile();
    if (step === 0) return !!ob.sex;
    if (step === 1) return p.age >= 14 && p.age <= 100 && p.height >= 120 && p.height <= 230;
    if (step === 2) return p.weight >= 35 && p.weight <= 300 && p.goal >= 35 && p.goal <= 300;
    if (step === 5 && ob.manualOn) { var mv = parseNum(ob.manualKcal); return mv >= MANUAL_MIN && mv <= MANUAL_MAX; }
    return true;
  }
  function renderOnboarding() {
    var view = $('#view'), s = ob.step, total = 6, body = '';
    var unit = wU();
    if (s === 0) {
      body = '<img class="onb-logo" src="icons/icon-192.png" alt="" width="84" height="84">' +
        '<h1>Zayıfla\'ya hoş geldin</h1><p class="lead">Ne yediğini söyle ya da yaz; kaloriyi biz hesaplayalım. Önce birkaç soruyla günlük hedefini belirleyelim.</p>' +
        '<div class="section-title" style="margin-top:6px">Cinsiyet</div><div class="choice-row">' +
        ['k', 'e'].map(function (x) { return '<button type="button" class="choice' + (ob.sex === x ? ' on' : '') + '" data-ob="sex" data-v="' + x + '"><span class="ch-emoji">' + (x === 'k' ? '👩' : '👨') + '</span><b>' + (x === 'k' ? 'Kadın' : 'Erkek') + '</b></button>'; }).join('') + '</div>' +
        '<p class="tiny faint" style="margin-top:14px">Bazal metabolizma hızı (Mifflin-St Jeor) cinsiyete göre hesaplanır. Verilerin yalnızca bu cihazda saklanır.</p>';
    } else if (s === 1) {
      body = '<h1>Seni biraz tanıyalım</h1><p class="lead">Yaş ve boy, günlük enerji ihtiyacını hesaplamak için gerekli.</p>' +
        '<label class="field"><span>Yaş</span><div class="input-unit"><input class="input big-input" data-obi="age" inputmode="numeric" pattern="[0-9]*" value="' + esc(ob.age) + '" placeholder="30"><em>yaş</em></div></label>' +
        '<label class="field"><span>Boy</span><div class="input-unit"><input class="input big-input" data-obi="height" inputmode="numeric" pattern="[0-9]*" value="' + esc(ob.height) + '" placeholder="170"><em>cm</em></div></label>';
    } else if (s === 2) {
      body = '<h1>Kilon ve hedefin</h1><p class="lead">Hedefe ne kadar yaklaştığını trend kilonla takip edeceğiz.</p>' +
        '<label class="field"><span>Şu anki kilo</span><div class="input-unit"><input class="input big-input" data-obi="weight" inputmode="decimal" value="' + esc(ob.weight) + '" placeholder="' + (unit === 'lb' ? '180' : '82') + '"><em>' + unit + '</em></div></label>' +
        '<label class="field"><span>Hedef kilo</span><div class="input-unit"><input class="input big-input" data-obi="goal" inputmode="decimal" value="' + esc(ob.goal) + '" placeholder="' + (unit === 'lb' ? '155' : '70') + '"><em>' + unit + '</em></div></label>' +
        '<div id="ob-bmi" class="hint"></div>';
    } else if (s === 3) {
      body = '<h1>Ne kadar hareketlisin?</h1><p class="lead">Spor dahil, tipik bir haftanı düşün.</p><div class="choice-list">' +
        ACTIVITY.map(function (a) { return '<button type="button" class="choice' + (ob.activity === a.id ? ' on' : '') + '" data-ob="activity" data-v="' + a.id + '"><span class="ch-emoji">' + a.emoji + '</span><span><b>' + a.label + '</b><small>' + a.desc + '</small></span></button>'; }).join('') + '</div>';
    } else if (s === 4) {
      var pr = obProfile();
      if (pr.goal >= pr.weight - 0.2) {
        body = '<h1>Kilonu korumak</h1><p class="lead">Hedef kilon şu anki kilona eşit ya da daha yüksek; bu yüzden kalori açığı uygulanmayacak. Günlük hedefin harcamana eşit olacak.</p>';
      } else {
        body = '<h1>Hangi hızda?</h1><p class="lead">Haftalık kilo verme temposu. Yavaş tempo kas kaybını azaltır ve sürdürmesi kolaydır.</p><div class="choice-list">' +
          PACES.map(function (p) { return '<button type="button" class="choice' + (ob.pace === p.v ? ' on' : '') + '" data-ob="pace" data-v="' + p.v + '"><span class="ch-emoji">' + (p.v <= 0.25 ? '🐢' : p.v <= 0.5 ? '✅' : p.v <= 0.75 ? '⚡' : '🚀') + '</span><span><b>' + p.label + '</b><small>' + p.desc + ' · günde ~' + fmt(p.v * 1100) + ' kcal açık</small></span></button>'; }).join('') + '</div>';
      }
    } else {
      var p2 = obProfile(), t = calcTargets(p2, null);
      var weeks = p2.goal < p2.weight - 0.2 ? Math.ceil((p2.weight - p2.goal) / p2.pace) : 0;
      body = '<h1>Hedefin hazır 🎉</h1><p class="lead">İstediğin zaman Ayarlar\'dan değiştirebilirsin.</p>' +
        '<div class="result-hero"><span>' + (ob.manualOn ? 'Önerilen günlük kalori' : 'Günlük kalori hedefi') + '</span><b class="num">' + fmt(t.kcal) + '</b><span>kcal</span></div>' +
        '<div class="card flat"><div class="settings-row"><div class="grow"><b>Bazal metabolizma (BMR)</b><small>Dinlenirken harcadığın</small></div><b class="num">' + fmt(t.bmr) + ' kcal</b></div>' +
        '<div class="settings-row"><div class="grow"><b>Günlük harcama (TDEE)</b><small>' + activityOf(p2.activity).label + '</small></div><b class="num">' + fmt(t.tdee) + ' kcal</b></div>' +
        '<div class="settings-row"><div class="grow"><b>Makro hedefleri</b><small>Protein · Karbonhidrat · Yağ</small></div><b class="num">' + t.p + ' · ' + t.c + ' · ' + t.f + ' g</b></div>' +
        (weeks ? '<div class="settings-row"><div class="grow"><b>Tahmini süre</b><small>' + fmtW(p2.weight) + ' → ' + fmtW(p2.goal) + '</small></div><b class="num">~' + weeks + ' hafta</b></div>' : '') + '</div>' +
        '<div class="card flat" style="margin-top:12px"><div class="settings-row"><div class="grow"><b>Hedefi kendim belirleyeceğim</b><small>İstersen kendi günlük kalori hedefini gir (isteğe bağlı)</small></div>' +
        '<label class="switch"><input type="checkbox" data-ob="manual" ' + (ob.manualOn ? 'checked' : '') + ' aria-label="Hedefi kendim belirleyeceğim"><i></i></label></div>' +
        (ob.manualOn ? '<label class="field" style="margin-top:10px"><span>Günlük kalori hedefim</span><div class="input-unit"><input class="input big-input" data-obi="manualKcal" inputmode="numeric" pattern="[0-9]*" value="' + esc(ob.manualKcal) + '" placeholder="' + t.kcal + '"><em>kcal</em></div></label>' +
          '<div id="ob-mwarn" class="hint warn" hidden></div>' : '') + '</div>' +
        (t.floorApplied ? '<div class="hint warn">Güvenlik için günlük hedef ' + (p2.sex === 'e' ? '1500' : '1200') + ' kcal\'nin altına indirilmedi. Bu yüzden kilo verme hızın seçtiğinden biraz yavaş olabilir.</div>' : '') +
        '<p class="tiny faint">Bu hesaplamalar tahminidir ve tıbbi tavsiye değildir. Sağlık sorunun varsa diyetisyen ya da hekimine danış.</p>';
    }
    var dots = ''; for (var i = 0; i < total; i++) dots += '<i class="' + (i <= s ? 'on' : '') + '"></i>';
    view.innerHTML = '<div class="onb"><div class="onb-top">' + (s > 0 ? '<button type="button" class="icon-btn" data-ob="back" aria-label="Geri">' + icon('left') + '</button>' : '') + '<div class="onb-dots">' + dots + '</div></div>' +
      '<div class="onb-body">' + body + '</div>' +
      '<button type="button" class="btn btn-primary btn-lg btn-block" data-ob="next" ' + (obValid(s) ? '' : 'disabled') + '>' + (s === total - 1 ? 'Başlayalım' : 'Devam') + '</button></div>';
    updateObBmi(); updateObManual();
  }
  function updateObManual() {
    var el = $('#ob-mwarn'); if (!el) return;
    var h = manualHint(parseNum(ob.manualKcal), ob.sex);
    el.hidden = !h.html; el.innerHTML = h.html;
  }
  function updateObBmi() {
    var el = $('#ob-bmi'); if (!el) return;
    var p = obProfile();
    if (!(p.weight > 30) || !(p.height > 100)) { el.hidden = true; return; }
    var h = p.height / 100, b = p.weight / (h * h), healthyMax = 24.9 * h * h, healthyMin = 18.5 * h * h;
    el.hidden = false;
    el.innerHTML = 'Vücut kitle indeksin <b>' + fmt(b, 1) + '</b>. Boyuna göre sağlıklı aralık yaklaşık <b>' + fmtW(healthyMin, 0) + ' – ' + fmtW(healthyMax, 0) + '</b>.' +
      (p.goal > 0 && p.goal < healthyMin ? '<br><b>Not:</b> hedefin sağlıklı aralığın altında görünüyor.' : '');
  }
  function obHandle(act, v) {
    if (act === 'sex') { ob.sex = v; }
    else if (act === 'activity') { ob.activity = v; }
    else if (act === 'pace') { ob.pace = parseFloat(v); }
    else if (act === 'manual') { ob.manualOn = !ob.manualOn; }
    else if (act === 'back') { ob.step = Math.max(0, ob.step - 1); }
    else if (act === 'next') {
      if (!obValid(ob.step)) return;
      if (ob.step === 5) { finishOnboarding(); return; }
      ob.step++;
    }
    renderOnboarding();
    if (act === 'next' || act === 'back' || (act === 'manual' && ob.manualOn)) { var f = $('.onb input[data-obi]'); if (f) setTimeout(function () { try { f.focus(); } catch (e) { /* */ } }, 50); }
  }
  function finishOnboarding() {
    var p = obProfile();
    p.weight = round1(p.weight * 10) / 10; p.goal = round1(p.goal * 10) / 10;
    state.profile = p;
    var k = todayKey();
    state.weights = state.weights.filter(function (w) { return w.date !== k; });
    state.weights.push({ date: k, kg: p.weight });
    state.weights.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var mv = Math.round(parseNum(ob.manualKcal));
    state.manual = ob.manualOn && mv >= MANUAL_MIN && mv <= MANUAL_MAX ? { on: true, kcal: mv } : { on: false, kcal: null };
    state.targets = computeTargets(p, null, state.manual);
    save();
    location.hash = '#bugun';
    route = 'bugun';
    render();
    toast('Hazırsın! Ne yediğini yaz ya da 🎤 ile söyle.');
  }

  /* ------------------------------ Bugün ------------------------------- */
  function renderToday() {
    var view = $('#view'), k = viewDate, today = todayKey(), isToday = k === today;
    var day = dayOf(k), t = totalsOf(day.entries), tg = state.targets;
    var remaining = tg.kcal - t.kcal;
    var label = isToday ? 'Bugün' : k === addDays(today, -1) ? 'Dün' : fmtShort(k);
    var html = '<div class="day-nav"><button type="button" class="icon-btn" data-action="day-prev" aria-label="Önceki gün">' + icon('left') + '</button>' +
      '<div class="day-label"><b>' + label + '</b><small>' + fmtLong(k) + '</small>' +
      (!isToday ? '<br><button type="button" class="today-pill" data-action="day-today">Bugüne dön</button>' : '') +
      '<input type="date" aria-label="Tarih seç" data-action-change="day-pick" value="' + k + '" max="' + today + '"></div>' +
      '<button type="button" class="icon-btn" data-action="day-next" aria-label="Sonraki gün" ' + (isToday ? 'disabled style="opacity:.3"' : '') + '>' + icon('right') + '</button></div>';

    if (!FOODS.length) html += '<div class="card warn"><b>Besin veritabanı yüklenemedi.</b><div class="small muted">foods.js bulunamadı; özel besinler ve hızlı kalori ile devam edebilirsin.</div></div>';
    if (pendingNotice) { html += '<div class="card warn small">' + esc(pendingNotice) + '</div>'; pendingNotice = null; }
    if (deferredPrompt && !state.ui.installDismissed) {
      html += '<div class="card tint banner"><div class="n-ic">' + icon('phone') + '</div><div class="grow"><b>Uygulamayı yükle</b><small>Ana ekrandan tek dokunuşla aç, çevrimdışı çalışsın.</small></div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="install">Yükle</button><button type="button" class="icon-btn" data-action="install-dismiss" aria-label="Kapat">' + icon('x', 'ic-sm') + '</button></div>';
    }

    // Özet
    html += '<section class="card summary-card"><div class="ring-wrap"><div id="ring"></div><div class="ring-center' + (remaining < 0 ? ' over' : '') + '">' +
      '<div class="big">' + fmt(Math.abs(remaining)) + '</div><div class="lbl">' + (remaining < 0 ? 'kcal fazla' : 'kcal kaldı') + '</div></div></div>' +
      '<div class="summary-stats"><div><b>' + fmt(tg.kcal) + '</b><span>Hedef</span></div><div><b>' + fmt(t.kcal) + '</b><span>Yenen</span></div><div><b>' + fmt(Math.max(0, remaining)) + '</b><span>Kalan</span></div></div>' +
      '<div class="macros">' + macroBar('p', 'Protein', t.p, tg.p) + macroBar('c', 'Karbonhidrat', t.c, tg.c) + macroBar('f', 'Yağ', t.f, tg.f) + '</div></section>';

    if (isToday) html += nudgeCard(t, remaining) + adaptiveCard();

    // Su
    var goal = state.settings.waterGoal, w = day.water || 0, ml = state.settings.glassMl;
    var count = Math.min(20, Math.max(goal, w + (w >= goal ? 1 : 0)));
    var glasses = '';
    for (var i = 0; i < count; i++) glasses += '<button type="button" class="glass' + (i < w ? ' full' : '') + (i === w ? ' next' : '') + '" data-action="water-set" data-n="' + i + '" aria-label="' + (i + 1) + '. bardak"></button>';
    html += '<section class="card"><div class="card-head water-head"><div class="row"><span style="color:var(--water)">' + icon('drop') + '</span><h3 class="card-title">Su</h3></div>' +
      '<div class="row"><span class="wv">' + fmt(w * ml / 1000, 2) + ' / ' + fmt(goal * ml / 1000, 2) + ' L</span>' +
      '<button type="button" class="icon-btn filled" data-action="water-minus" aria-label="Bir bardak azalt">' + icon('minus', 'ic-sm') + '</button>' +
      '<button type="button" class="icon-btn filled" data-action="water-plus" aria-label="Bir bardak ekle">' + icon('plus', 'ic-sm') + '</button></div></div>' +
      '<div class="water-glasses" style="--cols:' + Math.min(10, count) + '">' + glasses + '</div></section>';

    // Öğünler
    var yKey = addDays(k, -1), yDay = dayOf(yKey);
    MEALS.forEach(function (m) {
      var list = day.entries.filter(function (e) { return e.meal === m.id; });
      var mt = totalsOf(list);
      var yList = yDay.entries.filter(function (e) { return e.meal === m.id; });
      html += '<section class="card meal-card"><div class="meal-head"><div class="meal-emoji">' + m.emoji + '</div><div class="grow"><h3>' + m.label + '</h3>' +
        '<div class="mk">' + (list.length ? fmt(mt.kcal) + ' kcal · P ' + fmt(mt.p) + ' · K ' + fmt(mt.c) + ' · Y ' + fmt(mt.f) : 'Henüz bir şey yok') + '</div></div>' +
        '<button type="button" class="icon-btn filled" data-action="meal-add" data-meal="' + m.id + '" aria-label="' + m.label + ' için ekle">' + icon('plus') + '</button></div>';
      if (list.length) {
        html += '<ul class="meal-entries">' + list.map(function (e) {
          return '<li><button type="button" class="entry" data-action="entry" data-id="' + e.id + '"><div class="e-main"><div class="e-name">' + esc(e.name) + '</div><div class="e-sub">' + esc(portionText(e)) + '</div></div><div class="e-kcal">' + fmt(e.kcal) + '</div></button></li>';
        }).join('') + '</ul>';
      }
      var acts = '';
      if (yList.length) acts += '<button type="button" class="link-btn" data-action="copy-meal" data-meal="' + m.id + '">' + icon('copy', 'ic-sm') + 'Dünkü öğünü kopyala (' + fmt(totalsOf(yList).kcal) + ' kcal)</button>';
      if (list.length) acts += '<button type="button" class="link-btn" data-action="save-meal" data-meal="' + m.id + '">' + icon('bookmark', 'ic-sm') + 'Öğün olarak kaydet</button>';
      if (acts) html += '<div class="meal-actions">' + acts + '</div>';
      html += '</section>';
    });
    if (!day.entries.length) html += '<p class="kbd-tip">İpucu: aşağıya “2 yumurta, 1 dilim peynir ve çay” yazabilir ya da 🎤 ile söyleyebilirsin.</p>';

    view.innerHTML = html;
    C.ring($('#ring'), { value: t.kcal, goal: tg.kcal });
  }
  function macroBar(cls, label, v, goal) {
    var pct = goal ? Math.min(100, v / goal * 100) : 0;
    return '<div class="macro ' + cls + '"><div class="m-top"><span>' + label + '</span></div><div class="bar' + (goal && v > goal * 1.1 ? ' over' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<div class="m-val">' + fmt(v) + '<small> / ' + fmt(goal) + ' g</small></div></div>';
  }
  function nudgeCard(t, remaining) {
    var h = new Date().getHours(), lines = [], emoji = '💡';
    var tg = state.targets;
    if (!t.kcal) {
      if (h < 11) { lines.push('Günaydın! Kahvaltıda ne yediğini söylemen ya da yazman yeterli.'); emoji = '☀️'; }
      else lines.push('Bugün henüz kayıt yok. Aşağıdaki kutuya yaz ya da 🎤 ile söyle.');
    } else if (remaining < 0) {
      emoji = '🤝';
      lines.push('Hedefi <b>' + fmt(-remaining) + ' kcal</b> aştın. Sorun değil; önemli olan haftalık ortalama.');
    } else if (h >= 20 && remaining <= 350) {
      emoji = '👏'; lines.push('Bugün hedefinin içindesin! <b>' + fmt(remaining) + ' kcal</b> hakkın kaldı.');
    } else if (h >= 14 && remaining >= 120 && remaining <= 450) {
      emoji = '🍎'; lines.push('<b>' + fmt(remaining) + ' kcal</b> hakkın kaldı, ara öğün sığar (ör. 1 elma + 10 fındık ≈ 190 kcal).');
    } else if (h >= 16 && remaining > 450) {
      emoji = '🍽️'; lines.push('Akşam yemeği için <b>' + fmt(remaining) + ' kcal</b> hakkın var.');
    } else if (remaining < 120) {
      emoji = '🎯'; lines.push('Hedefe çok yakınsın: <b>' + fmt(remaining) + ' kcal</b> kaldı.');
    } else {
      lines.push('<b>' + fmt(remaining) + ' kcal</b> hakkın var. Böyle devam!');
    }
    if (t.kcal && h >= 17 && tg.p && t.p < tg.p * 0.6) lines.push('Proteinin hedefin %' + Math.round(t.p / tg.p * 100) + '\'inde; akşamı protein ağırlıklı yapmak tok tutar.');
    var fc = goalForecast();
    if (fc && fc.date) lines.push('Bu gidişle hedef kilona <b>' + fmtDateY(fc.date) + '</b> civarında ulaşırsın.');
    else if (fc && fc.reached) lines.push('Hedef kilona ulaştın! 🎉 Ayarlar\'dan yeni hedef belirleyebilirsin.');
    return '<section class="card nudge"><div class="n-ic">' + emoji + '</div><div class="grow"><p>' + lines[0] + '</p>' + lines.slice(1).map(function (l) { return '<p class="small">' + l + '</p>'; }).join('') + '</div></section>';
  }
  function adaptiveCard() {
    var a = adaptiveEstimate();
    if (!a || a.notEnough) return '';
    if (Math.abs(a.suggested - state.targets.kcal) < 100) return '';
    if (Date.now() - state.adaptive.dismissedAt < 7 * 864e5) return '';
    return '<section class="card tint"><div class="row" style="align-items:flex-start"><div class="n-ic" style="width:36px;height:36px;border-radius:12px;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--primary-600)">' + icon('sparkle', 'ic-sm') + '</div>' +
      '<div class="grow"><b>Akıllı hedef önerisi</b><p class="small" style="margin:4px 0 10px">Son ' + a.days + ' kayıtlı günde ortalama <b>' + fmt(a.avgIn) + ' kcal</b> yedin ve trend kilon ' + (a.change <= 0 ? fmt(-a.change, 1) + ' kg azaldı' : fmt(a.change, 1) + ' kg arttı') +
      '. Buna göre gerçek harcaman ~<b>' + fmt(a.tdee) + ' kcal</b>. Günlük hedefini <b>' + fmt(a.suggested) + ' kcal</b> yapalım mı?' +
      (state.manual.on ? ' <span class="muted">Şu an kendi belirlediğin ' + fmt(state.manual.kcal) + ' kcal geçerli; sen onaylamadıkça değişmez.</span>' : '') + '</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-sm" data-action="adaptive-no">Şimdi değil</button><button type="button" class="btn btn-primary btn-sm" data-action="adaptive-yes" data-v="' + a.suggested + '">Uygula</button></div></div></div></section>';
  }

  /* ----------------------------- İlerleme ----------------------------- */
  function renderProgress() {
    var view = $('#view'), st = streak();
    var dots = '';
    for (var i = 13; i >= 0; i--) dots += '<i class="' + (isLoggedDay(addDays(todayKey(), -i)) ? 'on' : '') + '" title="' + fmtShort(addDays(todayKey(), -i)) + '"></i>';
    var html = '<h1 class="page-title">İlerleme</h1>' +
      '<section class="card streak"><div class="flame">' + icon('flame') + '</div><div class="grow"><b>' + st + ' gün</b><span class="muted small">' + (st ? 'üst üste kayıt serisi' : 'Bugün bir kayıt ekleyerek seriyi başlat') + '</span>' +
      '<div class="streak-dots" aria-label="Son 14 gün">' + dots + '</div></div></section>';
    var r = state.ui.wRange;
    html += '<section class="card"><div class="card-head"><h3 class="card-title">Kilo</h3><div class="seg" style="width:200px">' +
      [['1H', '1H'], ['1A', '1A'], ['3A', '3A'], ['T', 'Tümü']].map(function (x) { return '<button type="button" class="' + (r === x[0] ? 'on' : '') + '" data-action="wrange" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div id="wchart" class="chart-box"></div><div class="row small muted" style="gap:14px;margin-top:8px;flex-wrap:wrap"><span class="row" style="gap:6px"><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Tartı</span><span class="row" style="gap:6px"><svg width="18" height="10"><path d="M1 5h16" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/></svg>Trend</span><span class="row" style="gap:6px"><svg width="18" height="10"><path d="M1 5h16" stroke="var(--primary-600)" stroke-width="1.5" stroke-dasharray="4 3"/></svg>Hedef</span></div></section>';
    var cr = state.ui.calRange;
    html += '<section class="card"><div class="card-head"><h3 class="card-title">Kalori</h3><div class="seg" style="width:170px">' +
      [[7, '7 gün'], [30, '30 gün']].map(function (x) { return '<button type="button" class="' + (cr === x[0] ? 'on' : '') + '" data-action="crange" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div id="cchart" class="chart-box"></div><div id="cdetail"></div><div id="cavg" class="small muted" style="margin-top:8px"></div></section>';
    html += '<section class="card"><h3 class="card-title" style="margin-bottom:6px">Haftalık ortalama</h3>' + weeklyRows() + '</section>';
    html += '<section class="card"><h3 class="card-title" style="margin-bottom:10px">Makro dağılımı <span class="small muted">· son 7 gün</span></h3><div class="row" style="gap:18px"><div id="donut"></div><div class="legend" id="mlegend"></div></div></section>';
    view.innerHTML = html;
    mountProgressCharts();
  }
  function rangeFrom(r) {
    var t = todayKey();
    if (r === '1H') return addDays(t, -6);
    if (r === '1A') return addDays(t, -29);
    if (r === '3A') return addDays(t, -89);
    return null;
  }
  function weightChart(el, range) {
    var from = rangeFrom(range), tr = trendSeries();
    var inR = tr.filter(function (p) { return !from || p.date >= from; });
    C.line(el, {
      points: inR.map(function (p) { return { date: p.date, y: toDisp(p.y) }; }),
      trend: inR.map(function (p) { return { date: p.date, y: toDisp(p.t) }; }),
      goal: state.profile ? toDisp(state.profile.goal) : null, from: from, to: inR.length ? todayKey() : null,
      fmt: function (v) { return fmt(v, 1) + ' ' + wU(); }, emptyText: from ? 'Bu aralıkta tartı yok' : 'Henüz kilo kaydı yok'
    });
  }
  function mountProgressCharts() {
    var wEl = $('#wchart'); if (!wEl) return;
    weightChart(wEl, state.ui.wRange);
    var n = state.ui.calRange, data = [], t = todayKey();
    for (var i = n - 1; i >= 0; i--) {
      var k = addDays(t, -i), d = parseKey(k);
      data.push({ key: k, label: n <= 7 ? DAYS_S[d.getDay()] : String(d.getDate()), value: dayTotals(k).kcal });
    }
    var cEl = $('#cchart');
    C.bars(cEl, {
      data: data, target: state.targets.kcal, selected: calSel != null && calSel < data.length ? calSel : null,
      onSelect: function (i) { calSel = i; mountProgressCharts(); }
    });
    var det = $('#cdetail');
    if (calSel != null && data[calSel]) {
      var dd = data[calSel], diff = dd.value - state.targets.kcal;
      det.innerHTML = '<div class="day-detail"><div class="grow"><b>' + fmtLong(dd.key) + '</b><div class="small muted">' + fmt(dd.value) + ' kcal · ' +
        (dd.value ? (diff > 0 ? '+' + fmt(diff) + ' hedefin üstünde' : fmt(-diff) + ' hedefin altında') : 'kayıt yok') + '</div></div><button type="button" class="btn btn-soft btn-sm" data-action="open-day" data-k="' + dd.key + '">Günü aç</button></div>';
    } else det.innerHTML = '';
    var logged = data.filter(function (x) { return x.value > 0; });
    $('#cavg').innerHTML = logged.length ? 'Kayıtlı ' + logged.length + ' günün ortalaması: <b>' + fmt(logged.reduce(function (a, x) { return a + x.value; }, 0) / logged.length) + ' kcal</b> · Çubuğa dokun, günün detayını gör.' : '';
    // Makro
    var sum = { p: 0, c: 0, f: 0 }, days = 0;
    for (var j = 0; j < 7; j++) { var kk = addDays(t, -j); if (hasLog(kk)) { var tt = dayTotals(kk); sum.p += tt.p; sum.c += tt.c; sum.f += tt.f; days++; } }
    var kp = sum.p * 4, kc = sum.c * 4, kf = sum.f * 9, tot = kp + kc + kf, tg = state.targets, tgt = tg.p * 4 + tg.c * 4 + tg.f * 9;
    var cs = getComputedStyle(document.documentElement);
    C.donut($('#donut'), {
      size: 128, thickness: 16,
      segments: [{ value: kp, color: cs.getPropertyValue('--protein').trim() }, { value: kc, color: cs.getPropertyValue('--carb').trim() }, { value: kf, color: cs.getPropertyValue('--fat').trim() }],
      center: days ? [fmt(tot / days), 'kcal/gün'] : ['–', 'veri yok']
    });
    function row(lbl, color, k, g, tk) {
      return '<div class="legend-row"><i style="background:' + color + '"></i><span>' + lbl + '</span><b>' + (tot ? '%' + Math.round(k / tot * 100) : '–') + '</b></div>' +
        '<div class="legend-sub">' + (days ? fmt(g / days) + ' g/gün · ' : '') + 'hedef %' + Math.round(tk / tgt * 100) + '</div>';
    }
    $('#mlegend').innerHTML = row('Protein', 'var(--protein)', kp, sum.p, tg.p * 4) + row('Karbonhidrat', 'var(--carb)', kc, sum.c, tg.c * 4) + row('Yağ', 'var(--fat)', kf, sum.f, tg.f * 9);
  }
  function weeklyRows() {
    var t = parseKey(todayKey()), dow = (t.getDay() + 6) % 7; // Pazartesi = 0
    var monday = addDays(todayKey(), -dow), rows = '', target = state.targets.kcal, any = false;
    for (var w = 0; w < 6; w++) {
      var start = addDays(monday, -7 * w), sum = 0, n = 0;
      for (var i = 0; i < 7; i++) { var k = addDays(start, i); if (k > todayKey()) break; if (hasLog(k)) { sum += dayTotals(k).kcal; n++; } }
      var avg = n ? sum / n : 0;
      if (n) any = true;
      var pct = Math.min(100, avg / (target * 1.3) * 100);
      rows += '<div class="week-row"><span class="small">' + fmtShort(start) + ' – ' + fmtShort(addDays(start, 6)) + (w === 0 ? ' <span class="faint">(bu hafta)</span>' : '') + '</span>' +
        '<div class="bar' + (avg > target * 1.05 ? ' over' : '') + '" title="' + n + ' gün"><i style="width:' + pct.toFixed(1) + '%;background:var(--primary)"></i></div><b class="small">' + (n ? fmt(avg) : '–') + '</b></div>';
    }
    if (!any) return '<div class="chart-empty" style="height:110px">' + icon('calendar') + '<span>Kayıt ekledikçe haftalık ortalamalar burada görünür</span></div>';
    return rows + '<div class="tiny faint" style="margin-top:6px">Yalnızca kayıt girilen günler ortalamaya katılır. Hedef: ' + fmt(target) + ' kcal</div>';
  }

  /* ------------------------------- Kilo ------------------------------- */
  function renderWeight() {
    var view = $('#view'), tr = trendSeries(), pr = state.profile;
    var cw = currentWeight(), last = tr[tr.length - 1];
    var rate = trendRate(), fc = goalForecast(), bmi = bmiInfo(cw);
    var start = tr.length ? tr[0].y : pr.weight, startDate = tr.length ? tr[0].date : pr.startDate, lost = start - cw, toGo = cw - pr.goal;
    var pct = start !== pr.goal ? clamp((start - cw) / (start - pr.goal) * 100, 0, 100) : 100;
    var html = '<h1 class="page-title">Kilo</h1>';
    html += '<section class="card"><div class="weight-hero"><div><div class="small muted" style="font-weight:650">Trend kilo</div><div class="wh-big">' + fmt(toDisp(cw), 1) + '<small> ' + wU() + '</small></div>' +
      (last ? '<div class="small muted">Son tartı: ' + fmtW(last.y) + ' · ' + fmtShort(last.date) + '</div>' : '') + '</div>' +
      (rate != null ? '<span class="delta ' + (rate <= 0 ? 'down' : 'up') + '">' + (rate <= 0 ? '↓ ' : '↑ ') + fmt(Math.abs(toDisp(rate * 7)), 2) + ' ' + wU() + '/hafta</span>' : '') + '</div>' +
      '<div class="progress-goal"><div class="row-between small muted" style="margin-bottom:6px"><span>' + fmtW(start) + '</span><span>%' + Math.round(pct) + '</span><span>Hedef ' + fmtW(pr.goal) + '</span></div><div class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' +
      '<p class="tiny faint" style="margin:10px 0 0">Trend kilo, günlük dalgalanmaları (su, tuz, sindirim) yumuşatan üstel ortalamadır; asıl ilerlemeni gösterir.</p></section>';
    var fcText = !fc ? '–' : fc.reached ? 'Ulaştın 🎉' : fc.date ? fmtShort(keyOf(fc.date)) + ' ' + fc.date.getFullYear() : fc.needData ? 'Veri az' : fc.wrongWay ? 'Trend ters' : '3+ yıl';
    var fcSub = !fc ? '' : fc.date ? '~' + Math.round(fc.days / 7) + ' hafta' : fc.needData ? 'En az 1 haftalık tartı' : fc.wrongWay ? 'Trend yükselişte' : '';
    html += '<div class="stat-grid"><div class="stat hl"><span>' + (pr.goal > start ? 'Toplam alınan' : 'Toplam verilen') + '</span><b>' + ((pr.goal > start ? -lost : lost) >= 0 ? '' : '−') + fmt(Math.abs(toDisp(lost)), 1) + ' ' + wU() + '</b><small>' + fmtShort(startDate) + ' tarihinden beri</small></div>' +
      '<div class="stat"><span>Hedefe kalan</span><b>' + (Math.abs(toGo) >= 0.3 && (toGo > 0) === (start > pr.goal) ? fmt(Math.abs(toDisp(toGo)), 1) + ' ' + wU() : '0 🎉') + '</b><small>hedef ' + fmtW(pr.goal) + '</small></div>' +
      '<div class="stat"><span>VKİ</span><b>' + (bmi ? fmt(bmi.bmi, 1) : '–') + '</b><small>' + (bmi ? bmi.cat : '') + '</small></div>' +
      '<div class="stat"><span>Tahmini hedef tarihi</span><b style="font-size:19px">' + fcText + '</b><small>' + fcSub + '</small></div></div>';
    html += '<section class="card"><h3 class="card-title" style="margin-bottom:12px">Tartı ekle</h3><form id="wform" autocomplete="off">' +
      '<div class="grid-2"><label class="field"><span>Kilo</span><div class="input-unit"><input class="input" name="kg" inputmode="decimal" placeholder="' + (last ? fmt(toDisp(last.y), 1) : '') + '" required><em>' + wU() + '</em></div></label>' +
      '<label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="' + todayKey() + '" max="' + todayKey() + '"></label></div>' +
      '<label class="field"><span>Bel çevresi (isteğe bağlı)</span><div class="input-unit"><input class="input" name="waist" inputmode="decimal" placeholder="örn. 92"><em>cm</em></div></label>' +
      '<button class="btn btn-primary btn-block" type="submit">' + icon('check') + 'Kaydet</button></form></section>';
    html += '<section class="card"><div class="card-head"><h3 class="card-title">Son 30 gün</h3></div><div id="wmini" class="chart-box"></div></section>';
    if (state.waists.length) {
      var wl = state.waists, wf = wl[0], wlst = wl[wl.length - 1];
      html += '<section class="card"><div class="card-head"><h3 class="card-title">Bel çevresi</h3><b class="num">' + fmt(wlst.cm, 1) + ' cm</b></div>' +
        '<div class="small muted">' + (wl.length > 1 ? 'Başlangıçtan beri ' + (wlst.cm <= wf.cm ? '−' : '+') + fmt(Math.abs(wlst.cm - wf.cm), 1) + ' cm (' + fmtShort(wf.date) + ' → ' + fmtShort(wlst.date) + ')' : fmtShort(wlst.date) + ' tarihinde kaydedildi') + '</div>' +
        (pr && wlst.cm ? '<div class="tiny faint" style="margin-top:6px">Bel/boy oranı: ' + fmt(wlst.cm / pr.height, 2) + ' (0,5 altı genelde sağlıklı kabul edilir)</div>' : '') + '</section>';
    }
    html += '<div class="section-title">Geçmiş</div><section class="card" style="padding:4px 12px">';
    if (!tr.length) html += '<div class="empty-state"><div class="es-ic">' + icon('scale') + '</div><b>Henüz tartı yok</b>Yukarıdan ilk kaydını ekle.</div>';
    else {
      var waistBy = {}; state.waists.forEach(function (w) { waistBy[w.date] = w.cm; });
      html += '<ul class="list">' + tr.slice().reverse().slice(0, 60).map(function (p, i, arr) {
        var prev = arr[i + 1], d = prev ? p.y - prev.y : null;
        return '<li class="list-row"><div class="lr-main"><div class="lr-title">' + fmtW(p.y) + (waistBy[p.date] ? ' <span class="faint small">· bel ' + fmt(waistBy[p.date], 1) + ' cm</span>' : '') + '</div><div class="lr-sub">' + fmtLong(p.date) + ' · trend ' + fmtW(p.t) + '</div></div>' +
          (d != null ? '<span class="small ' + (d <= 0 ? '' : 'faint') + '" style="color:' + (d <= 0 ? 'var(--primary-600)' : '') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + fmt(Math.abs(toDisp(d)), 1) + '</span>' : '') +
          '<button type="button" class="icon-btn danger" data-action="weight-del" data-k="' + p.date + '" aria-label="Sil">' + icon('trash', 'ic-sm') + '</button></li>';
      }).join('') + '</ul>';
    }
    html += '</section>';
    view.innerHTML = html;
    weightChart($('#wmini'), '1A');
    $('#wform').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var v = parseNum(fd.get('kg')), date = String(fd.get('date') || todayKey()), waist = parseNum(fd.get('waist'));
      if (!isValidKey(date) || date > todayKey()) date = todayKey();
      var hasW = isFinite(v), hasB = isFinite(waist);
      if (!hasW && !hasB) { toast('Bir kilo değeri gir.'); return; }
      if (hasW) {
        var kg = fromDisp(v);
        if (kg < 25 || kg > 400) { toast('Geçerli bir kilo gir.'); return; }
        addWeight(date, kg);
      }
      if (hasB) {
        if (waist < 30 || waist > 250) { toast('Geçerli bir bel ölçüsü gir (cm).'); return; }
        state.waists = state.waists.filter(function (w) { return w.date !== date; });
        state.waists.push({ date: date, cm: round1(waist) });
        state.waists.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        save();
      }
      haptic(); render();
      toast(hasW ? 'Tartı kaydedildi · trend ' + fmtW(currentWeight()) : 'Bel ölçüsü kaydedildi');
    });
  }
  function addWeight(date, kg) {
    state.weights = state.weights.filter(function (w) { return w.date !== date; });
    state.weights.push({ date: date, kg: Math.round(kg * 100) / 100 });
    state.weights.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    refreshTargets(); save(); notifySync();
  }

  /* ------------------------------- Koç -------------------------------- */
  var Z = window.ZCoach || null;
  var coach = Z ? Z.loadSettings() : { provider: 'anthropic', key: '', model: 'fast', mode: '' };
  var coachChat = Z ? Z.loadChat() : [];
  var coachBusy = false, coachDraft = '';
  var COACH_QS = ['Bugün nasıl gidiyorum?', 'Akşam ne yesem?', 'Bu hafta neden kilo vermedim?', 'Bana motivasyon ver'];

  function coachMode() { return coach.mode || (coach.key ? 'chat' : 'app'); }
  function coachChatReady() { return !!(Z && coach.key && coachMode() === 'chat'); }
  function coachProvider() { return Z.provider(coach.provider); }
  function coachModelId() { var pv = coachProvider(); return (pv.models[coach.model] || pv.models.fast).id; }

  /** Koça giden kısa veri özeti (token tasarrufu için sıkıştırılmış) */
  function coachContext() {
    var pr = state.profile, tg = state.targets, today = todayKey(), now = new Date();
    var day = dayOf(today), t = totalsOf(day.entries);
    var r0 = function (x) { return Math.round(x); };
    var last14 = [], start14 = addDays(today, -14);
    for (var i = 0; i < 14; i++) { var k = addDays(start14, i); last14.push(hasLog(k) ? r0(dayTotals(k).kcal) : null); }
    var from30 = addDays(today, -30);
    var tr = trendSeries().filter(function (p) { return p.date >= from30; });
    var rate = trendRate(), fc = goalForecast(), cw = currentWeight();
    return {
      simdi: today + ' ' + DAYS[now.getDay()] + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
      profil: { cinsiyet: pr.sex === 'e' ? 'erkek' : 'kadın', yas: pr.age, boy_cm: pr.height, baslangic_kg: pr.weight, hedef_kg: pr.goal, aktivite: activityOf(pr.activity).label, hedef_hiz_kg_hafta: pr.pace, baslangic_tarihi: pr.startDate },
      gunluk_hedef: Object.assign({ kcal: tg.kcal, protein_g: tg.p, karb_g: tg.c, yag_g: tg.f }, tg.manual ? { kullanici_belirledi: true, onerilen_kcal: recommendedKcal(), onerilen_alt_sinirin_altinda: tg.kcal < kcalFloor(pr.sex) } : {}),
      bugun: {
        alinan: { kcal: r0(t.kcal), protein_g: r0(t.p), karb_g: r0(t.c), yag_g: r0(t.f) },
        kalan_kcal: r0(tg.kcal - t.kcal), su_bardak: day.water || 0,
        kayitlar: day.entries.slice(0, 30).map(function (e) { return [MEAL_BY[e.meal] ? MEAL_BY[e.meal].label : e.meal, e.name, e.grams ? r0(e.grams) + ' g' : portionText(e), e.kcal]; })
      },
      son_14_gun_kcal: { ilk_gun: start14, degerler: last14, not: 'null = kayıt yok' },
      kilo: {
        son_30_gun: tr.map(function (p) { return [p.date.slice(5), round1(p.y)]; }),
        trend_kg: cw == null ? null : round1(cw),
        haftalik_degisim_kg: rate == null ? null : Math.round(rate * 7 * 100) / 100,
        hedefe_tahmini_tarih: fc && fc.date ? keyOf(fc.date) : null
      },
      seri_gun: streak()
    };
  }

  function coachFmt(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  function coachCardHtml(m, c) {
    var it = c.item, meal = MEAL_BY[it.meal] ? MEAL_BY[it.meal].label : 'Ara öğün';
    var foot = c.status === 'added' ? '<span class="badge ok">' + icon('check', 'ic-sm') + 'Eklendi</span>'
      : c.status === 'skipped' ? '<span class="tiny faint">Vazgeçildi</span>'
        : '<div class="btn-row"><button type="button" class="btn btn-sm" data-action="coach-skip" data-m="' + esc(m.id) + '" data-c="' + esc(c.id) + '">Vazgeç</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="coach-add" data-m="' + esc(m.id) + '" data-c="' + esc(c.id) + '">' + icon('plus', 'ic-sm') + 'Ekle</button></div>';
    return '<div class="coach-card' + (c.status ? ' ' + c.status : '') + '"><div class="cc-top"><div class="grow"><b>' + esc(it.name) + '</b><small>' +
      (it.grams ? fmt(it.grams) + ' g · ' : '') + meal + (it.day === 'dun' ? ' · dün' : '') + '</small>' +
      '<small>P ' + fmt(it.p) + ' g · K ' + fmt(it.c) + ' g · Y ' + fmt(it.f) + ' g</small></div><div class="cc-kcal">' + fmt(it.kcal) + '<small>kcal</small></div></div>' + foot + '</div>';
  }

  function coachMsgHtml(m) {
    if (m.role === 'user') return '<div class="msg user"><div class="bubble">' + coachFmt(m.text) + '</div></div>';
    if (m.error) {
      return '<div class="msg bot err" role="alert"><div class="bubble">' + coachFmt(m.text) + '</div><div class="msg-actions">' +
        '<button type="button" class="link-btn" data-action="coach-retry">Tekrar dene</button>' +
        (m.code === 'auth' || m.code === 'credit' || m.code === 'forbidden' || m.code === 'model' ? '<button type="button" class="link-btn" data-action="coach-settings">Ayarlar</button>' : '') + '</div></div>';
    }
    return '<div class="msg bot"><div class="bubble">' + coachFmt(m.text) + '</div>' + (m.cards || []).map(function (c) { return coachCardHtml(m, c); }).join('') + '</div>';
  }

  function renderCoach() {
    var view = $('#view'), mode = coachMode();
    var html = '<h1 class="page-title">Koç</h1>';
    if (!Z) { view.innerHTML = html + '<div class="card warn small">Koç modülü yüklenemedi. Sayfayı yenilemeyi dene.</div>'; return; }
    html += '<div class="seg coach-seg" role="tablist">' + [['app', 'Claude uygulaması'], ['chat', 'Uygulama içi sohbet']].map(function (x) {
      return '<button type="button" role="tab" aria-selected="' + (mode === x[0]) + '" class="' + (mode === x[0] ? 'on' : '') + '" data-action="coach-mode" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    var chips = '<div class="chips coach-chips">' + COACH_QS.map(function (q) { return '<button type="button" class="chip soft" data-action="coach-chip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>';

    if (mode === 'app') {
      html += '<section class="card coach-app"><div class="banner" style="margin-bottom:12px"><div class="n-ic">' + icon('sparkle') + '</div><div class="grow"><b>Claude aboneliğinle ücretsiz sor</b>' +
        '<small>Sorun ve verilerinin kısa özeti hazırlanır. Claude uygulaması açılınca gönder ya da yapıştır.</small></div></div>' +
        '<label class="field" style="margin-bottom:8px"><span>Sorun (isteğe bağlı)</span><textarea id="coach-q-app" class="input" rows="2" placeholder="örn. Akşam ne yesem?">' + esc(coachDraft) + '</textarea></label>' +
        chips +
        '<button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:8px" data-action="coach-ask-app">' + icon('sparkle') + 'Claude uygulamasında sor</button></section>' +
        '<div class="hint">Paylaş menüsü açılırsa <b>Claude</b>\'u seç. Menü açılmazsa claude.ai açılır; mesaj kutusuna uzun basıp <b>Yapıştır</b> de ve gönder.</div>' +
        '<div class="hint">Bu modda koç yemekleri senin yerine ekleyemez. Koçun uygulama içinde cevap vermesini ve yediklerini kaydetmesini istersen <b>Uygulama içi sohbet</b>\'i kullan (API anahtarı gerekir).</div>';
      view.innerHTML = html;
      return;
    }

    if (!coach.key) {
      html += '<div class="card"><div class="empty-state"><div class="es-ic">' + icon('key') + '</div><b>Uygulama içi sohbet için API anahtarı gerekli</b>' +
        '<div class="small">Koç, Anthropic API anahtarınla çalışır; kullandıkça az bir ücret kesilir. Anahtarı Ayarlar → Yapay Zeka Koçu bölümüne yapıştırman yeterli.</div></div>' +
        '<button type="button" class="btn btn-primary btn-block" data-action="coach-settings">Ayarlara git</button>' +
        '<button type="button" class="btn btn-soft btn-block" style="margin-top:10px" data-action="coach-mode" data-v="app">Claude aboneliğimle ücretsiz sor</button></div>';
      view.innerHTML = html;
      return;
    }

    var pv = coachProvider(), md = pv.models[coach.model] || pv.models.fast;
    html += '<div class="row-between coach-head"><span class="tiny faint">' + esc(md.label) + ' · ' + esc(md.id) + '</span>' +
      (coachChat.length ? '<button type="button" class="link-btn" data-action="coach-clear">' + icon('trash', 'ic-sm') + 'Sohbeti temizle</button>' : '') + '</div>';
    html += '<div class="coach-log" id="coach-log" aria-live="polite">';
    if (!coachChat.length) {
      html += '<div class="msg bot"><div class="bubble">Merhaba! Ben koçun. Bugünkü kayıtlarına, son günlerine ve kilo trendine bakarak cevap veririm. Yediğini yazarsan (ör. “öğlen bir tabak karnıyarık yedim”) kaydetmeyi de önerebilirim.</div></div>';
    }
    html += coachChat.map(coachMsgHtml).join('');
    if (coachBusy) html += '<div class="msg bot"><div class="bubble typing" aria-label="Koç yazıyor"><i></i><i></i><i></i></div></div>';
    html += '</div>' + chips;
    view.innerHTML = html;
    requestAnimationFrame(function () { window.scrollTo(0, document.documentElement.scrollHeight); });
  }

  function coachSend(text) {
    text = String(text || '').trim();
    if (!text || coachBusy || !Z) return;
    if (!coach.key) { toast(esc(Z.MESSAGES.nokey)); return; }
    coachChat.push({ id: uid(), role: 'user', text: text.slice(0, 2000), ts: Date.now() });
    Z.saveChat(coachChat);
    coachRequest();
  }

  function coachRequest() {
    var msgs = Z.toApiMessages(coachChat, 14);
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return;
    var last = msgs[msgs.length - 1];
    var ctx = '';
    try { ctx = JSON.stringify(coachContext()); } catch (e) { ctx = '{}'; }
    last.text = '<veriler>\n' + ctx + '\n</veriler>\n\n' + last.text;
    coachBusy = true; render();
    var pv = coachProvider();
    var p;
    try {
      p = pv.chat({ key: coach.key, model: coachModelId(), system: Z.systemPrompt(true), messages: msgs, tools: Z.TOOLS, maxTokens: 2048 });
    } catch (e) { p = Promise.reject(e); }
    p.then(function (res) {
      var cards = [];
      res.toolCalls.forEach(function (tc) {
        if (tc.name !== 'log_food') return;
        var item = Z.cleanFoodCall(tc.input, guessMeal());
        if (item) cards.push({ id: uid(), item: item, status: '' });
      });
      var text = res.text || (cards.length ? (cards.length > 1 ? 'Bunları günlüğüne ekleyeyim mi?' : 'Bunu günlüğüne ekleyeyim mi?') : 'Şu an bir cevap üretemedim, soruyu biraz farklı sorar mısın?');
      if (res.stop === 'length') text += ' …';
      coachChat.push({ id: uid(), role: 'assistant', text: text, ts: Date.now(), cards: cards });
    }).catch(function (err) {
      if (err && err.code === 'aborted') return;
      if (!(err && err.name === 'CoachError')) console.error(err);
      var code = (err && err.code) || 'unknown';
      coachChat.push({ id: uid(), role: 'assistant', error: true, code: code, text: (Z.MESSAGES[code] || Z.MESSAGES.unknown), ts: Date.now() });
    }).then(function () {
      coachBusy = false;
      Z.saveChat(coachChat);
      if (route === 'koc') render();
    });
  }

  function coachRetry() {
    if (coachBusy) return;
    while (coachChat.length && coachChat[coachChat.length - 1].error) coachChat.pop();
    Z.saveChat(coachChat);
    if (coachChat.length && coachChat[coachChat.length - 1].role === 'user') coachRequest(); else render();
  }

  function coachCard(el, add) {
    var mid = el.getAttribute('data-m'), cid = el.getAttribute('data-c');
    var m = coachChat.filter(function (x) { return x.id === mid; })[0];
    var c = m && (m.cards || []).filter(function (x) { return x.id === cid; })[0];
    if (!c || c.status) return;
    c.status = add ? 'added' : 'skipped';
    Z.saveChat(coachChat);
    if (!add) { render(); return; }
    var it = c.item, g = it.grams;
    var k = it.day === 'dun' ? addDays(todayKey(), -1) : todayKey();
    addItems(k, it.meal, [{ foodId: null, name: it.name, qty: g || 1, unit: g ? 'g' : 'porsiyon', unitG: g ? 1 : 0, grams: g, kcal: it.kcal, p: it.p, c: it.c, f: it.f, quick: !g }]);
  }

  /** Ücretsiz yol: istemi kopyala, Android paylaşım menüsünü aç (Claude uygulaması), yoksa claude.ai */
  function copyTextSync(text) {
    var ok = false, ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    try { ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function coachAskApp() {
    if (!Z) return;
    var ta = $('#coach-q-app'); if (ta) coachDraft = ta.value;
    var text;
    try { text = Z.clipboardPrompt(JSON.stringify(coachContext()), coachDraft); } catch (e) { console.error(e); toast('Özet hazırlanamadı.'); return; }
    var copied = copyTextSync(text);
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { copied = true; }, function () { /* eşzamanlı kopya yeterli */ }); } catch (e) { /* yok */ }
    function openWeb() {
      var w = null;
      try { w = window.open('https://claude.ai/new', '_blank', 'noopener'); } catch (e) { w = null; }
      if (copied || (navigator.clipboard && navigator.clipboard.writeText)) toast('Kopyalandı, Claude\'a yapıştır', { ms: 5000 });
      else showCopySheet(text);
      return w;
    }
    if (navigator.share) {
      navigator.share({ text: text }).then(function () { toast('Gönderildi. Claude\'da gönder tuşuna bas.'); }, function (err) {
        if (err && err.name === 'AbortError') { if (copied) toast('Kopyalandı. İstersen Claude\'a yapıştırabilirsin.'); return; }
        openWeb();
      });
    } else openWeb();
  }
  function showCopySheet(text) {
    var s = openSheet({ title: 'Metni kopyala' });
    s.setBody('<p class="small muted" style="margin:0 0 8px">Otomatik kopyalanamadı. Metne uzun basıp tümünü seç, kopyala ve Claude\'a yapıştır.</p><textarea class="input" rows="10" readonly>' + esc(text) + '</textarea>');
  }

  /* Ayarlar bölümü */
  function coachSettingsHtml() {
    if (!Z) return '';
    var pv = coachProvider();
    var html = '<div class="section-title" id="coach-settings">Yapay Zeka Koçu</div><section class="card">';
    if (coach.key) {
      html += '<div class="settings-row"><div class="grow"><b>API anahtarı</b><small class="num" id="coach-key-mask">' + esc(Z.maskKey(coach.key)) + ' · yalnızca bu telefonda</small></div>' +
        '<button type="button" class="btn btn-sm" style="color:var(--danger)" data-action="coach-key-del">' + icon('trash', 'ic-sm') + 'Sil</button></div>' +
        '<button type="button" class="btn btn-block" style="margin:10px 0 4px" data-action="coach-test" id="coach-test">' + icon('check', 'ic-sm') + 'Bağlantıyı test et</button>';
    } else {
      html += '<label class="field" style="margin-bottom:8px"><span>Anthropic API anahtarı</span><div class="row"><input id="coach-key" class="input grow" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(pv.keyHint) + '" aria-label="API anahtarı">' +
        '<button type="button" class="btn btn-primary" data-action="coach-key-save">Kaydet</button></div></label>';
    }
    html += '<div class="settings-row"><div class="grow"><b>Model</b><small>' + esc((pv.models[coach.model] || pv.models.fast).sub) + '</small></div></div>' +
      '<div class="seg" style="margin-bottom:12px">' + [['fast', pv.models.fast.label], ['smart', pv.models.smart.label]].map(function (x) {
        return '<button type="button" class="' + (coach.model === x[0] ? 'on' : '') + '" data-action="coach-model" data-v="' + x[0] + '">' + esc(x[1]) + '</button>';
      }).join('') + '</div>';
    html += '<div class="hint"><b>Anahtar nasıl alınır?</b><ol class="coach-steps"><li><b>console.anthropic.com</b> adresine gir, hesap aç.</li><li><b>Billing</b> bölümünden kredi yükle (5$ uzun süre yeter).</li><li><b>API Keys</b> → <b>Create Key</b>\'e dokun.</li><li>Anahtarı kopyala, buraya yapıştır ve Kaydet\'e bas.</li></ol></div>' +
      '<div class="hint">🔒 Anahtar yalnızca bu telefonda saklanır, yedek dosyasına eklenmez ve sadece Anthropic\'e gönderilir. Koçla konuşurken bugünkü kayıtların, son 14 günün kalorileri ve kilo özetin de cevap için Anthropic\'e gönderilir.</div>' +
      '<div class="hint">Claude aboneliği (claude.ai) API anahtarı yerine geçmez. Aboneliğinle ücretsiz kullanmak için Koç sekmesindeki <b>Claude uygulamasında sor</b> düğmesini kullan.</div></section>';
    return html;
  }

  function coachSaveKey() {
    var i = $('#coach-key'); if (!i) return;
    var v = i.value.replace(/\s+/g, '');
    if (!v) { toast('Önce anahtarı yapıştır.'); i.focus(); return; }
    if (!/^sk-/.test(v)) { toast('Bu bir API anahtarına benzemiyor; “sk-ant-” ile başlamalı.', { ms: 5000 }); return; }
    coach.key = v; coach.mode = 'chat';
    if (!Z.saveSettings(coach)) { toast('Anahtar kaydedilemedi: tarayıcı depolaması kapalı.'); return; }
    render();
    toast('Anahtar kaydedildi. “Bağlantıyı test et” ile deneyebilirsin.', { ms: 4500 });
  }

  function coachTestKey() {
    if (!coach.key || coachBusy) return;
    var b = $('#coach-test');
    if (b) { b.disabled = true; b.textContent = 'Test ediliyor…'; }
    var p;
    try { p = coachProvider().chat({ key: coach.key, model: coachModelId(), system: 'Kısa cevap ver.', messages: [{ role: 'user', text: 'Merhaba, tek kelimeyle cevap ver.' }], maxTokens: 64 }); }
    catch (e) { p = Promise.reject(e); }
    p.then(function () { toast('Bağlantı başarılı ✓ Koç hazır.'); }, function (err) {
      toast(esc((err && err.name === 'CoachError' && err.message) || Z.MESSAGES.unknown), { ms: 7000 });
    }).then(function () { if (route === 'ayarlar') render(); });
  }

  /* ------------------------------ Ayarlar ----------------------------- */
  function renderSettings() {
    var view = $('#view'), pr = state.profile, tg = state.targets, rm = state.reminders, s = state.settings;
    var perm = N ? N.permission() : 'unsupported';
    var html = '<h1 class="page-title">Ayarlar</h1>';
    html += '<div class="section-title">Profil ve hedef</div><section class="card">' +
      '<div class="settings-row"><div class="grow"><b>' + (pr.sex === 'e' ? 'Erkek' : 'Kadın') + ', ' + pr.age + ' yaş, ' + pr.height + ' cm</b><small>' + activityOf(pr.activity).label + ' · haftada ' + fmt(pr.pace, 2) + ' kg</small></div><button type="button" class="btn btn-soft btn-sm" data-action="edit-profile">Düzenle</button></div>' +
      '<div class="settings-row"><div class="grow"><b>' + fmtW(pr.weight) + ' → ' + fmtW(pr.goal) + '</b><small>Başlangıç → hedef kilo</small></div></div>' +
      '<div class="settings-row"><div class="grow"><b>Günlük ' + fmt(tg.kcal) + ' kcal' + (tg.manual ? ' <span class="badge ok">elle</span>' : '') + '</b><small>Protein ' + tg.p + ' g · Karbonhidrat ' + tg.c + ' g · Yağ ' + tg.f + ' g' + (tg.tdee && !tg.manual ? ' · TDEE ' + fmt(tg.tdee) : '') + '</small></div></div>' +
      '<div class="settings-row"><div class="grow"><b>Hedefi kendim belirleyeceğim</b><small id="rec-kcal">Önerilen: ' + fmt(recommendedKcal()) + ' kcal</small></div>' +
      '<label class="switch"><input type="checkbox" data-manual="on" ' + (state.manual.on ? 'checked' : '') + ' aria-label="Hedefi kendim belirleyeceğim"><i></i></label></div>';
    if (state.manual.on) {
      var mh = manualHint(state.manual.kcal, pr.sex);
      html += '<div class="manual-box"><label class="field"><span>Günlük kalori hedefim</span><div class="input-unit"><input class="input big-input" id="manual-kcal" data-manual="kcal" inputmode="numeric" pattern="[0-9]*" value="' + state.manual.kcal + '"><em>kcal</em></div></label>' +
        '<div id="manual-warn" class="hint warn" ' + (mh.html ? '' : 'hidden') + '>' + mh.html + '</div>' +
        '<button type="button" class="btn btn-primary btn-block" style="margin-top:10px" data-action="manual-save">Hedefi kaydet</button>' +
        '<p class="tiny faint" style="margin:8px 2px 0">' + fmt(MANUAL_MIN) + '–' + fmt(MANUAL_MAX) + ' kcal arası girebilirsin. Protein, karbonhidrat ve yağ hedefleri bu değere göre otomatik hesaplanır.</p></div>';
    }
    html += '</section>';

    // Yükleme
    var standalone = N && N.isStandalone();
    if (!standalone && (deferredPrompt || (N && N.isIOS()))) {
      html += '<div class="section-title">Uygulama</div><section class="card banner"><div class="n-ic" style="color:var(--primary-600)">' + icon('phone') + '</div><div class="grow"><b>Ana ekrana ekle</b><small>' +
        (deferredPrompt ? 'Zayıfla\'yı uygulama gibi yükle; çevrimdışı çalışır ve bildirim gönderebilir.' : 'Safari\'de Paylaş simgesine, sonra “Ana Ekrana Ekle”ye dokun.') + '</small></div>' +
        (deferredPrompt ? '<button type="button" class="btn btn-primary btn-sm" data-action="install">Uygulamayı yükle</button>' : '') + '</section>';
    }

    // Hatırlatıcılar
    html += '<div class="section-title">Hatırlatıcılar</div><section class="card">';
    if (perm === 'unsupported') html += '<div class="hint warn">Bu tarayıcı bildirimleri desteklemiyor.' + (N && N.isIOS() && !standalone ? ' iPhone\'da bildirimler için uygulamayı önce Ana Ekrana eklemelisin (iOS 16.4+).' : '') + '</div>';
    else if (perm === 'denied') html += '<div class="hint warn">Bildirim izni reddedilmiş. Tarayıcı/site ayarlarından (adres çubuğundaki kilit simgesi → İzinler → Bildirimler) izin verebilirsin.</div>';
    else if (perm === 'default') html += '<div class="banner" style="margin-bottom:6px"><div class="grow"><b>Bildirim izni gerekli</b><small>Hatırlatıcıları açmak için izin ver.</small></div><button type="button" class="btn btn-primary btn-sm" data-action="notif-perm">' + icon('bell', 'ic-sm') + 'İzin ver</button></div>';
    function remRow(key, title, sub) {
      var r = rm[key];
      return '<div class="settings-row"><div class="grow"><b>' + title + '</b><small>' + sub + '</small></div>' +
        '<input type="time" class="input time-input" data-rem="' + key + '" data-field="time" value="' + esc(r.time) + '" ' + (r.on ? '' : 'disabled') + '>' +
        '<label class="switch"><input type="checkbox" data-rem="' + key + '" data-field="on" ' + (r.on ? 'checked' : '') + ' aria-label="' + title + '"><i></i></label></div>';
    }
    html += remRow('breakfast', 'Kahvaltı', 'Girilmediyse') + remRow('lunch', 'Öğle', 'Girilmediyse') + remRow('dinner', 'Akşam', 'Girilmediyse') +
      remRow('weigh', 'Tartılma', 'Sabah tartısı') + remRow('evening', 'Günü tamamla', 'Kayıt kontrolü');
    var wr = rm.water;
    html += '<div class="settings-row"><div class="grow"><b>Su</b><small>' + esc(wr.from) + '–' + esc(wr.to) + '</small></div>' +
      '<select class="select time-input" data-rem="water" data-field="every" ' + (wr.on ? '' : 'disabled') + '>' + [60, 90, 120, 180].map(function (m) { return '<option value="' + m + '"' + (+wr.every === m ? ' selected' : '') + '>' + (m % 60 ? fmt(m / 60, 1) : m / 60) + ' saatte 1</option>'; }).join('') + '</select>' +
      '<label class="switch"><input type="checkbox" data-rem="water" data-field="on" ' + (wr.on ? 'checked' : '') + ' aria-label="Su hatırlatıcısı"><i></i></label></div>';
    if (wr.on) html += '<div class="settings-row"><div class="grow"><small>Su hatırlatma saatleri</small></div><input type="time" class="input time-input" data-rem="water" data-field="from" value="' + esc(wr.from) + '"><span class="muted">–</span><input type="time" class="input time-input" data-rem="water" data-field="to" value="' + esc(wr.to) + '"></div>';
    html += '<button type="button" class="btn btn-block" style="margin-top:12px" data-action="notif-test">' + icon('bell', 'ic-sm') + 'Test bildirimi gönder</button>' +
      '<div style="margin-top:12px"><div class="hint">Telefonlar, uygulama tamamen kapalıyken bildirimleri geciktirebilir ya da pil tasarrufu nedeniyle göstermeyebilir. Kaçırılan hatırlatmalar uygulamayı açtığında gösterilir.' +
      (N && N.triggersSupported() ? ' Bu cihazda zamanlanmış bildirimler destekleniyor.' : '') + '</div>' +
      (N && N.isIOS() ? '<div class="hint">iPhone\'da bildirimler yalnızca uygulama Ana Ekrana eklendiğinde çalışır (iOS 16.4 ve üzeri).</div>' : '<div class="hint">Android\'de en iyi sonuç için uygulamayı yükle ve Chrome için pil optimizasyonunu kapat.</div>') + '</div></section>';

    html += coachSettingsHtml();

    // Görünüm ve birimler
    html += '<div class="section-title">Görünüm ve birimler</div><section class="card">' +
      '<div class="settings-row"><div class="grow"><b>Tema</b></div><div class="seg" style="width:210px">' + [['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']].map(function (x) { return '<button type="button" class="' + (s.theme === x[0] ? 'on' : '') + '" data-action="theme" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="settings-row"><div class="grow"><b>Kilo birimi</b></div><div class="seg" style="width:130px">' + ['kg', 'lb'].map(function (x) { return '<button type="button" class="' + (s.wUnit === x ? 'on' : '') + '" data-action="wunit" data-v="' + x + '">' + x + '</button>'; }).join('') + '</div></div>' +
      '<div class="settings-row"><div class="grow"><b>Bardak boyutu</b><small>Su takibi için</small></div><select class="select time-input" data-setting="glassMl">' + [150, 200, 250, 300, 330, 500].map(function (m) { return '<option value="' + m + '"' + (s.glassMl === m ? ' selected' : '') + '>' + m + ' ml</option>'; }).join('') + '</select></div>' +
      '<div class="settings-row"><div class="grow"><b>Günlük su hedefi</b><small>' + fmt(s.waterGoal * s.glassMl / 1000, 2) + ' litre</small></div><div class="stepper"><button type="button" data-action="wgoal" data-v="-1" aria-label="Azalt">−</button><input value="' + s.waterGoal + '" readonly aria-label="Bardak"><button type="button" data-action="wgoal" data-v="1" aria-label="Artır">+</button></div></div></section>';

    // Özel besinler & öğünler
    html += '<div class="section-title">Besinlerim</div><section class="card">' +
      '<button type="button" class="settings-row" style="width:100%;text-align:left" data-action="my-meals"><div class="grow"><b>Kayıtlı öğünler</b><small>' + state.meals.length + ' öğün</small></div>' + icon('right', 'ic-sm') + '</button>' +
      '<button type="button" class="settings-row" style="width:100%;text-align:left" data-action="my-foods"><div class="grow"><b>Özel besinler</b><small>' + state.custom.length + ' besin</small></div>' + icon('right', 'ic-sm') + '</button></section>';

    // Veri
    html += '<div class="section-title">Veriler</div><section class="card">' +
      '<div class="btn-row"><button type="button" class="btn" data-action="export">' + icon('download', 'ic-sm') + 'Dışa aktar</button><button type="button" class="btn" data-action="import">' + icon('upload', 'ic-sm') + 'İçe aktar</button></div>' +
      '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
      '<button type="button" class="btn btn-block" style="margin-top:10px;color:var(--danger)" data-action="reset">' + icon('trash', 'ic-sm') + 'Tüm verileri sil</button>' +
      '<p class="tiny faint" style="margin:12px 2px 0">Verilerin yalnızca bu cihazda, tarayıcı depolamasında saklanır. Düzenli olarak dışa aktarıp yedeklemeni öneririz.</p></section>';
    html += '<div class="section-title">Sürüm</div><section class="card"><div class="settings-row"><div class="grow"><b>Sürüm ' + APP_VERSION + '</b><small id="upd-status">Uygulama yeni sürümleri kendiliğinden alır.</small></div>' +
      '<button type="button" class="btn btn-sm" data-action="check-update">Güncellemeleri denetle</button></div></section>';
    html += '<p class="center tiny faint" style="margin:18px 0 8px">Zayıfla v' + APP_VERSION + ' · ' + FOODS.length + ' besin · ' + (storageOK ? 'çevrimdışı hazır' : 'depolama kapalı!') + '</p>';
    view.innerHTML = html;
  }

  /* ======================================================================
     Akışlar: ayrıştırma, onay, arama, besin detayı, özel besin...
     ====================================================================== */
  function parseText(text) {
    var rest = String(text || ''), extra = [];
    var folded = P.fold(rest);
    state.meals.slice().sort(function (a, b) { return b.name.length - a.name.length; }).forEach(function (m) {
      var fn = P.fold(m.name).trim();
      if (fn.length < 3) return;
      var i = folded.indexOf(fn);
      if (i >= 0) {
        m.items.forEach(function (it) { var c = Object.assign({}, it); c.confidence = 1; c.raw = m.name; c.fromMeal = true; extra.push(c); });
        rest = rest.slice(0, i) + ' , ' + rest.slice(i + fn.length);
        folded = P.fold(rest);
      }
    });
    var r = P.parse(rest, allFoods(), { boost: boostMap() });
    r.items = extra.concat(r.items);
    return r;
  }

  function handleText(text, meal) {
    text = String(text || '').trim();
    if (!text) return;
    var r = parseText(text);
    openConfirm({ text: text, items: r.items, unmatched: r.unmatched, meal: meal || r.meal || defaultMeal() });
  }
  function defaultMeal() { return guessMeal(); }

  function recalcItem(it) {
    var food = foodById(it.foodId);
    var q = isFinite(it.qty) && it.qty > 0 ? it.qty : 0;
    if (food) {
      var c = P.computeItem(food, q, it.unit, it.unitG, { state: it.state, scale: it.scale });
      ['grams', 'kcal', 'p', 'c', 'f', 'unitG', 'name'].forEach(function (k) { it[k] = c[k]; });
    } else if (it.base) {
      ['kcal', 'p', 'c', 'f', 'grams'].forEach(function (k) { it[k] = k === 'kcal' ? Math.round(it.base[k] * q) : round1(it.base[k] * q); });
    }
    return it;
  }
  function withBase(it) {
    if (!it.base) { var q = it.qty || 1; it.base = { kcal: it.kcal / q, p: it.p / q, c: it.c / q, f: it.f / q, grams: (it.grams || 0) / q }; }
    return it;
  }
  function itemFromFood(food, qty, unit, state) {
    var r = P.resolveUnit(food, qty, unit, false);
    var it = P.computeItem(food, r.qty, r.unit, r.unitG, { state: state });
    it.confidence = 1;
    return it;
  }

  function mealSeg(sel, attr) {
    return '<div class="seg" role="tablist">' + MEALS.map(function (m) { return '<button type="button" class="' + (sel === m.id ? 'on' : '') + '" ' + attr + '="' + m.id + '">' + m.label + '</button>'; }).join('') + '</div>';
  }

  /** Çiğ / pişmiş geçişi (yalnızca iki değeri olan besinlerde) */
  function stateSeg(food, st) {
    if (!food || !P.hasStates(food)) return '';
    st = st || P.baseState(food);
    return '<div class="seg seg-sm state-seg" role="group" aria-label="Çiğ veya pişmiş tartı"><button type="button" data-act="state" data-state="cooked" class="' + (st === 'cooked' ? 'on' : '') + '">Pişmiş</button><button type="button" data-act="state" data-state="raw" class="' + (st === 'raw' ? 'on' : '') + '">Çiğ</button></div>';
  }

  /** Ayrıştırma sonrası onay sayfası */
  function openConfirm(o) {
    var items = (o.items || []).map(function (it) { var c = Object.assign({}, it); return withBase(c); });
    var unmatched = (o.unmatched || []).slice();
    var meal = o.meal || defaultMeal();
    var s = openSheet({ title: o.title || 'Bunları ekleyeyim mi?', full: false });

    function itemHtml(it, i) {
      var food = foodById(it.foodId), low = it.confidence != null && it.confidence < 0.8;
      var opts = food ? unitOpts(food, it.unit, it.unitG) : [{ v: it.unit, label: P.UNIT_LABELS[it.unit] || it.unit }];
      return '<div class="pitem' + (low ? ' low' : '') + '" data-i="' + i + '"><div class="pitem-top"><div class="pitem-name"><b>' + esc(it.name) + '</b>' +
        '<small class="js-sub">' + (it.raw ? '“' + esc(it.raw) + '” · ' : '') + (it.grams ? fmt(it.grams) + ' g' : '') + '</small>' +
        (low ? ' <span class="badge warn">Emin değilim — kontrol et</span>' : '') + '</div><div class="pitem-kcal js-kcal">' + fmt(it.kcal) + ' kcal</div></div>' +
        '<div class="pitem-ctl"><div class="stepper"><button type="button" data-act="dec" aria-label="Azalt">−</button><input data-act="qty" inputmode="decimal" value="' + fmtQty(it.qty) + '" aria-label="Miktar"><button type="button" data-act="inc" aria-label="Artır">+</button></div>' +
        '<select class="select" data-act="unit" aria-label="Birim"' + (food ? '' : ' disabled') + '>' + opts.map(function (u) { return '<option value="' + esc(u.v) + '"' + (u.v === it.unit ? ' selected' : '') + '>' + esc(u.label) + '</option>'; }).join('') + '</select></div>' +
        stateSeg(food, it.state) +
        lowSugHtml(it, low) +
        '<div class="pitem-actions"><button type="button" class="link-btn" data-act="change">' + icon('search', 'ic-sm') + ' Değiştir</button><button type="button" class="link-btn" data-act="remove" style="color:var(--danger)">Kaldır</button></div></div>';
    }
    /** Düşük güvenli kalemde (ör. "light simit" yok) önerilen benzer besinler */
    function lowSugHtml(it, low) {
      var sug = low ? (it.suggestions || []).filter(function (x) { return x.id !== it.foodId && foodById(x.id); }) : [];
      // ayrıştırıcının notu ("“yaş” hâli listede yok, en yakın: ...") her zaman gösterilir
      if (!sug.length) return low && it.note ? '<div class="small muted js-note" style="margin-top:8px">' + esc(it.note) + '</div>' : '';
      var note = it.note ? esc(it.note) + '. Bunlardan biri mi?' : it.variantMissing ? 'Bu çeşidi bulamadım, normalini yazdım. Bunlardan biri mi?' : 'Bunlardan biri mi?';
      return '<div class="small muted js-note" style="margin-top:8px">' + note + '</div><div class="chips sug-chips" style="flex-wrap:wrap;overflow:visible">' +
        sug.map(function (x) { return '<button type="button" class="chip soft" data-act="swap" data-fid="' + esc(x.id) + '">' + esc(x.name) + '</button>'; }).join('') + '</div>';
    }
    function unmatchedHtml(u, i) {
      var sug = (u.suggestions || []).filter(function (x) { return foodById(x.id); });
      return '<div class="unmatched" data-u="' + i + '"><div class="row-between"><div class="grow"><b>“' + esc(u.text) + '”</b><div class="small muted">Veritabanında bulunamadı' + (u.qty != null ? ' · ' + fmtQty(u.qty) + (u.unit ? ' ' + u.unit : '') : '') + '</div></div>' +
        '<button type="button" class="icon-btn" data-uact="ignore" aria-label="Yoksay">' + icon('x', 'ic-sm') + '</button></div>' +
        (sug.length ? '<div class="small muted" style="margin-top:8px">Bunlardan biri mi?</div><div class="chips sug-chips" style="flex-wrap:wrap;overflow:visible">' + sug.map(function (x) { return '<button type="button" class="chip soft" data-uact="sug" data-fid="' + esc(x.id) + '">' + esc(x.name) + '</button>'; }).join('') + '</div>' : '') +
        '<div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn-sm" data-uact="search">' + icon('search', 'ic-sm') + 'Ara</button><button type="button" class="btn btn-soft btn-sm" data-uact="create">' + icon('plus', 'ic-sm') + 'Yeni besin</button></div></div>';
    }
    function draw() {
      var body = (o.text ? '<div class="transcript">' + esc(o.text) + '</div>' : '') + '<div style="margin-bottom:12px">' + mealSeg(meal, 'data-meal') + '</div>';
      body += items.map(itemHtml).join('') + unmatched.map(unmatchedHtml).join('');
      if (!items.length && !unmatched.length) body += '<div class="empty-state"><div class="es-ic">' + icon('utensils') + '</div><b>Bir besin anlayamadım</b>Örneğin “2 dilim ekmek ve 1 bardak ayran” gibi söyleyebilirsin.</div>';
      body += '<button type="button" class="btn btn-ghost btn-block" data-act="add-more">' + icon('plus', 'ic-sm') + 'Başka besin ekle</button>';
      s.setBody(body);
      drawFoot();
    }
    function drawFoot() {
      var t = totalsOf(items);
      s.setFoot('<div class="totals"><span class="muted">Toplam</span><b>' + fmt(t.kcal) + ' kcal</b></div>' +
        '<div class="macro-inline" style="margin:-4px 0 12px"><span><i style="background:var(--protein)"></i>P ' + fmt(t.p) + ' g</span><span><i style="background:var(--carb)"></i>K ' + fmt(t.c) + ' g</span><span><i style="background:var(--fat)"></i>Y ' + fmt(t.f) + ' g</span>' +
        (items.length > 1 ? '<button type="button" class="link-btn" style="margin-left:auto;padding:0;min-height:0" data-fact="savemeal">' + icon('bookmark', 'ic-sm') + 'Kaydet</button>' : '') + '</div>' +
        '<button type="button" class="btn btn-primary btn-lg btn-block" data-fact="add" ' + (items.length ? '' : 'disabled') + '>' + icon('check') + (items.length ? 'Ekle · ' + MEAL_BY[meal].label : 'Ekle') + '</button>');
    }
    function updateRow(i) {
      var row = s.body.querySelector('.pitem[data-i="' + i + '"]'); if (!row) return;
      var it = items[i];
      row.querySelector('.js-kcal').textContent = fmt(it.kcal) + ' kcal';
      var nb = row.querySelector('.pitem-name b'); if (nb) nb.textContent = it.name;
      row.querySelector('.js-sub').textContent = (it.raw ? '“' + it.raw + '” · ' : '') + (it.grams ? fmt(it.grams) + ' g' : '');
      drawFoot();
    }
    function stepFor(it) { return it.unit === 'g' || it.unit === 'ml' ? (it.qty >= 100 ? 25 : 10) : 0.5; }
    function addFoodItem(food, qty, unit) {
      var it = withBase(itemFromFood(food, qty, unit));
      items.push(it); draw();
    }

    s.body.addEventListener('click', function (e) {
      var mb = e.target.closest('[data-meal]');
      if (mb) { meal = mb.getAttribute('data-meal'); $$('[data-meal]', s.body).forEach(function (b) { b.classList.toggle('on', b === mb); }); drawFoot(); return; }
      var a = e.target.closest('[data-act]');
      if (a) {
        var act = a.getAttribute('data-act');
        if (act === 'add-more') { openSearch({ mode: 'pick', onPick: function (food) { addFoodItem(food, null, null); } }); return; }
        var row = a.closest('.pitem'); if (!row) return;
        var i = +row.getAttribute('data-i'), it = items[i];
        if (act === 'state') {
          it.state = a.getAttribute('data-state'); recalcItem(it);
          $$('[data-act="state"]', row).forEach(function (b) { b.classList.toggle('on', b === a); });
          updateRow(i);
        } else if (act === 'inc' || act === 'dec') {
          var st = stepFor(it), nq = act === 'inc' ? it.qty + st : it.qty - st;
          if (act === 'dec' && it.qty <= st) nq = st === 0.5 ? (it.qty > 0.25 ? 0.25 : it.qty) : Math.max(1, it.qty / 2);
          it.qty = Math.round(nq * 100) / 100;
          row.querySelector('[data-act="qty"]').value = fmtQty(it.qty);
          recalcItem(it); updateRow(i);
        } else if (act === 'remove') { items.splice(i, 1); draw(); }
        else if (act === 'swap') {
          var sw = foodById(a.getAttribute('data-fid'));
          if (sw) {
            var su = P.foodUnits(sw), keep = it.unit === 'g' || it.unit === 'ml' || su[it.unit];
            var ns = withBase(itemFromFood(sw, keep ? it.qty : null, keep ? it.unit : null));
            ns.raw = it.raw; items[i] = ns; draw();
          }
        }
        else if (act === 'change') {
          openSearch({
            mode: 'pick', query: it.raw || it.name, onPick: function (food) {
              var units = P.foodUnits(food), keepUnit = it.unit === 'g' || it.unit === 'ml' || units[it.unit];
              var n = withBase(itemFromFood(food, keepUnit ? it.qty : null, keepUnit ? it.unit : null));
              n.raw = it.raw; items[i] = n; draw();
            }
          });
        }
        return;
      }
      var u = e.target.closest('[data-uact]');
      if (u) {
        var ui = +u.closest('.unmatched').getAttribute('data-u'), um = unmatched[ui], uact = u.getAttribute('data-uact');
        if (uact === 'ignore') { unmatched.splice(ui, 1); draw(); }
        else if (uact === 'sug') { var sf = foodById(u.getAttribute('data-fid')); if (sf) { unmatched.splice(ui, 1); addFoodItem(sf, um.qty, um.unit); } }
        else if (uact === 'search') openSearch({ mode: 'pick', query: um.text, onPick: function (food) { unmatched.splice(ui, 1); addFoodItem(food, um.qty, um.unit); } });
        else if (uact === 'create') openCustomFood({ name: um.text, onSave: function (food) { unmatched.splice(ui, 1); addFoodItem(food, um.qty, um.unit); } });
      }
    });
    s.body.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-act') !== 'qty') return;
      var row = e.target.closest('.pitem'), i = +row.getAttribute('data-i'), v = parseNum(e.target.value);
      if (isFinite(v) && v >= 0) { items[i].qty = v; recalcItem(items[i]); updateRow(i); }
    });
    s.body.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-act') !== 'unit') return;
      var row = e.target.closest('.pitem'), i = +row.getAttribute('data-i'), it = items[i], nu = e.target.value;
      var wasMass = it.unit === 'g' || it.unit === 'ml', isMass = nu === 'g' || nu === 'ml';
      if (!wasMass && isMass) it.qty = Math.round(it.grams);
      else if (wasMass && !isMass) it.qty = 1;
      it.unit = nu; it.unitG = null;
      recalcItem(it);
      row.querySelector('[data-act="qty"]').value = fmtQty(it.qty);
      updateRow(i);
    });
    s.foot.addEventListener('click', function (e) {
      var f = e.target.closest('[data-fact]'); if (!f) return;
      var act = f.getAttribute('data-fact');
      if (act === 'add') {
        var valid = items.filter(function (it) { return it.qty > 0; });
        if (!valid.length) return;
        s.close();
        addItems(viewDate, meal, valid);
      } else if (act === 'savemeal') openSaveMeal(items);
    });
    draw();
    return s;
  }

  /** Besin arama */
  function openSearch(o) {
    o = o || {};
    var mode = o.mode || 'add', meal = o.meal || defaultMeal();
    var tab = state.recents.length ? 'recent' : 'favs';
    var s = openSheet({ title: mode === 'pick' ? 'Besin seç' : 'Besin ekle', full: true });
    s.setBody('<div class="search-box">' + icon('search') + '<input class="input" type="search" placeholder="Besin ara… (örn. mercimek çorbası)" enterkeyhint="search" autocomplete="off" value="' + esc(o.query || '') + '" aria-label="Besin ara"></div><div class="js-res"></div>');
    s.setFoot(mode === 'add' ? '<div class="btn-row"><button type="button" class="btn btn-sm" data-fact="quick">' + icon('bolt', 'ic-sm') + 'Hızlı kalori</button><button type="button" class="btn btn-sm" data-fact="custom">' + icon('plus', 'ic-sm') + 'Yeni besin</button></div>'
      : '<button type="button" class="btn btn-sm btn-block" data-fact="custom">' + icon('plus', 'ic-sm') + 'Bulamadın mı? Yeni besin oluştur</button>');
    var input = s.body.querySelector('input'), res = s.body.querySelector('.js-res');

    function foodRow(food, extra) {
      var units = P.foodUnits(food), def = food.def && units[food.def] ? food.def : null;
      var portion = def ? '1 ' + (P.UNIT_LABELS[def] || def) + ' ≈ ' + fmt(food.kcal * units[def] / 100) + ' kcal' : fmt(food.kcal) + ' kcal / 100 ' + (isLiquid(food) ? 'ml' : 'g');
      return '<div class="food-row"><button type="button" class="fr-main" data-food="' + esc(food.id) + '"><b>' + esc(food.name) + (state.favs.indexOf(food.id) >= 0 ? ' <span style="color:var(--warn)">★</span>' : '') + '</b><small>' + esc(extra || portion) + '</small></button>' +
        (mode === 'add' ? '<button type="button" class="add-mini" data-quickadd="' + esc(food.id) + '" aria-label="' + esc(food.name) + ' ekle">' + icon('plus', 'ic-sm') + '</button>' : '') + '</div>';
    }
    function drawRes() {
      var q = input.value.trim(), h = '';
      if (q) {
        var looksSentence = /\d|\s(ve|ile)\s|yedim|içtim|bir |iki |yarım/i.test(q) && q.split(/\s+/).length >= 2;
        if (mode === 'add' && looksSentence) h += '<button type="button" class="btn btn-soft btn-block" style="margin-bottom:10px;justify-content:flex-start" data-parse>' + icon('sparkle', 'ic-sm') + '“' + esc(q) + '” cümlesini çözümle</button>';
        var list = P.searchFoods(q, allFoods(), { limit: 40, boost: boostMap() });
        h += list.length ? list.map(function (f) { return foodRow(f); }).join('') : '<div class="empty-state"><div class="es-ic">' + icon('search') + '</div><b>Sonuç yok</b>“' + esc(q) + '” için yeni bir özel besin oluşturabilirsin.<div style="margin-top:12px"><button type="button" class="btn btn-soft" data-create>' + icon('plus', 'ic-sm') + '“' + esc(q) + '” oluştur</button></div></div>';
      } else {
        var tabs = [['recent', 'Son kullanılanlar'], ['favs', 'Favoriler']];
        if (mode === 'add') tabs.push(['meals', 'Öğünlerim']);
        tabs.push(['custom', 'Özel besinler']);
        h += '<div class="chips" style="margin-bottom:6px">' + tabs.map(function (t) { return '<button type="button" class="chip' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
        var rows = '';
        if (tab === 'recent') rows = state.recents.map(function (r) { var f = foodById(r.id); return f ? foodRow(f, 'Son: ' + fmtQty(r.qty) + ' ' + (P.UNIT_LABELS[r.unit] || r.unit)) : ''; }).join('');
        else if (tab === 'favs') rows = state.favs.map(function (id) { var f = foodById(id); return f ? foodRow(f) : ''; }).join('');
        else if (tab === 'custom') rows = state.custom.map(function (f) { return foodRow(f); }).join('');
        else if (tab === 'meals') rows = state.meals.map(function (m) { var t = totalsOf(m.items); return '<div class="food-row"><button type="button" class="fr-main" data-smeal="' + m.id + '"><b>' + esc(m.name) + '</b><small>' + m.items.length + ' kalem · ' + fmt(t.kcal) + ' kcal</small></button></div>'; }).join('');
        var emptyMsg = { recent: 'Eklediğin besinler burada görünür.', favs: 'Bir besinin detayında ☆ simgesine dokunarak favorilere ekle.', custom: 'Veritabanında olmayan besinleri burada oluşturabilirsin.', meals: 'Sık yediğin öğünleri kaydet; tek dokunuşla ekle. (Bugün ekranında bir öğünün altındaki “Öğün olarak kaydet”.)' };
        h += rows || '<div class="empty-state"><b>Henüz yok</b>' + emptyMsg[tab] + '</div>';
      }
      res.innerHTML = h;
    }
    input.addEventListener('input', debounce(drawRes, 120));
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var b = res.querySelector('[data-parse]'); if (b) b.click(); else { var f = res.querySelector('[data-food]'); if (f) f.click(); } }
    });
    res.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]'); if (t) { tab = t.getAttribute('data-tab'); drawRes(); return; }
      if (e.target.closest('[data-parse]')) { var q = input.value; s.close(); handleText(q, o.meal); return; }
      if (e.target.closest('[data-create]')) { openCustomFood({ name: input.value.trim(), onSave: function (food) { pick(food); } }); return; }
      var sm = e.target.closest('[data-smeal]');
      if (sm) { var m = state.meals.filter(function (x) { return x.id === sm.getAttribute('data-smeal'); })[0]; if (m) { s.close(); openConfirm({ title: m.name, items: m.items.map(function (x) { return Object.assign({}, x, { confidence: 1 }); }), meal: meal }); } return; }
      var qa = e.target.closest('[data-quickadd]');
      if (qa) {
        var food = foodById(qa.getAttribute('data-quickadd'));
        var rec = state.recents.filter(function (r) { return r.id === food.id; })[0];
        var it = rec ? itemFromFood(food, rec.qty, rec.unit, rec.state) : itemFromFood(food, null, null);
        addItems(viewDate, meal, [it]);
        return;
      }
      var fb = e.target.closest('[data-food]');
      if (fb) pick(foodById(fb.getAttribute('data-food')));
    });
    function pick(food) {
      if (!food) return;
      if (mode === 'pick') { s.close(); o.onPick && o.onPick(food); }
      else openFoodDetail(food, { meal: meal, onDone: function () { s.close(); } });
    }
    s.foot.addEventListener('click', function (e) {
      var f = e.target.closest('[data-fact]'); if (!f) return;
      if (f.getAttribute('data-fact') === 'quick') { s.close(); openQuickKcal({ meal: meal }); }
      else openCustomFood({ name: input.value.trim(), onSave: function (food) { pick(food); } });
    });
    drawRes();
    setTimeout(function () { try { input.focus(); if (o.query) input.select(); } catch (e) { /* */ } }, 320);
    return s;
  }

  /** Besin detayı: ekle veya kaydı düzenle */
  function openFoodDetail(food, o) {
    o = o || {};
    var entry = o.entry, k = o.date || viewDate;
    var meal = entry ? entry.meal : (o.meal || defaultMeal());
    var rec = state.recents.filter(function (r) { return r.id === food.id; })[0];
    var it = entry ? Object.assign({}, entry) : (rec ? itemFromFood(food, rec.qty, rec.unit, rec.state) : itemFromFood(food, null, null));
    var fav = state.favs.indexOf(food.id) >= 0;
    var s = openSheet({ title: food.name, headExtra: '<button type="button" class="icon-btn' + (fav ? ' on' : '') + '" data-fav aria-label="Favori">' + '<svg class="ic" viewBox="0 0 24 24" style="fill:' + (fav ? 'currentColor' : 'none') + '">' + ICONS.star + '</svg></button>' });
    var opts = unitOpts(food, it.unit, it.unitG);
    s.setBody('<div class="food-hero"><div><div class="fh-kcal js-k">' + fmt(it.kcal) + '<small> kcal</small></div><div class="small muted js-g"></div></div>' +
      '<div class="small muted" style="text-align:right">' + esc(food.cat || '') + '<br><span class="js-100"></span></div></div>' +
      '<div class="macro-tiles"><div class="p"><b class="js-p"></b><span>Protein</span></div><div class="c"><b class="js-c"></b><span>Karbonhidrat</span></div><div class="f"><b class="js-f"></b><span>Yağ</span></div></div>' +
      '<div class="pitem-ctl" style="margin:0 0 14px"><div class="stepper"><button type="button" data-st="-1" aria-label="Azalt">−</button><input class="js-q" inputmode="decimal" value="' + fmtQty(it.qty) + '" aria-label="Miktar"><button type="button" data-st="1" aria-label="Artır">+</button></div>' +
      '<select class="select js-u" aria-label="Birim">' + opts.map(function (u) { return '<option value="' + esc(u.v) + '"' + (u.v === it.unit ? ' selected' : '') + '>' + esc(u.label) + '</option>'; }).join('') + '</select></div>' +
      (P.hasStates(food) ? '<div style="margin:0 0 14px">' + stateSeg(food, it.state) + '<div class="tiny faint" style="margin-top:6px">Tartıyı çiğ mi pişmiş mi yaptığına göre seç; kalori buna göre hesaplanır.</div></div>' : '') +
      mealSeg(meal, 'data-meal') +
      (food.custom ? '<div class="row" style="margin-top:12px"><button type="button" class="link-btn" data-editcustom>' + icon('edit', 'ic-sm') + ' Özel besini düzenle</button></div>' : ''));
    s.setFoot(entry ? '<div class="btn-row"><button type="button" class="btn" style="color:var(--danger);flex:0 0 auto" data-del aria-label="Sil">' + icon('trash') + '</button><button type="button" class="btn btn-primary" data-ok>' + icon('check') + 'Kaydet</button></div>'
      : '<button type="button" class="btn btn-primary btn-lg btn-block" data-ok>' + icon('plus') + 'Ekle</button>');
    var qIn = s.body.querySelector('.js-q'), uSel = s.body.querySelector('.js-u');
    function upd() {
      var c = P.computeItem(food, it.qty > 0 ? it.qty : 0, it.unit, it.unitG, { state: it.state, scale: it.scale });
      ['grams', 'kcal', 'p', 'c', 'f', 'unitG', 'name', 'state'].forEach(function (x) { if (c[x] !== undefined) it[x] = c[x]; });
      var sv = P.stateValues(food, c.state || P.baseState(food));
      s.body.querySelector('.js-100').textContent = '100 ' + (isLiquid(food) ? 'ml' : 'g') + (c.state ? (c.state === 'raw' ? ' çiğ' : ' pişmiş') : '') + ': ' + fmt(sv.kcal) + ' kcal';
      s.body.querySelector('.js-k').innerHTML = fmt(it.kcal) + '<small> kcal</small>';
      s.body.querySelector('.js-g').textContent = it.unit === 'g' || it.unit === 'ml' ? '' : fmt(it.grams) + ' ' + (isLiquid(food) ? 'ml/g' : 'g');
      s.body.querySelector('.js-p').textContent = fmt(it.p, 1) + ' g';
      s.body.querySelector('.js-c').textContent = fmt(it.c, 1) + ' g';
      s.body.querySelector('.js-f').textContent = fmt(it.f, 1) + ' g';
    }
    s.body.addEventListener('click', function (e) {
      var stb = e.target.closest('[data-act="state"]');
      if (stb) { it.state = stb.getAttribute('data-state'); $$('[data-act="state"]', s.body).forEach(function (b) { b.classList.toggle('on', b === stb); }); upd(); return; }
      var st = e.target.closest('[data-st]');
      if (st) {
        var step = it.unit === 'g' || it.unit === 'ml' ? (it.qty >= 100 ? 25 : 10) : 0.5, dir = +st.getAttribute('data-st');
        var nq = it.qty + dir * step;
        if (nq <= 0) nq = step === 0.5 ? 0.25 : Math.max(1, it.qty / 2);
        it.qty = Math.round(nq * 100) / 100; qIn.value = fmtQty(it.qty); upd(); return;
      }
      var mb = e.target.closest('[data-meal]');
      if (mb) { meal = mb.getAttribute('data-meal'); $$('[data-meal]', s.body).forEach(function (b) { b.classList.toggle('on', b === mb); }); return; }
      if (e.target.closest('[data-editcustom]')) { s.close(); openCustomFood({ food: food }); }
    });
    qIn.addEventListener('input', function () { var v = parseNum(qIn.value); if (isFinite(v) && v >= 0) { it.qty = v; upd(); } });
    uSel.addEventListener('change', function () {
      var nu = uSel.value, wasMass = it.unit === 'g' || it.unit === 'ml', isMass = nu === 'g' || nu === 'ml';
      if (!wasMass && isMass) it.qty = Math.round(it.grams); else if (wasMass && !isMass) it.qty = 1;
      it.unit = nu; it.unitG = null; qIn.value = fmtQty(it.qty); upd();
    });
    s.layer.querySelector('[data-fav]').addEventListener('click', function (e) {
      var b = e.currentTarget, i = state.favs.indexOf(food.id);
      if (i >= 0) state.favs.splice(i, 1); else state.favs.unshift(food.id);
      var on = i < 0; b.classList.toggle('on', on); b.querySelector('svg').style.fill = on ? 'currentColor' : 'none';
      save(); toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
    });
    s.foot.addEventListener('click', function (e) {
      if (e.target.closest('[data-del]')) { s.close(); deleteEntry(k, entry.id); return; }
      if (!e.target.closest('[data-ok]')) return;
      if (!(it.qty > 0)) { toast('Miktar girin.'); return; }
      if (entry) {
        var d = state.days[k];
        if (d) d.entries.forEach(function (x, i) { if (x.id === entry.id) d.entries[i] = cleanEntry(Object.assign({}, x, it, { meal: meal, id: x.id, ts: x.ts })); });
        pushRecent(it); save(); render(); notifySync(); s.close(); toast('Kayıt güncellendi');
      } else {
        s.close(); if (o.onDone) o.onDone();
        addItems(k, meal, [it]);
      }
    });
    upd();
    return s;
  }

  /** Özel besin oluştur / düzenle */
  function openCustomFood(o) {
    o = o || {};
    var ed = o.food, mode = ed && ed.units && ed.units.porsiyon && ed.def === 'porsiyon' ? 'portion' : '100';
    var portionG = ed && ed.units && ed.units.porsiyon ? ed.units.porsiyon : '';
    var pv = function (v) { return ed ? (mode === 'portion' && portionG ? round1(v * portionG / 100) : v) : ''; };
    var s = openSheet({ title: ed ? 'Özel besini düzenle' : 'Yeni özel besin' });
    s.setBody('<label class="field"><span>Ad</span><input class="input" name="name" value="' + esc(ed ? ed.name : (o.name || '')) + '" placeholder="örn. Annemin mantısı" maxlength="80"></label>' +
      '<div class="field"><span>Değerler</span><div class="seg"><button type="button" data-mode="100" class="' + (mode === '100' ? 'on' : '') + '">100 g başına</button><button type="button" data-mode="portion" class="' + (mode === 'portion' ? 'on' : '') + '">1 porsiyon başına</button></div></div>' +
      '<div class="grid-2"><label class="field"><span>Kalori</span><div class="input-unit"><input class="input" name="kcal" inputmode="decimal" value="' + pv(ed ? ed.kcal : '') + '" placeholder="0"><em>kcal</em></div></label>' +
      '<label class="field"><span class="js-plabel">' + (mode === 'portion' ? 'Porsiyon ağırlığı (ops.)' : 'Porsiyon (ops.)') + '</span><div class="input-unit"><input class="input" name="pg" inputmode="decimal" value="' + esc(portionG) + '" placeholder="örn. 250"><em>g</em></div></label></div>' +
      '<div class="grid-3"><label class="field"><span>Protein</span><div class="input-unit"><input class="input" name="p" inputmode="decimal" value="' + pv(ed ? ed.p : '') + '"><em>g</em></div></label>' +
      '<label class="field"><span>Karb.</span><div class="input-unit"><input class="input" name="c" inputmode="decimal" value="' + pv(ed ? ed.c : '') + '"><em>g</em></div></label>' +
      '<label class="field"><span>Yağ</span><div class="input-unit"><input class="input" name="f" inputmode="decimal" value="' + pv(ed ? ed.f : '') + '"><em>g</em></div></label></div>' +
      '<p class="tiny faint" style="margin:0">Makrolar isteğe bağlıdır. Porsiyon ağırlığını bilmiyorsan boş bırak; 1 porsiyon olarak eklenir.</p>');
    s.setFoot(ed ? '<div class="btn-row"><button type="button" class="btn" style="color:var(--danger);flex:0 0 auto" data-del>' + icon('trash') + '</button><button type="button" class="btn btn-primary" data-ok>Kaydet</button></div>' : '<button type="button" class="btn btn-primary btn-lg btn-block" data-ok>' + icon('check') + 'Kaydet</button>');
    s.body.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]'); if (!m) return;
      mode = m.getAttribute('data-mode');
      $$('[data-mode]', s.body).forEach(function (b) { b.classList.toggle('on', b === m); });
      s.body.querySelector('.js-plabel').textContent = mode === 'portion' ? 'Porsiyon ağırlığı (ops.)' : 'Porsiyon (ops.)';
    });
    s.foot.addEventListener('click', function (e) {
      if (e.target.closest('[data-del]')) {
        confirmSheet('Silinsin mi?', '“' + esc(ed.name) + '” özel besini silinecek. Geçmiş kayıtların etkilenmez.', 'Sil', true).then(function (ok) {
          if (!ok) return;
          state.custom = state.custom.filter(function (f) { return f.id !== ed.id; });
          state.favs = state.favs.filter(function (id) { return id !== ed.id; });
          invalidateFoods(); save(); s.close(); render(); toast('Özel besin silindi');
        });
        return;
      }
      if (!e.target.closest('[data-ok]')) return;
      var g = function (n) { return parseNum(s.body.querySelector('[name="' + n + '"]').value); };
      var name = s.body.querySelector('[name="name"]').value.trim(), kcal = g('kcal'), pg = g('pg');
      if (!name) { toast('Bir ad gir.'); return; }
      if (!isFinite(kcal) || kcal < 0 || kcal > 9000) { toast('Geçerli bir kalori değeri gir.'); return; }
      var mul = 1, units = {}, def = 'g';
      if (mode === 'portion') {
        var grams = isFinite(pg) && pg > 0 ? pg : 100;
        mul = 100 / grams; units.porsiyon = grams; def = 'porsiyon';
      } else if (isFinite(pg) && pg > 0) { units.porsiyon = pg; def = 'porsiyon'; }
      var z = function (v) { return isFinite(v) && v > 0 ? round1(v * mul) : 0; };
      var food = cleanFood({ id: ed ? ed.id : 'c_' + uid(), name: name, kcal: round1(kcal * mul), p: z(g('p')), c: z(g('c')), f: z(g('f')), units: units, def: def });
      if (ed) state.custom = state.custom.map(function (f) { return f.id === ed.id ? food : f; });
      else state.custom.unshift(food);
      invalidateFoods(); save(); s.close();
      toast(ed ? 'Özel besin güncellendi' : '“' + esc(name) + '” kaydedildi');
      if (o.onSave) o.onSave(food); else render();
    });
    setTimeout(function () { var i = s.body.querySelector(o.name || ed ? '[name="kcal"]' : '[name="name"]'); try { i.focus(); } catch (e) { /* */ } }, 320);
  }

  /** Hızlı kalori ekle / düzenle */
  function openQuickKcal(o) {
    o = o || {};
    var entry = o.entry, meal = entry ? entry.meal : (o.meal || defaultMeal()), k = viewDate;
    var s = openSheet({ title: entry ? 'Kaydı düzenle' : 'Hızlı kalori ekle' });
    s.setBody('<p class="small muted" style="margin:0 0 12px">Besini aramadan yalnızca kalori gir (ör. restoran yemeği, paket ürün etiketi).</p>' +
      '<label class="field"><span>Kalori</span><div class="input-unit"><input class="input big-input" name="kcal" inputmode="numeric" value="' + (entry ? entry.kcal : '') + '" placeholder="0"><em>kcal</em></div></label>' +
      '<label class="field"><span>Açıklama (isteğe bağlı)</span><input class="input" name="name" value="' + esc(entry ? entry.name : '') + '" placeholder="Hızlı kalori" maxlength="80"></label>' +
      '<div class="grid-3"><label class="field"><span>Protein</span><div class="input-unit"><input class="input" name="p" inputmode="decimal" value="' + (entry && entry.p ? entry.p : '') + '"><em>g</em></div></label>' +
      '<label class="field"><span>Karb.</span><div class="input-unit"><input class="input" name="c" inputmode="decimal" value="' + (entry && entry.c ? entry.c : '') + '"><em>g</em></div></label>' +
      '<label class="field"><span>Yağ</span><div class="input-unit"><input class="input" name="f" inputmode="decimal" value="' + (entry && entry.f ? entry.f : '') + '"><em>g</em></div></label></div>' + mealSeg(meal, 'data-meal'));
    s.setFoot(entry ? '<div class="btn-row"><button type="button" class="btn" style="color:var(--danger);flex:0 0 auto" data-del>' + icon('trash') + '</button><button type="button" class="btn btn-primary" data-ok>Kaydet</button></div>' : '<button type="button" class="btn btn-primary btn-lg btn-block" data-ok>' + icon('bolt') + 'Ekle</button>');
    s.body.addEventListener('click', function (e) {
      var mb = e.target.closest('[data-meal]');
      if (mb) { meal = mb.getAttribute('data-meal'); $$('[data-meal]', s.body).forEach(function (b) { b.classList.toggle('on', b === mb); }); }
    });
    s.foot.addEventListener('click', function (e) {
      if (e.target.closest('[data-del]')) { s.close(); deleteEntry(k, entry.id); return; }
      if (!e.target.closest('[data-ok]')) return;
      var g = function (n) { var v = parseNum(s.body.querySelector('[name="' + n + '"]').value); return isFinite(v) && v > 0 ? v : 0; };
      var kcal = g('kcal');
      if (!(kcal > 0) || kcal > 10000) { toast('Geçerli bir kalori gir.'); return; }
      var it = { foodId: null, name: s.body.querySelector('[name="name"]').value.trim() || 'Hızlı kalori', qty: 1, unit: 'porsiyon', unitG: 0, grams: 0, kcal: Math.round(kcal), p: g('p'), c: g('c'), f: g('f'), quick: true };
      s.close();
      if (entry) {
        var d = state.days[k];
        if (d) d.entries.forEach(function (x, i) { if (x.id === entry.id) d.entries[i] = cleanEntry(Object.assign({}, x, it, { meal: meal })); });
        save(); render(); notifySync(); toast('Kayıt güncellendi');
      } else addItems(k, meal, [it]);
    });
    setTimeout(function () { try { s.body.querySelector('[name="kcal"]').focus(); } catch (e) { /* */ } }, 320);
  }

  /** Öğün olarak kaydet */
  function openSaveMeal(items, suggested) {
    if (!items || !items.length) return;
    var s = openSheet({ title: 'Öğün olarak kaydet' });
    var t = totalsOf(items);
    s.setBody('<label class="field"><span>Öğün adı</span><input class="input" name="n" maxlength="60" value="' + esc(suggested || '') + '" placeholder="örn. Benim kahvaltım"></label>' +
      '<div class="hint">' + items.map(function (i) { return esc(i.name); }).join(', ') + ' · <b>' + fmt(t.kcal) + ' kcal</b></div>' +
      '<p class="tiny faint">İpucu: kaydettiğin öğünün adını söylersen (ör. “benim kahvaltım ve bir çay”) hepsi birden eklenir.</p>');
    s.setFoot('<button type="button" class="btn btn-primary btn-lg btn-block" data-ok>' + icon('bookmark') + 'Kaydet</button>');
    s.foot.querySelector('[data-ok]').addEventListener('click', function () {
      var name = s.body.querySelector('[name="n"]').value.trim();
      if (!name) { toast('Bir ad gir.'); return; }
      state.meals = state.meals.filter(function (m) { return P.fold(m.name) !== P.fold(name); });
      state.meals.unshift({ id: uid(), name: name, items: items.map(function (i) { return cleanEntry(Object.assign({}, i, { id: uid() })); }).filter(Boolean) });
      save(); s.close(); toast('“' + esc(name) + '” kaydedildi');
    });
    setTimeout(function () { try { s.body.querySelector('input').focus(); } catch (e) { /* */ } }, 320);
  }

  function openMyMeals() {
    var s = openSheet({ title: 'Kayıtlı öğünler' });
    function draw() {
      s.setBody(state.meals.length ? '<ul class="list">' + state.meals.map(function (m) {
        var t = totalsOf(m.items);
        return '<li class="list-row"><button type="button" class="lr-main" style="text-align:left" data-use="' + m.id + '"><div class="lr-title">' + esc(m.name) + '</div><div class="lr-sub">' + esc(m.items.map(function (i) { return i.name; }).join(', ')) + '</div></button><span class="lr-end small">' + fmt(t.kcal) + ' kcal</span>' +
          '<button type="button" class="icon-btn danger" data-delm="' + m.id + '" aria-label="Sil">' + icon('trash', 'ic-sm') + '</button></li>';
      }).join('') + '</ul>' : '<div class="empty-state"><div class="es-ic">' + icon('bookmark') + '</div><b>Kayıtlı öğün yok</b>Bugün ekranında bir öğünün altındaki “Öğün olarak kaydet” ile oluştur.</div>');
    }
    s.body.addEventListener('click', function (e) {
      var u = e.target.closest('[data-use]'), d = e.target.closest('[data-delm]');
      if (u) { var m = state.meals.filter(function (x) { return x.id === u.getAttribute('data-use'); })[0]; s.close(); if (m) openConfirm({ title: m.name, items: m.items.map(function (x) { return Object.assign({}, x, { confidence: 1 }); }), meal: defaultMeal() }); }
      if (d) { state.meals = state.meals.filter(function (x) { return x.id !== d.getAttribute('data-delm'); }); save(); draw(); toast('Öğün silindi'); }
    });
    draw();
  }
  function openMyFoods() {
    var s = openSheet({ title: 'Özel besinler' });
    function draw() {
      s.setBody((state.custom.length ? '<ul class="list">' + state.custom.map(function (f) {
        return '<li><button type="button" class="list-row" data-cf="' + esc(f.id) + '"><div class="lr-main"><div class="lr-title">' + esc(f.name) + '</div><div class="lr-sub">' + fmt(f.kcal) + ' kcal / 100 g' + (f.units.porsiyon ? ' · porsiyon ' + fmt(f.units.porsiyon) + ' g' : '') + '</div></div>' + icon('edit', 'ic-sm') + '</button></li>';
      }).join('') + '</ul>' : '<div class="empty-state"><div class="es-ic">' + icon('utensils') + '</div><b>Özel besin yok</b>Veritabanında olmayan yiyecekleri ekleyebilirsin.</div>') +
        '<button type="button" class="btn btn-soft btn-block" style="margin-top:10px" data-new>' + icon('plus', 'ic-sm') + 'Yeni özel besin</button>');
    }
    s.body.addEventListener('click', function (e) {
      var c = e.target.closest('[data-cf]');
      if (c) { s.close(); openCustomFood({ food: foodById(c.getAttribute('data-cf')) }); }
      if (e.target.closest('[data-new]')) { s.close(); openCustomFood({}); }
    });
    draw();
  }

  /** Sesle ekleme */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var SR_ERRORS = {
    'not-allowed': 'Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden mikrofona izin ver.',
    'service-not-allowed': 'Konuşma tanıma bu cihazda kullanılamıyor. Klavyedeki 🎤 dikte tuşuyla yazdırabilirsin.',
    'no-speech': 'Ses algılanamadı. Mikrofona dokunup tekrar dene.',
    'audio-capture': 'Mikrofon bulunamadı.',
    'network': 'Sesli giriş için internet gerekiyor (tarayıcının konuşma tanıma servisi). Çevrimdışıyken yazarak ekleyebilirsin.',
    'language-not-supported': 'Türkçe konuşma tanıma bu cihazda desteklenmiyor.'
  };
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* */ } }
  /**
   * Dokunmalı sesli giriş (Today ve Koç için ortak). Mikrofon yalnızca kullanıcı tekrar dokununca kapanır:
   * Android Chrome sessizlikte/zaman aşımında oturumu bitirirse kendiliğinden yeniden başlatılır ve metin korunur.
   * cb: onStart(), onUpdate(finalText, interim), onFinish(text, reason, errCode), onCancel()
   * reason: 'tap' | 'idle' (işlenir) · 'hidden' | 'error' (metin yalnızca korunur)
   */
  function createVoiceSession(cb) {
    var IDLE_MS = 180000, STOP_WAIT = 1500;
    var rec = null, active = false, stopping = false, stopReason = '', errCode = '', segs = [], interim = '', seen = {};
    var restartT = null, stopT = null, idleT = null, startedAt = 0, gotResult = false, quickFails = 0, netFails = 0, lastErr = '', startedOnce = false;
    function norm(t) { return String(t || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim(); }
    function addFinal(t) {
      t = String(t || '').replace(/\s+/g, ' ').trim(); if (!t) return;
      var nt = norm(t), n = segs.length;
      if (n) {
        var nl = norm(segs[n - 1]);
        if (nt === nl) return;                                   // aynı cümle tekrar geldi
        if (nl && nt.indexOf(nl) === 0) { segs[n - 1] = t; return; } // öncekinin uzantısı: değiştir
        if (n > 1 && nt === norm(segs[n - 2])) return;           // bir önceki cümlenin tekrarı
      }
      segs.push(t);
    }
    function text() { return segs.join(' ').trim(); }
    function commitInterim() { if (interim.trim()) addFinal(interim); interim = ''; }
    function emit() { if (cb.onUpdate) cb.onUpdate(text(), interim.trim()); }
    function clearTimers() { clearTimeout(restartT); clearTimeout(stopT); clearTimeout(idleT); restartT = stopT = idleT = null; }
    function resetIdle() { clearTimeout(idleT); idleT = setTimeout(function () { stop('idle'); }, IDLE_MS); }
    function detachRec() { var r = rec; rec = null; if (r) { try { r.abort(); } catch (e) { /* */ } } }
    function onVis() { if (document.hidden) stop('hidden'); }
    function teardown() { active = false; clearTimers(); document.removeEventListener('visibilitychange', onVis); }
    function finishNow() {
      if (!active) return;
      commitInterim(); teardown(); detachRec();
      buzz(stopReason === 'tap' || stopReason === 'idle' ? [18, 40, 18] : 0);
      if (cb.onFinish) cb.onFinish(text(), stopReason || 'tap', errCode);
    }
    function failNow(code) { stopping = true; stopReason = 'error'; errCode = code; finishNow(); }
    function handle(e) {
      var res = e.results || [], ri = e.resultIndex || 0, any = false;
      interim = '';
      for (var i = 0; i < res.length; i++) {
        var r = res[i]; if (!r || !r[0]) continue;
        if (r.isFinal) { if (!seen[i]) { seen[i] = true; addFinal(r[0].transcript); any = true; } }
        else if (i >= ri || !seen[i]) interim += (interim ? ' ' : '') + String(r[0].transcript || '').trim();
      }
      if (any || interim) { gotResult = true; quickFails = 0; netFails = 0; if (!stopping) resetIdle(); }
      emit();
    }
    function begin() {
      restartT = null; if (!active || stopping) return;
      var r;
      try { r = new SR(); } catch (er) { failNow('start-failed'); return; }
      rec = r; seen = {}; interim = ''; gotResult = false; lastErr = ''; startedAt = Date.now();
      r.lang = 'tr-TR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
      r.onstart = function () { if (r !== rec) return; if (!startedOnce) { startedOnce = true; buzz(25); if (cb.onStart) cb.onStart(); } };
      r.onresult = function (e) { if (r === rec) handle(e); };
      r.onerror = function (e) {
        if (r !== rec) return;
        var c = e && e.error; lastErr = c || '';
        if (c === 'not-allowed' || c === 'service-not-allowed' || c === 'audio-capture' || c === 'language-not-supported') failNow(c);
      };
      r.onend = function () {
        if (r !== rec) return;
        if (stopping) { finishNow(); return; }
        commitInterim(); emit(); rec = null;
        var lived = Date.now() - startedAt;
        if (!gotResult) {
          if (lastErr === 'network') { if (++netFails >= 5) { failNow('network'); return; } }
          else if (lived < 700) { if (++quickFails >= 8) { failNow(lastErr || 'start-failed'); return; } }
        }
        var delay = Math.min(3000, 200 * Math.pow(2, Math.min(4, quickFails + netFails)));
        restartT = setTimeout(begin, delay);
      };
      try { r.start(); }
      catch (er) { rec = null; if (++quickFails >= 8) { failNow('start-failed'); return; } restartT = setTimeout(begin, 400); }
    }
    function start() {
      if (active) return;
      active = true; stopping = false; stopReason = ''; errCode = ''; segs = []; interim = ''; startedOnce = false; quickFails = 0; netFails = 0;
      document.addEventListener('visibilitychange', onVis);
      resetIdle(); begin();
    }
    function stop(reason) {
      if (!active || stopping) return;
      stopping = true; stopReason = reason || 'tap'; clearTimeout(restartT); clearTimeout(idleT);
      if (!rec) { finishNow(); return; }
      try { rec.stop(); } catch (er) { finishNow(); return; }
      stopT = setTimeout(finishNow, STOP_WAIT);
    }
    function cancel() {
      if (!active) return;
      teardown(); detachRec(); segs = []; interim = '';
      if (cb.onCancel) cb.onCancel();
    }
    return { start: start, stop: stop, cancel: cancel, active: function () { return active; } };
  }

  function openVoice(o) {
    o = o || {};
    var vs = null, listening = false, edited = false, base = '', done = false;
    var s = openSheet({ title: 'Sesle ekle', onClose: function () { done = true; if (vs) vs.cancel(); } });
    var examples = ['3 yumurta ve 2 dilim peynir', 'bir kase mercimek çorbası', 'iki dilim ekmek bir de ayran', '150 gram tavuk göğsü', 'bir buçuk bardak süt'];
    s.setBody('<div class="voice-stage"><button type="button" class="mic-big" data-mic aria-label="Dinlemeyi başlat/durdur">' + icon('mic') + '</button>' +
      '<div class="voice-status js-st" role="status" aria-live="polite"></div><div class="live-text js-live"></div>' +
      '<button type="button" class="voice-cancel" data-cancel hidden>İptal</button></div>' +
      '<label class="field"><span>Ya da yaz</span><textarea class="input js-txt" rows="2" placeholder="örn. 2 dilim ekmek, 1 bardak çay ve 5 zeytin"></textarea></label>' +
      '<div class="examples">' + examples.map(function (x) { return '<button type="button" class="chip" data-ex="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>');
    s.setFoot('<button type="button" class="btn btn-primary btn-lg btn-block" data-go>' + icon('sparkle') + 'Çözümle</button>');
    var st = s.body.querySelector('.js-st'), live = s.body.querySelector('.js-live'), txt = s.body.querySelector('.js-txt'), mic = s.body.querySelector('[data-mic]'), cancelBtn = s.body.querySelector('[data-cancel]');
    function setStatus(h) { st.innerHTML = h; }
    function setListening(on) { listening = on; mic.classList.toggle('listening', on); mic.setAttribute('aria-pressed', on ? 'true' : 'false'); cancelBtn.hidden = !on; }
    function go() {
      if (vs && vs.active()) { vs.stop('tap'); return; } // dinlerken: önce kapat, metin gelince işlenir
      var t = (txt.value || '').trim();
      if (!t) { toast('Önce ne yediğini söyle ya da yaz.'); return; }
      done = true; s.close(); handleText(t, o.meal);
    }
    function start() {
      if (!SR || (vs && vs.active())) return;
      base = txt.value.trim(); edited = false; live.innerHTML = '';
      vs = createVoiceSession({
        onStart: function () { setListening(true); setStatus('Dinliyorum… bitirince dokun'); },
        onUpdate: function (f, i) {
          live.innerHTML = esc(f) + (i ? ' <span class="interim">' + esc(i) + '</span>' : '');
          if (!edited) txt.value = (base + ' ' + f + ' ' + i).replace(/\s+/g, ' ').trim();
        },
        onFinish: function (t, reason, err) {
          setListening(false);
          if (done) return;
          if (!edited) txt.value = (base + ' ' + t).replace(/\s+/g, ' ').trim();
          live.innerHTML = esc(t);
          if (reason === 'error') { setStatus(SR_ERRORS[err] || 'Bir sorun oldu (' + esc(err) + '). Tekrar dene ya da yaz.'); return; }
          if (reason === 'hidden') { setStatus('Dinleme durdu, metin korundu. Çözümle’ye dokunabilirsin.'); return; }
          if (!txt.value.trim()) { setStatus('Ses algılanamadı. Mikrofona dokun ve konuş.'); return; }
          setStatus('Anlaşıldı ✓'); go();
        },
        onCancel: function () { setListening(false); live.innerHTML = ''; txt.value = base; setStatus('İptal edildi. Mikrofona dokun ve konuş.'); }
      });
      setStatus('Mikrofon açılıyor…');
      try { vs.start(); } catch (err) { setStatus('Sesli giriş başlatılamadı. Yazarak ekleyebilirsin.'); }
    }
    mic.addEventListener('click', function () {
      if (!SR) { txt.focus(); return; }
      if (vs && vs.active()) vs.stop('tap'); else start();
    });
    cancelBtn.addEventListener('click', function () { if (vs) vs.cancel(); });
    s.body.addEventListener('click', function (e) { var ex = e.target.closest('[data-ex]'); if (ex) { if (vs) vs.cancel(); txt.value = ex.getAttribute('data-ex'); edited = true; } });
    txt.addEventListener('input', function () { edited = true; });
    txt.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    s.foot.querySelector('[data-go]').addEventListener('click', go);
    if (!SR) {
      mic.style.opacity = '.5';
      setStatus('Bu tarayıcı sesli girişi desteklemiyor.<br><span class="small">Klavyedeki 🎤 dikte tuşuyla konuşarak yazabilirsin.</span>');
      setTimeout(function () { try { txt.focus(); } catch (e) { /* */ } }, 320);
    } else {
      setStatus('Mikrofona dokun ve konuş. Bitirince tekrar dokun.');
      if (o.autostart !== false) start();
    }
  }

  /** Ekle merkezi (orta düğme) */
  function openAddHub() {
    var s = openSheet({ title: 'Ekle' });
    s.setBody('<div class="hub-grid">' +
      '<button type="button" class="hub-btn primary" data-h="voice"><span class="hb-ic">' + icon('mic') + '</span><span>Sesle söyle<br><small>“2 yumurta ve bir bardak çay”</small></span></button>' +
      '<button type="button" class="hub-btn" data-h="search"><span class="hb-ic">' + icon('search') + '</span>Besin ara<small>Veritabanı, son ve favoriler</small></button>' +
      '<button type="button" class="hub-btn" data-h="quick"><span class="hb-ic">' + icon('bolt') + '</span>Hızlı kalori<small>Sadece kcal gir</small></button>' +
      '<button type="button" class="hub-btn" data-h="meals"><span class="hb-ic">' + icon('bookmark') + '</span>Öğünlerim<small>' + state.meals.length + ' kayıtlı öğün</small></button>' +
      '<button type="button" class="hub-btn" data-h="weight"><span class="hb-ic">' + icon('scale') + '</span>Kilo gir<small>Trend kilonu güncelle</small></button>' +
      '<button type="button" class="hub-btn" data-h="water"><span class="hb-ic" style="color:var(--water)">' + icon('drop') + '</span>Su +1 bardak<small>' + state.settings.glassMl + ' ml</small></button>' +
      '<button type="button" class="hub-btn" data-h="custom"><span class="hb-ic">' + icon('utensils') + '</span>Yeni besin<small>Kendi besinini oluştur</small></button></div>');
    s.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-h]'); if (!b) return;
      var h = b.getAttribute('data-h');
      s.close();
      if (h === 'voice') openVoice();
      else if (h === 'search') openSearch({});
      else if (h === 'quick') openQuickKcal({});
      else if (h === 'meals') openMyMeals();
      else if (h === 'weight') { location.hash = '#kilo'; setTimeout(function () { var i = $('#wform input[name="kg"]'); if (i) i.focus(); }, 350); }
      else if (h === 'water') { var d = ensureDay(viewDate); d.water = Math.min(40, (d.water || 0) + 1); save(); render(); notifySync(); toast('+1 bardak su 💧'); }
      else if (h === 'custom') openCustomFood({});
    });
  }

  function openProfileEdit() {
    var pr = Object.assign({}, state.profile);
    var cw = currentWeight();
    var s = openSheet({ title: 'Profil ve hedef', full: true });
    s.setBody('<div class="field"><span>Cinsiyet</span><div class="seg">' + [['k', 'Kadın'], ['e', 'Erkek']].map(function (x) { return '<button type="button" data-sex="' + x[0] + '" class="' + (pr.sex === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="grid-2"><label class="field"><span>Yaş</span><input class="input" name="age" inputmode="numeric" value="' + pr.age + '"></label><label class="field"><span>Boy (cm)</span><input class="input" name="height" inputmode="numeric" value="' + pr.height + '"></label></div>' +
      '<div class="grid-2"><label class="field"><span>Başlangıç kilosu (' + wU() + ')</span><input class="input" name="weight" inputmode="decimal" value="' + fmt(toDisp(pr.weight), 1) + '"></label><label class="field"><span>Hedef kilo (' + wU() + ')</span><input class="input" name="goal" inputmode="decimal" value="' + fmt(toDisp(pr.goal), 1) + '"></label></div>' +
      '<label class="field"><span>Aktivite düzeyi</span><select class="select" name="activity">' + ACTIVITY.map(function (a) { return '<option value="' + a.id + '"' + (pr.activity === a.id ? ' selected' : '') + '>' + a.label + ' — ' + a.desc + '</option>'; }).join('') + '</select></label>' +
      '<div class="field"><span>Haftalık tempo</span><div class="seg">' + PACES.map(function (p) { return '<button type="button" data-pace="' + p.v + '" class="' + (pr.pace === p.v ? 'on' : '') + '">' + fmt(p.v, 2) + ' kg</button>'; }).join('') + '</div></div>' +
      '<div class="hint js-prev"></div><p class="tiny faint">Hesaplama güncel trend kilonla (' + fmtW(cw) + ') yapılır. Elle belirlediğin kalori hedefi varsa korunur.</p>');
    s.setFoot('<button type="button" class="btn btn-primary btn-lg btn-block" data-ok>Kaydet</button>');
    function read() {
      var g = function (n) { return parseNum(s.body.querySelector('[name="' + n + '"]').value); };
      return { sex: pr.sex, age: g('age'), height: g('height'), weight: fromDisp(g('weight')), goal: fromDisp(g('goal')), activity: s.body.querySelector('[name="activity"]').value, pace: pr.pace, startDate: pr.startDate };
    }
    function valid(p) { return p.age >= 14 && p.age <= 100 && p.height >= 120 && p.height <= 230 && p.weight >= 30 && p.weight <= 400 && p.goal >= 30 && p.goal <= 400; }
    function prev() {
      var p = read(), el = s.body.querySelector('.js-prev');
      if (!valid(p)) { el.textContent = 'Değerleri kontrol et.'; return; }
      var t = calcTargets(p, cw);
      if (state.manual.on) { el.innerHTML = 'Önerilen günlük hedef: <b>' + fmt(t.kcal) + ' kcal</b><br>Elle belirlediğin <b>' + fmt(state.manual.kcal) + ' kcal</b> hedefi geçerli kalır.'; return; }
      el.innerHTML = 'Yeni günlük hedef: <b>' + fmt(t.kcal) + ' kcal</b> · P ' + t.p + ' · K ' + t.c + ' · Y ' + t.f + ' g' + (t.floorApplied ? '<br>Güvenlik alt sınırı uygulandı.' : '');
    }
    s.body.addEventListener('click', function (e) {
      var sx = e.target.closest('[data-sex]'), pc = e.target.closest('[data-pace]');
      if (sx) { pr.sex = sx.getAttribute('data-sex'); $$('[data-sex]', s.body).forEach(function (b) { b.classList.toggle('on', b === sx); }); prev(); }
      if (pc) { pr.pace = +pc.getAttribute('data-pace'); $$('[data-pace]', s.body).forEach(function (b) { b.classList.toggle('on', b === pc); }); prev(); }
    });
    s.body.addEventListener('input', prev);
    s.body.addEventListener('change', prev);
    s.foot.querySelector('[data-ok]').addEventListener('click', function () {
      var p = read();
      if (!valid(p)) { toast('Değerleri kontrol et.'); return; }
      p.weight = Math.round(p.weight * 10) / 10; p.goal = Math.round(p.goal * 10) / 10;
      state.profile = p; applyTargets();
      save(); s.close(); render(); toast('Profil güncellendi · hedef ' + fmt(state.targets.kcal) + ' kcal');
    });
    prev();
  }

  /* ------------------------ Elle kalori hedefi ------------------------ */
  function setManualOn(on) {
    if (on) {
      var k = state.manual.kcal >= MANUAL_MIN ? state.manual.kcal : recommendedKcal();
      state.manual = { on: true, kcal: clamp(Math.round(k), MANUAL_MIN, MANUAL_MAX) };
    } else {
      state.manual = { on: false, kcal: state.manual.kcal }; // değer hatırlanır, hesaplanan hedefe dönülür
    }
    applyTargets(); save(); render();
    toast(on ? 'Kendi hedefin etkin' : 'Hesaplanan hedefe dönüldü: ' + fmt(state.targets.kcal) + ' kcal');
  }
  function saveManualTarget() {
    var inp = $('#manual-kcal'); if (!inp) return;
    var v = parseNum(inp.value);
    if (!(v >= MANUAL_MIN && v <= MANUAL_MAX)) { toast(fmt(MANUAL_MIN) + '–' + fmt(MANUAL_MAX) + ' kcal arasında bir değer gir.'); return; }
    v = Math.round(v);
    state.manual = { on: true, kcal: v };
    applyTargets(); save(); render();
    toast(v < kcalFloor(state.profile.sex) ? 'Hedef kaydedildi: ' + fmt(v) + ' kcal. Önerilen alt sınırın altında; dikkatli ol.' : 'Hedef kaydedildi: ' + fmt(v) + ' kcal');
  }
  function updateManualWarn() {
    var inp = $('#manual-kcal'), el = $('#manual-warn'); if (!inp || !el) return;
    var h = manualHint(parseNum(inp.value), state.profile.sex);
    el.hidden = !h.html; el.innerHTML = h.html;
  }

  /* ======================================================================
     Veri dışa/içe aktarma ve sıfırlama
     ====================================================================== */
  function exportData() {
    var blob = new Blob([JSON.stringify(Object.assign({ app: 'zayifla', exportedAt: new Date().toISOString() }, state), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'zayifla-yedek-' + todayKey() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    toast('Yedek dosyası indirildi');
  }
  function importData(file) {
    var r = new FileReader();
    r.onload = function () {
      var d;
      try { d = JSON.parse(r.result); } catch (e) { toast('Dosya okunamadı: geçerli bir JSON değil.'); return; }
      if (!d || typeof d !== 'object' || (!d.days && !d.profile)) { toast('Bu bir Zayıfla yedeği gibi görünmüyor.'); return; }
      var clean = sanitize(d), nd = Object.keys(clean.days).length;
      confirmSheet('Yedek geri yüklensin mi?', 'Yedekte ' + nd + ' günlük kayıt ve ' + clean.weights.length + ' tartı var. <b>Bu cihazdaki mevcut verilerin yerini alacak.</b>', 'Geri yükle', true).then(function (ok) {
        if (!ok) return;
        state = clean; invalidateFoods(); applyTargets(); save(); applyTheme(); viewDate = todayKey(); render(); notifySync(); toast('Yedek geri yüklendi');
      });
    };
    r.onerror = function () { toast('Dosya okunamadı.'); };
    r.readAsText(file);
  }
  function resetAll() {
    confirmSheet('Tüm veriler silinsin mi?', 'Profilin, tüm öğün ve kilo kayıtların, özel besinlerin ve ayarların <b>kalıcı olarak</b> silinecek. Bu işlem geri alınamaz. İstersen önce dışa aktar.', 'Her şeyi sil', true).then(function (ok) {
      if (!ok) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* */ }
      if (Z) { Z.clearAll(); coach = Z.loadSettings(); coachChat = []; coachDraft = ''; }
      state = defaults(); invalidateFoods(); ob = { step: 0, sex: null, age: '', height: '', weight: '', goal: '', activity: 'hafif', pace: 0.5, manualOn: false, manualKcal: '' };
      save(); applyTheme(); viewDate = todayKey(); notifySync(); render(); toast('Tüm veriler silindi');
    });
  }

  /* ======================================================================
     Bildirim entegrasyonu
     ====================================================================== */
  function reminderStatus() {
    var k = todayKey(), d = dayOf(k), meals = {};
    d.entries.forEach(function (e) { meals[e.meal] = (meals[e.meal] || 0) + 1; });
    return { date: k, meals: meals, weighed: state.weights.some(function (w) { return w.date === k; }), water: d.water || 0, waterGoal: state.settings.waterGoal };
  }
  var notifySync = debounce(function () { if (N) try { N.reschedule(); } catch (e) { console.error(e); } }, 400);
  function initNotify() {
    if (!N) return;
    N.init({
      getConfig: function () { return state.reminders; },
      getStatus: reminderStatus,
      getLog: function () { return state.remLog || {}; },
      setLog: function (l) { state.remLog = l; save(); },
      onInApp: function (occ) { toast('<b>' + esc(occ.title) + '</b> ' + esc(occ.body), { ms: 6000 }); }
    });
  }
  function setReminder(key, field, value) {
    var r = state.reminders[key]; if (!r) return;
    if (field === 'on' && value) {
      N.request().then(function (perm) {
        if (perm !== 'granted') {
          toast(perm === 'denied' ? 'Bildirim izni reddedildi. Tarayıcı ayarlarından izin ver.' : 'Bu cihazda bildirim kullanılamıyor.' + (N.isIOS() && !N.isStandalone() ? ' Önce Ana Ekrana ekle.' : ''));
          render(); return;
        }
        r.on = true; save(); notifySync(); render();
      });
      return;
    }
    if (field === 'on') r.on = false;
    else if (field === 'every') r.every = +value;
    else r[field] = value;
    save(); notifySync();
    if (field === 'on' || field === 'from' || field === 'to') render();
  }

  /* ======================================================================
     Olay yönetimi
     ====================================================================== */
  var actions = {
    'day-prev': function () { viewDate = addDays(viewDate, -1); render(); },
    'day-next': function () { if (viewDate < todayKey()) { viewDate = addDays(viewDate, 1); render(); } },
    'day-today': function () { viewDate = todayKey(); render(); },
    'water-plus': function () { var d = ensureDay(viewDate); d.water = Math.min(40, (d.water || 0) + 1); haptic(); save(); render(); notifySync(); },
    'water-minus': function () { var d = ensureDay(viewDate); d.water = Math.max(0, (d.water || 0) - 1); pruneDay(viewDate); save(); render(); notifySync(); },
    'water-set': function (el) { var n = +el.getAttribute('data-n'), d = ensureDay(viewDate); d.water = (d.water === n + 1) ? n : n + 1; haptic(); pruneDay(viewDate); save(); render(); notifySync(); },
    'meal-add': function (el) { openSearch({ meal: el.getAttribute('data-meal') }); },
    'entry': function (el) {
      var id = el.getAttribute('data-id'), e = dayOf(viewDate).entries.filter(function (x) { return x.id === id; })[0];
      if (!e) return;
      var food = foodById(e.foodId);
      if (food && !e.quick) openFoodDetail(food, { entry: e, date: viewDate }); else openQuickKcal({ entry: e });
    },
    'copy-meal': function (el) {
      var m = el.getAttribute('data-meal'), src = dayOf(addDays(viewDate, -1)).entries.filter(function (e) { return e.meal === m; });
      if (src.length) addItems(viewDate, m, src.map(function (e) { return Object.assign({}, e); }));
    },
    'save-meal': function (el) {
      var m = el.getAttribute('data-meal'), list = dayOf(viewDate).entries.filter(function (e) { return e.meal === m; });
      openSaveMeal(list, MEAL_BY[m].id === 'kahvalti' ? 'Benim kahvaltım' : '');
    },
    'search': function () { openSearch({}); },
    'voice': function () { openVoice(); },
    'addhub': function () { openAddHub(); },
    'install': function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (c) { if (c && c.outcome === 'accepted') toast('Yükleniyor…'); deferredPrompt = null; render(); }).catch(function () { deferredPrompt = null; });
    },
    'install-dismiss': function () { state.ui.installDismissed = true; save(); render(); },
    'adaptive-yes': function (el) {
      var v = +el.getAttribute('data-v');
      // Yalnızca kullanıcı "Uygula" dediğinde (açık onay) hedef değişir; elle hedefi hiçbir şey sessizce ezmez.
      if (!(v >= MANUAL_MIN && v <= MANUAL_MAX)) return;
      state.manual = { on: true, kcal: Math.round(v) };
      applyTargets();
      state.adaptive.dismissedAt = Date.now(); save(); render(); toast('Yeni hedef: ' + fmt(v) + ' kcal');
    },
    'adaptive-no': function () { state.adaptive.dismissedAt = Date.now(); save(); render(); },
    'wrange': function (el) { state.ui.wRange = el.getAttribute('data-v'); save(); render(); },
    'crange': function (el) { state.ui.calRange = +el.getAttribute('data-v'); calSel = null; save(); render(); },
    'open-day': function (el) { viewDate = el.getAttribute('data-k'); location.hash = '#bugun'; if (route === 'bugun') render(); },
    'weight-del': function (el) {
      var k = el.getAttribute('data-k'), old = state.weights.filter(function (w) { return w.date === k; })[0];
      state.weights = state.weights.filter(function (w) { return w.date !== k; });
      refreshTargets(); save(); render();
      toast('Tartı silindi', { action: 'Geri al', onAction: function () { if (old) { addWeight(old.date, old.kg); render(); } } });
    },
    'edit-profile': openProfileEdit,
    'manual-save': saveManualTarget,
    'check-update': function () { checkForUpdate(true); },
    'notif-perm': function () { N.request().then(function () { render(); notifySync(); }); },
    'notif-test': function () {
      N.test().then(function (r) {
        if (r === 'granted') toast('Test bildirimi gönderildi');
        else if (r === 'denied') toast('Bildirim izni reddedildi.');
        else if (r === 'unsupported') toast('Bu tarayıcı bildirimleri desteklemiyor.' + (N.isIOS() ? ' iPhone\'da önce Ana Ekrana ekle.' : ''));
        else toast('Bildirim gösterilemedi.');
        render();
      });
    },
    'theme': function (el) { state.settings.theme = el.getAttribute('data-v'); save(); applyTheme(); render(); },
    'wunit': function (el) { state.settings.wUnit = el.getAttribute('data-v'); save(); render(); },
    'wgoal': function (el) { state.settings.waterGoal = clamp(state.settings.waterGoal + (+el.getAttribute('data-v')), 1, 20); save(); render(); notifySync(); },
    'my-meals': openMyMeals,
    'my-foods': openMyFoods,
    'export': exportData,
    'import': function () { var i = $('#import-file'); if (i) i.click(); },
    'reset': resetAll,
    'coach-mode': function (el) { coach.mode = el.getAttribute('data-v'); Z.saveSettings(coach); render(); },
    'coach-chip': function (el) {
      var q = el.getAttribute('data-q');
      if (coachMode() === 'chat' && coach.key) coachSend(q);
      else { coachDraft = q; var ta = $('#coach-q-app'); if (ta) ta.value = q; }
    },
    'coach-ask-app': coachAskApp,
    'coach-clear': function () {
      confirmSheet('Sohbet temizlensin mi?', 'Koçla olan tüm mesajlar bu cihazdan silinecek. Öğün ve kilo kayıtların etkilenmez.', 'Temizle', true).then(function (ok) {
        if (!ok) return; coachChat = []; Z.clearChat(); render(); toast('Sohbet temizlendi');
      });
    },
    'coach-retry': coachRetry,
    'coach-add': function (el) { coachCard(el, true); },
    'coach-skip': function (el) { coachCard(el, false); },
    'coach-settings': function () {
      location.hash = '#ayarlar';
      setTimeout(function () { var c = $('#coach-settings'); if (c) c.scrollIntoView({ block: 'start' }); var i = $('#coach-key'); if (i) i.focus({ preventScroll: true }); }, 60);
    },
    'coach-key-save': coachSaveKey,
    'coach-key-del': function () {
      confirmSheet('API anahtarı silinsin mi?', 'Anahtar bu telefondan silinecek. Uygulama içi sohbet kapanır; “Claude uygulamasında sor” ücretsiz modu çalışmaya devam eder.', 'Sil', true).then(function (ok) {
        if (!ok) return; coach.key = ''; coach.mode = ''; Z.saveSettings(coach); render(); toast('API anahtarı silindi');
      });
    },
    'coach-test': coachTestKey,
    'coach-model': function (el) { coach.model = el.getAttribute('data-v') === 'smart' ? 'smart' : 'fast'; Z.saveSettings(coach); render(); }
  };

  document.addEventListener('click', function (e) {
    var obBtn = e.target.closest('[data-ob]');
    if (obBtn && !state.profile) { obHandle(obBtn.getAttribute('data-ob'), obBtn.getAttribute('data-v')); return; }
    var el = e.target.closest('[data-action]');
    if (!el || el.closest('.sheet')) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'coach-q-app') { coachDraft = t.value; return; }
    if (t.id === 'manual-kcal') { updateManualWarn(); return; }
    if (t.hasAttribute('data-obi')) {
      ob[t.getAttribute('data-obi')] = t.value;
      var btn = $('[data-ob="next"]'); if (btn) btn.disabled = !obValid(ob.step);
      updateObBmi(); updateObManual();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-obi')) { e.preventDefault(); obHandle('next'); }
    if (e.key === 'Enter' && e.target.id === 'manual-kcal') { e.preventDefault(); saveManualTarget(); }
    if (e.key === 'Enter' && e.target.id === 'coach-key') { e.preventDefault(); coachSaveKey(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.closest('.sheet')) return;
    if (t.getAttribute('data-action-change') === 'day-pick') { if (isValidKey(t.value) && t.value <= todayKey()) { viewDate = t.value; render(); } return; }
    if (t.getAttribute('data-manual') === 'on') { setManualOn(t.checked); return; }
    if (t.hasAttribute('data-rem')) { setReminder(t.getAttribute('data-rem'), t.getAttribute('data-field'), t.type === 'checkbox' ? t.checked : t.value); return; }
    if (t.getAttribute('data-setting') === 'glassMl') { state.settings.glassMl = +t.value; save(); render(); return; }
    if (t.id === 'import-file' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; }
  });

  // Koç mesaj çubuğu (yazı + mikrofon; konuşma tanıma openVoice ile aynı tr-TR ayarlarını kullanır)
  (function initCoachbar() {
    var form = $('#coachbar'); if (!form) return;
    var input = $('#coach-input'), mic = $('.qb-mic', form), send = $('.qb-send', form), cancelBtn = $('.qb-cancel', form), listening = false;
    mic.innerHTML = icon('mic');
    send.innerHTML = icon('send');
    function sync() { var has = !!input.value.trim(); mic.hidden = has && !listening; send.hidden = !has || listening; }
    input.addEventListener('input', sync);
    function submit() {
      var v = input.value.trim(); if (!v) return;
      if (coachBusy) { toast('Koç hâlâ cevap yazıyor…'); return; }
      input.value = ''; sync(); input.blur();
      coachSend(v);
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    var vs = null, DEF_PH = input.placeholder;
    function setListening(on) {
      listening = on; mic.classList.toggle('listening', on); mic.setAttribute('aria-pressed', on ? 'true' : 'false');
      cancelBtn.hidden = !on; input.placeholder = on ? 'Dinliyorum… bitirince dokun' : DEF_PH; sync();
    }
    mic.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!SR) { toast('Bu tarayıcı sesli girişi desteklemiyor. Klavyedeki 🎤 tuşuyla dikte edebilirsin.', { ms: 4500 }); input.focus(); return; }
      if (vs && vs.active()) { vs.stop('tap'); return; }
      var base = input.value.trim();
      vs = createVoiceSession({
        onStart: function () { setListening(true); },
        onUpdate: function (f, i) { input.value = (base + ' ' + f + ' ' + i).replace(/\s+/g, ' ').trim(); },
        onFinish: function (t, reason, err) {
          input.value = (base + ' ' + t).replace(/\s+/g, ' ').trim();
          setListening(false);
          if (reason === 'error') { toast(esc(SR_ERRORS[err] || 'Sesli giriş başarısız oldu. Yazarak devam edebilirsin.'), { ms: 4500 }); return; }
          if (reason === 'hidden') return; // metin kutuda kalır
          if (input.value.trim()) submit(); else toast(SR_ERRORS['no-speech']);
        },
        onCancel: function () { input.value = base; setListening(false); }
      });
      try { vs.start(); } catch (er) { toast('Sesli giriş başlatılamadı. Yazarak devam edebilirsin.'); }
    });
    cancelBtn.addEventListener('click', function (e) { e.preventDefault(); if (vs) vs.cancel(); });
    sync();
  })();


  // Hızlı giriş çubuğu
  (function initQuickbar() {
    var form = $('#quickbar'), input = $('#qb-input'), mic = $('.qb-mic', form), send = $('.qb-send', form);
    $('.qb-search', form).innerHTML = icon('search');
    mic.innerHTML = icon('mic');
    send.innerHTML = icon('send');
    function sync() { var has = !!input.value.trim(); mic.hidden = has; send.hidden = !has; }
    input.addEventListener('input', sync);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim(); if (!v) return;
      input.value = ''; sync(); input.blur();
      handleText(v);
    });
    form.addEventListener('click', function (e) {
      var a = e.target.closest('[data-action]'); if (!a) return;
      e.stopPropagation();
      if (a.getAttribute('data-action') === 'voice') openVoice();
      else if (a.getAttribute('data-action') === 'search') openSearch({ query: input.value.trim() });
    });
    sync();
  })();

  $$('[data-icon]').forEach(function (el) { el.innerHTML = icon(el.getAttribute('data-icon')); });

  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (h === 'ses') { location.replace('#bugun'); setTimeout(function () { openVoice(); }, 50); return; }
    var nr = routeFromHash();
    if (nr !== route) { closeAllSheets(); route = nr; calSel = null; render(); window.scrollTo(0, 0); }
  });
  window.addEventListener('resize', debounce(function () { if (route === 'ilerleme') mountProgressCharts(); else if (route === 'kilo' && $('#wmini')) weightChart($('#wmini'), '1A'); }, 200));
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var t = todayKey();
    if (t !== lastToday) { if (viewDate === lastToday) viewDate = t; lastToday = t; render(); }
  });
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { applyTheme(); if (route === 'ilerleme') mountProgressCharts(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; if (state.profile) render(); });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; toast('Zayıfla ana ekrana eklendi 🎉'); render(); });
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY) { state = load(); invalidateFoods(); if (state.profile && state.manual.on) applyTargets(); render(); }
    else if (Z && e.key && e.key.indexOf('zayifla.coach') === 0 && !coachBusy) { coach = Z.loadSettings(); coachChat = Z.loadChat(); render(); }
  });

  // Service worker ve otomatik güncelleme
  // Yeni sürüm: sw.js değişince tarayıcı yeni SW'yi kurar (skipWaiting + clients.claim), controllerchange tetiklenir,
  // sayfa bir kez yenilenir. Veriler localStorage'dadır; yenileme onları silmez. Açık form/sohbet varken yenileme ertelenir.
  var swReg = null, lastUpdateCheck = 0, UPDATE_EVERY = 30 * 60 * 1000, reloading = false, updateWaiters = [];
  var swSupported = 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);
  function setUpdStatus(t) { var el = $('#upd-status'); if (el) el.textContent = t; }
  function checkForUpdate(manual) {
    if (!swSupported || !swReg) { if (manual) { toast('Bu tarayıcıda otomatik güncelleme desteklenmiyor.'); setUpdStatus('Otomatik güncelleme bu tarayıcıda desteklenmiyor.'); } return Promise.resolve(false); }
    lastUpdateCheck = Date.now();
    if (manual) { setUpdStatus('Denetleniyor…'); }
    return swReg.update().then(function () {
      if (swReg.installing || swReg.waiting) { if (manual) { toast('Yeni sürüm bulundu, güncelleniyor…'); setUpdStatus('Yeni sürüm bulundu, güncelleniyor…'); } return true; }
      if (manual) { toast('Uygulama güncel ✓ (Sürüm ' + APP_VERSION + ')'); setUpdStatus('Uygulama güncel. Son denetim: şimdi.'); }
      return false;
    }).catch(function () {
      if (manual) { toast('Güncelleme denetlenemedi. İnternet bağlantını kontrol et.'); setUpdStatus('Denetlenemedi (çevrimdışı olabilirsin).'); }
      return false;
    });
  }
  function reloadGuardOK() {
    // Döngü koruması: son 60 sn içinde zaten güncelleme yenilemesi yapıldıysa tekrar yenileme
    try {
      var last = +sessionStorage.getItem('zayifla.reloadAt') || 0;
      if (Date.now() - last < 60000) return false;
      sessionStorage.setItem('zayifla.reloadAt', String(Date.now()));
    } catch (e) { /* sessionStorage yoksa tek seferlik bayrak yeterli (reloading) */ }
    return true;
  }
  function busyNow() { // yenileme, kaydedilmemiş bir şeyi silmesin
    if (sheetStack.length || coachBusy || coachDraft) return true;
    if (!state.profile && (ob.step > 0 || ob.age)) return true;
    var q = $('#qb-input'), c = $('#coach-input'), m = $('#manual-kcal');
    return !!((q && q.value.trim()) || (c && c.value.trim()) || (m && document.activeElement === m));
  }
  function applyUpdate(tries) {
    if (busyNow() && tries < 20) { setTimeout(function () { applyUpdate(tries + 1); }, 3000); return; }
    if (busyNow() || !reloadGuardOK()) { toast('Uygulama güncellendi ✓', { action: 'Yenile', onAction: function () { location.reload(); }, ms: 8000 }); return; }
    setTimeout(function () { location.reload(); }, 1400);
  }
  if (swSupported) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) {
      swReg = reg; checkForUpdate(false);
    }).catch(function (err) { console.warn('SW kaydı başarısız', err); });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      notifySync();
      if (!hadController) { hadController = true; return; } // ilk kurulum: sayfa zaten güncel, yenileme gerekmez
      if (reloading) return;
      reloading = true;
      toast('Uygulama güncellendi ✓', { ms: 1600 });
      applyUpdate(0);
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'navigate' && d.url) { var h = d.url.split('#')[1]; if (h) location.hash = '#' + h; }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - lastUpdateCheck > UPDATE_EVERY) checkForUpdate(false);
    });
  }

  /* ======================================================================
     Başlat
     ====================================================================== */
  applyTheme();
  if (state.profile && state.manual.on) applyTargets(); // elle hedefin makroları güncel kiloya göre
  var startHash = (location.hash || '').replace('#', '');
  route = routeFromHash();
  render();
  if (startHash === 'ses' && state.profile) { history.replaceState(null, '', '#bugun'); setTimeout(function () { openVoice({ autostart: false }); }, 200); }
  initNotify();
  if (!storageOK) toast('Tarayıcı depolaması kapalı; veriler kaydedilemeyecek.');
  // ~2.700 besinin arama dizinini boşta kur: ilk yazışta / ilk sesli girişte bekleme olmasın
  (function prebuildIndex() {
    var run = function () { try { P.buildIndex(allFoods()); P.searchFoods('a', allFoods(), { limit: 1 }); } catch (e) { /* yoksay */ } };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 600);
  })();

  // Test ve hata ayıklama için
  window.Zayifla = { state: function () { return state; }, parse: parseText, version: APP_VERSION, coachContext: coachContext };
})();
