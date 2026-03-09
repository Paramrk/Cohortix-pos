self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Local notification (posted from app via postMessage) ────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title ?? 'New Order Received', options ?? {}),
    );
  }
});

// ─── Web Push: show notification ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'New Order Received',
      body: event.data.text(),
    };
  }

  const title = payload.title ?? 'New Order Received';
  const options = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/icons/icon-192x192.png',
    badge: payload.badge ?? '/icons/icon-96x96.png',
    tag: payload.tag ?? 'cohortix-order',
    renotify: payload.renotify ?? true,
    data: payload.data ?? {},
    // Keep the notification visible until the user interacts with it
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'view', title: 'View Order' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Web Push: handle notification click ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  // Navigate to the Queue tab (or focus it if the app is already open)
  const targetUrl = new URL('/?tab=queue', self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus the first matching open window and post a message to switch tab
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            client.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', tab: 'queue' });
            return client.focus();
          }
        }
        // No open window — open a new one
        return self.clients.openWindow(targetUrl);
      }),
  );
});
