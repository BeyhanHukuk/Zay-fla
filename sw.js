/* Zayıfla service worker: çevrimdışı önbellek, otomatik güncelleme (skipWaiting + clients.claim) + hatırlatıcılar */
'use strict';
var VERSION = 'zayifla-v1.7.0';
var CONFIG_CACHE = 'zayifla-config';
var CONFIG_URL = './__reminders.json';
var ASSETS = [
  './', './index.html', './styles.css', './app.js', './parser.js', './charts.js', './notify.js', './coach.js', './foods.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png',
  './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

try { importScripts('./notify.js'); } catch (e) { /* hatırlatma çekirdeği yüklenemedi */ }

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { /* tek dosya hatası kurulumu bozmasın */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      // Yalnızca bu uygulamanın eski önbellekleri silinir (github.io alanı başka sitelerle ortak olabilir). Kullanıcı verisi localStorage'dadır, etkilenmez.
      return Promise.all(keys.filter(function (k) { return k.indexOf('zayifla-v') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Uygulama kabuğu (sayfa, kod, stil, manifest): ağ öncelikli, çevrimdışıysa ya da ağ yavaşsa önbellek.
// Simgeler ve besin veritabanı: önbellek öncelikli; her sürümde önbellek adı değiştiği için yeni sürümle yenilenir.
var NETWORK_TIMEOUT = 5000;
function isShell(req, url) {
  if (req.mode === 'navigate') return true;
  return /\.(?:html|js|css|json)$/.test(url.pathname) && !/\/foods\.js$/.test(url.pathname);
}
// Sunucunun "max-age=600" başlığı tarayıcının bellek önbelleğinin kabuğu 10 dakika SW'ye sormadan kullanmasına yol açar;
// yanıtı "no-cache" ile ilet ki her açılışta yine bu SW (ağ öncelikli) karar versin.
function fresh(res) {
  if (!res || res.type !== 'basic' || res.status !== 200) return res;
  var h = new Headers(res.headers);
  h.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
function networkFirst(event, req, key) {
  var cacheKey = key || req, stored = null, noop = function () { };
  var fromCache = function () {
    return caches.open(VERSION).then(function (c) {
      return c.match(cacheKey, { ignoreSearch: true }).then(function (r) { return r || (key ? c.match('./') : undefined); });
    }).catch(function () { return undefined; });
  };
  // HTTP önbelleğini atlayarak sor: GitHub Pages dosyaları birkaç dakika önbelleğe aldırabilir
  var net = fetch(req.url, { cache: 'no-cache' }).then(function (res) {
    if (res && res.ok && res.type === 'basic') {
      var copy = res.clone();
      stored = caches.open(VERSION).then(function (c) { return c.put(cacheKey, copy); }).catch(noop);
    }
    return res;
  });
  event.waitUntil(net.then(function () { return stored; }, noop));
  return new Promise(function (resolve) {
    var done = false, timer;
    function finish(r) { if (done || !r) return false; done = true; clearTimeout(timer); resolve(fresh(r)); return true; }
    timer = setTimeout(function () { fromCache().then(finish); }, NETWORK_TIMEOUT); // ağ çok yavaşsa önbellek
    net.then(function (res) {
      if (res && res.ok) finish(res);
      else fromCache().then(function (r) { finish(r || res); }); // sunucu hatası: önbellek, o da yoksa yanıtın kendisi
    }, function () {
      fromCache().then(function (r) { if (!finish(r)) { done = true; clearTimeout(timer); resolve(Response.error()); } }); // çevrimdışı
    });
  });
}
function cacheFirst(event, req) {
  return caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  // Yapay zeka API çağrıları (POST, başka alan adı) asla önbelleğe alınmaz: aşağıdaki iki kontrol onları doğrudan ağa bırakır.
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') { event.respondWith(networkFirst(event, req, './index.html')); return; }
  if (isShell(req, url)) { event.respondWith(networkFirst(event, req, null)); return; }
  event.respondWith(cacheFirst(event, req));
});

/* ---------------- Hatırlatıcılar ---------------- */
function readConfig() {
  return caches.open(CONFIG_CACHE).then(function (c) { return c.match(CONFIG_URL); })
    .then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
}
function writeConfig(data) {
  return caches.open(CONFIG_CACHE).then(function (c) {
    return c.put(CONFIG_URL, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
  });
}

self.addEventListener('message', function (event) {
  var d = event.data || {};
  if (d.type === 'reminders') {
    event.waitUntil(readConfig().then(function (old) {
      var log = Object.assign({}, (old && old.log) || {}, d.log || {});
      return writeConfig({ config: d.config, status: d.status, log: log, savedAt: Date.now() });
    }));
  } else if (d.type === 'skipWaiting') {
    self.skipWaiting();
  }
});

function checkDue() {
  var core = self.ZNotifyCore;
  if (!core) return Promise.resolve();
  return readConfig().then(function (data) {
    if (!data || !data.config) return;
    var now = Date.now();
    var occs = core.occurrences(data.config, now - 75 * 60000, now);
    var lastByKind = {};
    occs.forEach(function (o) { lastByKind[o.kind] = o; });
    var log = data.log || {};
    var shows = [];
    Object.keys(lastByKind).forEach(function (k) {
      var o = lastByKind[k];
      if (log[o.id]) return;
      log[o.id] = now;
      if (core.shouldSkip(o, data.status)) return;
      shows.push(self.registration.showNotification(o.title, core.options(o)));
      self.clients.matchAll({ includeUncontrolled: true }).then(function (cl) { cl.forEach(function (c) { c.postMessage({ type: 'fired', id: o.id }); }); });
    });
    data.log = log;
    return Promise.all(shows).then(function () { return writeConfig(data); });
  });
}

self.addEventListener('periodicsync', function (event) {
  if (event.tag === 'zayifla-reminders') event.waitUntil(checkDue());
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  var abs = new URL(target, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
          c.postMessage({ type: 'navigate', url: abs });
          return c.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(abs) : null;
    })
  );
});
