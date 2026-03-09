/**
 * pushNotifications.ts
 *
 * Low-level utilities for managing Web Push subscriptions.
 * Handles service worker registration, permission requests, subscribing /
 * unsubscribing from the Push API, and persisting subscriptions to Supabase.
 */

import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SHOP_ID = (import.meta.env.VITE_SHOP_ID as string | undefined) ?? 'main';

// ─── Capability checks ────────────────────────────────────────────────────────

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// ─── VAPID key conversion ────────────────────────────────────────────────────

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

// ─── Service worker helpers ──────────────────────────────────────────────────

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // The app already registers sw.js at root scope in main.tsx
    return (await navigator.serviceWorker.ready) ?? null;
  } catch {
    return null;
  }
}

// ─── Permission & subscription ───────────────────────────────────────────────

export async function requestPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

/**
 * Subscribe the current device to Web Push and persist the subscription
 * to the `push_subscriptions` table in Supabase.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY is not set — push notifications are disabled.');
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
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return;

  const json = subscription.toJSON();
  const keys = json.keys as { p256dh: string; auth: string } | undefined;
  if (!keys?.p256dh || !keys?.auth || !json.endpoint) return;

  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      shop_id: SHOP_ID,
    },
    { onConflict: 'endpoint' },
  );
}

async function removeSubscriptionFromDb(endpoint: string): Promise<void> {
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
