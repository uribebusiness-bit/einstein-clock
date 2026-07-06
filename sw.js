const CACHE_NAME = 'etdt-v18';
const ASSETS = [
  './', './app.html', './offline.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-192-maskable.png',
  './icons/icon-512.png', './icons/icon-512-maskable.png',
  './widgets/clock-widget.json', './widgets/clock-data.json'
];

// ── INSTALL ───────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Cache each asset individually so one missing file can't
      // break the entire offline installation
      Promise.allSettled(ASSETS.map(a => cache.add(a)))
    )
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: cache-first, offline fallback ─────────────────────────
self.addEventListener('fetch', e => {
  // Only handle GET requests for navigation (HTML pages)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then(c => c || caches.match('./offline.html'))
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request)
      .then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match('./offline.html'))
    )
  );
});

// ── BACKGROUND SYNC ───────────────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'sync-dilation-data') {
    e.waitUntil(Promise.resolve());
  }
});

// ── PERIODIC BACKGROUND SYNC ──────────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'update-check') {
    e.waitUntil(
      caches.open(CACHE_NAME).then(cache =>
        fetch('./app.html')
          .then(resp => cache.put('./app.html', resp))
          .catch(() => {})
      )
    );
  }
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data
    ? e.data.json()
    : { title: 'Einstein Clock', body: 'Your dilation gap is accumulating.' };
  e.waitUntil(
    self.registration.showNotification(data.title || 'Einstein Clock', {
      body: data.body || 'Your head is still aging faster than your feet.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192-maskable.png',
      tag: 'etdt-notification',
      renotify: false,
      data: { url: './app.html' }
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client)
          return client.focus();
      }
      return clients.openWindow('./app.html');
    })
  );
});

// ── WIDGET SUPPORT ────────────────────────────────────────────────
self.addEventListener('widgetinstall', e => {
  e.waitUntil(updateWidget(e.widget));
});

self.addEventListener('widgetresume', e => {
  e.waitUntil(updateWidget(e.widget));
});

self.addEventListener('widgetuninstall', () => {});

async function updateWidget(widget) {
  try {
    const G = 9.80665, C = 299792458, FT_TO_M = 0.3048;
    const altM = 46 * FT_TO_M;
    const hDiffM = 5.8 * FT_TO_M;
    const fracRate = (G * hDiffM * (1 - 2 * altM / 6371000)) / (C * C);
    const nsPerHr = fracRate * 1e9 * 3600;
    const payload = JSON.stringify({ gap: nsPerHr.toFixed(6), unit: 'ns/hr', updated: new Date().toISOString() });
    if (self.widgets && widget) {
      await self.widgets.updateByTag(widget.definition.tag, { data: payload });
    }
  } catch(e) {}
}
