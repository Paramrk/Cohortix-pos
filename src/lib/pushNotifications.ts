/**
 * pushNotifications.ts
 *
 * Two-layer notification system:
 *
 * Layer 1 — In-process SW notification (works immediately, no server needed):
 *   When the POS detects a new order via Supabase Realtime, it calls
 *   showLocalNotification() which posts a message to the Service Worker,
 *   which then calls self.registration.showNotification(). This works as
 *   long as the browser has granted Notification permission — no VAPID,
 *   no Edge Function, no webhook required.
 *
 * Layer 2 — Web Push (background, device-off notifications):
 *   subscribeToPush() registers with the Push API using a VAPID key and
 *   persists the subscription to Supabase. The Edge Function + DB Webhook
 *   then deliver pushes when the app is not open. Requires VITE_VAPID_PUBLIC_KEY.
 */

import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SHOP_ID = (import.meta.env.VITE_SHOP_ID as string | undefined) ?? 'main';

// ─── Capability checks ────────────────────────────────────────────────────────

export function isNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

export function isPushSupported(): boolean {
  return isNotificationSupported() && 'PushManager' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

// ─── Service worker helper ───────────────────────────────────────────────────

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.ready) ?? null;
  } catch {
    return null;
  }
}

// ─── Permission request ───────────────────────────────────────────────────────

export async function requestPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

// ─── Layer 1: local SW notification (triggered from Realtime) ────────────────

/**
 * Show a notification immediately via the Service Worker.
 * Called in-app whenever a new order arrives via Supabase Realtime.
 * Works without VAPID or an Edge Function.
 */
export async function showLocalNotification(
  title: string,
  options: NotificationOptions = {},
): Promise<void> {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const registration = await getRegistration();
  if (!registration) {
    // Fallback: use browser Notification API directly
    // eslint-disable-next-line no-new
    new Notification(title, options);
    return;
  }

  // Post to SW so it can call showNotification (required for persistent notifications)
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_LOCAL_NOTIFICATION',
      title,
      options: {
        body: options.body ?? '',
        icon: options.icon ?? '/icons/icon-192x192.png',
        badge: options.badge ?? '/icons/icon-96x96.png',
        tag: options.tag ?? 'cohortix-order',
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: options.data ?? {},
        actions: [
          { action: 'view', title: 'View Order' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      },
    });
  } else {
    // SW not yet controlling — use registration directly
    await registration.showNotification(title, {
      body: options.body ?? '',
      icon: options.icon ?? '/icons/icon-192x192.png',
      badge: options.badge ?? '/icons/icon-96x96.png',
      tag: options.tag ?? 'cohortix-order',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: options.data ?? {},
    } as any);
  }
}

// ─── Layer 2: Web Push subscription (VAPID) ───────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe the current device to Web Push (Layer 2).
 * Requires VITE_VAPID_PUBLIC_KEY to be set.
 * Persists the subscription to Supabase for the Edge Function to use.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    // Layer 2 not available — but Layer 1 (local SW notification) still works.
    // Just log; don't alert the user since notifications will still fire in-app.
    console.warn('[push] VITE_VAPID_PUBLIC_KEY not set — background push disabled. In-app notifications still work.');
    return null;
  }

  const permission = await requestPermission();
  if (permission !== 'granted') return null;

  const registration = await getRegistration();
  if (!registration) return null;

  // Unsubscribe any existing subscription first to avoid duplicates
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
  });

  await persistSubscription(subscription);
  return subscription;
}

/**
 * Unsubscribe the current device and remove the record from Supabase.
 */
export async function unsubscribeFromPush(): Promise<void> {
  const registration = await getRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await removeSubscriptionFromDb(endpoint);
}

/**
 * Returns the current active push subscription, if any.
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const registration = await getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// ─── Supabase persistence ────────────────────────────────────────────────────

async function persistSubscription(subscription: PushSubscription): Promise<void> {
  // Try session first, then getUser() as fallback (handles timing issues on mount)
  let userId: string | undefined;
  const { data: sessionData } = await supabase.auth.getSession();
  userId = sessionData?.session?.user?.id;
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser();
    userId = userData?.user?.id;
  }
  if (!userId) {
    console.warn('[push] Cannot persist subscription — no authenticated user found.');
    return;
  }

  const json = subscription.toJSON();
  const keys = json.keys as { p256dh: string; auth: string } | undefined;
  if (!keys?.p256dh || !keys?.auth || !json.endpoint) return;

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      shop_id: SHOP_ID,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    console.error('[push] Failed to persist subscription:', error.message);
  }
}

async function removeSubscriptionFromDb(endpoint: string): Promise<void> {
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
