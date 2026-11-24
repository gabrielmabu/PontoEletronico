/* Service worker do Ponto: deixa o app abrir rápido e guarda os modelos do rosto.
   As chamadas ao servidor (script.google.com) NUNCA passam pelo cache. */
var VERSAO = 'ponto-v3';
var SHELL = ['./', './index.html', './logo.jpg', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO && k.indexOf('ponto-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;                                   // API é POST: segue direto
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;

  // Modelos do face-api, biblioteca e fontes: não mudam → cache primeiro.
  if (url.hostname === 'cdn.jsdelivr.net' || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSAO).then(function (c) {
      return c.match(req).then(function (r) {
        return r || fetch(req).then(function (resp) { if (resp.ok || resp.type === 'opaque') c.put(req, resp.clone()); return resp; });
      });
    }));
    return;
  }

  // Arquivos do próprio app: rede primeiro (pega atualização), cache se estiver sem internet.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(function (resp) {
      if (resp.ok) { var cp = resp.clone(); caches.open(VERSAO).then(function (c) { c.put(req, cp); }); }
      return resp;
    }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('./index.html'); }); }));
  }
});
