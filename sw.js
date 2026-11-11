// The app moved to habits/. This replaces the offline worker of the app that
// used to live at this address: it drops that app's cached files, removes
// itself, and reloads open pages so they reach the new app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith('habits-app-')).map(k => caches.delete(k)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: 'window' });
    pages.forEach(p => p.navigate(p.url).catch(() => {}));
  })());
});
