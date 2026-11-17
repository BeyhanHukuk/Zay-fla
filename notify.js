/*
 * Zayıfla - hatırlatıcılar.
 * Çekirdek (hesaplama) hem sayfada hem service worker'da (importScripts) çalışır: self.ZNotifyCore
 * Sayfa tarafı: window.ZNotify
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    breakfast: { on: false, time: '08:30' },
    lunch: { on: false, time: '12:30' },
    dinner: { on: false, time: '19:00' },
    water: { on: false, every: 120, from: '09:00', to: '21:00' },
    weigh: { on: false, time: '07:30' },
    evening: { on: false, time: '21:30' }
  };

  var MESSAGES = {
    breakfast: ['Kahvaltı zamanı ☀️', 'Ne yediğini söylemen ya da yazman yeterli.'],
    lunch: ['Öğle yemeği 🍽️', 'Öğününü kaydetmeyi unutma.'],
    dinner: ['Akşam yemeği 🌙', 'Akşam öğününü eklemek 10 saniye sürer.'],
    water: ['Su molası 💧', 'Bir bardak su iç ve işaretle.'],
    weigh: ['Tartılma zamanı ⚖️', 'Sabah, aç karnına tartılmak trendi daha doğru yapar.'],
    evening: ['Günü tamamla ✅', 'Bugünün kayıtlarını kontrol et; seriyi bozma!']
  };
  var MEAL_OF = { breakfast: 'kahvalti', lunch: 'ogle', dinner: 'aksam' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function atTime(day, hhmm) {
    var p = String(hhmm || '00:00').split(':');
    var d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +p[0] || 0, +p[1] || 0, 0, 0);
    return d.getTime();
  }

  function merge(cfg) {
    var out = {};
    cfg = cfg || {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = Object.assign({}, DEFAULTS[k], cfg[k] || {});
    });
    return out;
  }

  /** [fromTs, toTs] aralığındaki hatırlatma anları */
  function occurrences(cfg, fromTs, toTs) {
    cfg = merge(cfg);
    var out = [];
    var start = new Date(fromTs); start.setHours(0, 0, 0, 0);
    for (var day = new Date(start); day.getTime() <= toTs; day.setDate(day.getDate() + 1)) {
      var dk = dateKey(day);
      ['breakfast', 'lunch', 'dinner', 'weigh', 'evening'].forEach(function (k) {
        if (!cfg[k].on) return;
        var ts = atTime(day, cfg[k].time);
        if (ts >= fromTs && ts <= toTs) out.push(make(k, dk, ts));
      });
      if (cfg.water.on) {
        var every = Math.max(30, +cfg.water.every || 120) * 60000;
        var a = atTime(day, cfg.water.from), b = atTime(day, cfg.water.to);
        for (var t = a; t <= b; t += every) if (t >= fromTs && t <= toTs) out.push(make('water', dk, t));
      }
    }
    out.sort(function (x, y) { return x.ts - y.ts; });
    return out;
  }

  function make(kind, dk, ts) {
    var d = new Date(ts);
    var id = kind + ':' + dk + (kind === 'water' ? ':' + pad(d.getHours()) + pad(d.getMinutes()) : '');
    return { id: id, kind: kind, date: dk, ts: ts, title: MESSAGES[kind][0], body: MESSAGES[kind][1] };
  }

  /** Durum biliniyorsa gereksiz hatırlatmayı atla (kahvaltı zaten girilmişse vb.) */
  function shouldSkip(occ, status) {
    if (!status || status.date !== occ.date) return false;
    if (MEAL_OF[occ.kind]) return (status.meals && status.meals[MEAL_OF[occ.kind]] > 0);
    if (occ.kind === 'weigh') return !!status.weighed;
    if (occ.kind === 'water') return status.waterGoal && status.water >= status.waterGoal;
    return false;
  }

  function options(occ, base) {
    base = base || './';
    return {
      body: occ.body, tag: occ.id, renotify: false,
      icon: base + 'icons/icon-192.png', badge: base + 'icons/favicon-32.png',
      data: { zayifla: true, id: occ.id, url: base + (occ.kind === 'weigh' ? '#kilo' : '#bugun') },
      lang: 'tr-TR'
    };
  }

  var core = { DEFAULTS: DEFAULTS, MESSAGES: MESSAGES, merge: merge, occurrences: occurrences, shouldSkip: shouldSkip, options: options, dateKey: dateKey };
  G.ZNotifyCore = core;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ================================================================== */
  /* Sayfa tarafı                                                        */
  /* ================================================================== */
  var hooks = null, timers = [], started = false;

  function supported() { return typeof Notification !== 'undefined' && 'serviceWorker' in navigator; }
  function permission() { return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission; }
  function triggersSupported() { return typeof TimestampTrigger !== 'undefined' && typeof Notification !== 'undefined' && 'showTrigger' in Notification.prototype; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  function getReg() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (r) { return r || null; }).catch(function () { return null; });
  }

  function request() {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    try {
      var p = Notification.requestPermission(function () { });
      return (p && p.then ? p : Promise.resolve(Notification.permission));
    } catch (e) { return Promise.resolve(Notification.permission); }
  }

  function show(title, opts) {
    return getReg().then(function (reg) {
      if (permission() !== 'granted') return false;
      if (reg && reg.showNotification) return reg.showNotification(title, opts).then(function () { return true; });
      try { new Notification(title, opts); return true; } catch (e) { return false; }
    }).catch(function () { return false; });
  }

  function fire(occ, forceSystem) {
    var log = hooks.getLog();
    if (log[occ.id]) return;
    if (shouldSkip(occ, hooks.getStatus())) { log[occ.id] = Date.now(); hooks.setLog(log); return; }
    log[occ.id] = Date.now();
    hooks.setLog(log);
    if (!forceSystem && document.visibilityState === 'visible' && hooks.onInApp) { hooks.onInApp(occ); return; }
    show(occ.title, options(occ));
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function syncToSW() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'reminders', config: hooks.getConfig(), status: hooks.getStatus(), log: hooks.getLog() });
    } catch (e) { /* yoksay */ }
  }

  function scheduleTriggers(cfg) {
    return getReg().then(function (reg) {
      if (!reg || !reg.getNotifications) return;
      return reg.getNotifications({ includeTriggered: true }).then(function (list) {
        list.forEach(function (n) { if (n.data && n.data.zayifla && n.data.scheduled) n.close(); });
        var now = Date.now();
        var occs = occurrences(cfg, now + 1000, now + 48 * 3600e3);
        var st = hooks.getStatus();
        return Promise.all(occs.filter(function (o) { return !shouldSkip(o, st); }).map(function (o) {
          var opt = options(o);
          opt.data.scheduled = true;
          opt.showTrigger = new TimestampTrigger(o.ts); // eslint-disable-line no-undef
          return reg.showNotification(o.title, opt).catch(function () { });
        }));
      });
    }).catch(function () { });
  }

  function registerPeriodic() {
    return getReg().then(function (reg) {
      if (!reg || !('periodicSync' in reg)) return;
      var any = anyOn(hooks.getConfig());
      if (!any) return reg.periodicSync.unregister('zayifla-reminders').catch(function () { });
      var q = navigator.permissions && navigator.permissions.query ? navigator.permissions.query({ name: 'periodic-background-sync' }) : Promise.resolve({ state: 'granted' });
      return q.then(function (st) {
        if (st.state !== 'granted') return;
        return reg.periodicSync.register('zayifla-reminders', { minInterval: 60 * 60 * 1000 });
      }).catch(function () { });
    }).catch(function () { });
  }

  function anyOn(cfg) { cfg = merge(cfg); return Object.keys(cfg).some(function (k) { return cfg[k].on; }); }

  /** Kaçırılan hatırlatmaları kontrol et (uygulama açılınca / görünür olunca) */
  function checkMissed() {
    if (!hooks) return;
    var cfg = hooks.getConfig();
    if (!anyOn(cfg)) return;
    var now = Date.now();
    var occs = occurrences(cfg, now - 90 * 60000, now);
    // aynı türden yalnızca en sonuncusunu göster
    var lastByKind = {};
    occs.forEach(function (o) { lastByKind[o.kind] = o; });
    var log = hooks.getLog(), changed = false;
    occs.forEach(function (o) { if (lastByKind[o.kind] !== o && !log[o.id]) { log[o.id] = now; changed = true; } });
    if (changed) hooks.setLog(log);
    Object.keys(lastByKind).forEach(function (k) { fire(lastByKind[k]); });
  }

  function pruneLog() {
    var log = hooks.getLog(), cut = Date.now() - 3 * 864e5, changed = false;
    Object.keys(log).forEach(function (k) { if (log[k] < cut) { delete log[k]; changed = true; } });
    if (changed) hooks.setLog(log);
  }

  function reschedule() {
    if (!hooks) return;
    clearTimers();
    var cfg = hooks.getConfig();
    syncToSW();
    if (!anyOn(cfg) || permission() !== 'granted') return;
    if (triggersSupported()) scheduleTriggers(cfg);
    var now = Date.now();
    occurrences(cfg, now + 1000, now + 24 * 3600e3).forEach(function (o) {
      timers.push(setTimeout(function () { fire(o, document.visibilityState !== 'visible'); }, o.ts - now));
    });
    registerPeriodic();
  }

  function init(h) {
    hooks = h;
    if (started) return reschedule();
    started = true;
    pruneLog();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { checkMissed(); reschedule(); }
      else syncToSW();
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        var d = e.data || {};
        if (d.type === 'fired' && d.id) { var log = hooks.getLog(); log[d.id] = Date.now(); hooks.setLog(log); }
      });
      navigator.serviceWorker.ready.then(function () { syncToSW(); }).catch(function () { });
    }
    setTimeout(checkMissed, 1500);
    reschedule();
  }

  function test() {
    return request().then(function (perm) {
      if (perm !== 'granted') return perm;
      return show('Zayıfla', { body: 'Test bildirimi: hatırlatıcılar çalışıyor ✅', tag: 'zayifla-test', icon: './icons/icon-192.png', badge: './icons/favicon-32.png', data: { zayifla: true, url: './' } })
        .then(function (ok) { return ok ? 'granted' : 'error'; });
    });
  }

  window.ZNotify = {
    init: init, reschedule: reschedule, checkMissed: checkMissed, request: request, test: test,
    supported: supported, permission: permission, triggersSupported: triggersSupported,
    isIOS: isIOS, isStandalone: isStandalone, anyOn: anyOn, core: core
  };
})(typeof self !== 'undefined' ? self : this);
