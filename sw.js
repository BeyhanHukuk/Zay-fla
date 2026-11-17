/* Zayıfla service worker: çevrimdışı önbellek + hatırlatıcılar */
'use strict';
var VERSION = 'zayifla-v1.0.1';
var CONFIG_CACHE = 'zayifla-config';
var CONFIG_URL = './__reminders.json';
var ASSETS = [
  './', './index.html', './styles.css', './app.js', './parser.js', './charts.js', './notify.js', './foods.js',
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
      return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== CONFIG_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Ağ öncelikli (güncel sürüm), çevrimdışıysa önbellek
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put('./index.html', copy); }); }
        return res;
      }).catch(function () {
        return caches.match('./index.html', { ignoreSearch: true }).then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }
  // Varlıklar: önbellekten hemen ver, arkada güncelle (stale-while-revalidate)
  event.respondWith(
    caches.open(VERSION).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(function () { return cached; });
        if (cached) { event.waitUntil(net.catch(function () { })); return cached; }
        return net;
      });
    })
  );
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
