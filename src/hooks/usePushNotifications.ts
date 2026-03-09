/**
 * usePushNotifications.ts
 *
 * React hook that manages the full push notification lifecycle:
 *  - Tracks permission state + active subscription
 *  - Exposes enable / disable helpers for UI controls
 *  - Listens for SW messages to handle notification clicks (tab switch)
 *  - Restores persisted preference on mount
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentSubscription,
  getNotificationPermission,
  isNotificationSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/pushNotifications';

const PUSH_ENABLED_KEY = 'pos_push_notifications_enabled_v1';

export type PushStatus =
  | 'unsupported'   // browser does not support push or VAPID key missing
  | 'default'       // permission not yet requested
  | 'denied'        // user blocked notifications
  | 'subscribed'    // actively subscribed
  | 'unsubscribed'; // supported + granted but not currently subscribed

interface UsePushNotificationsReturn {
  pushStatus: PushStatus;
  pushEnabled: boolean;
  pushLoading: boolean;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
}

export function usePushNotifications(
  onTabSwitch?: (tab: 'queue') => void,
): UsePushNotificationsReturn {
  const [pushStatus, setPushStatus] = useState<PushStatus>('unsupported');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // ── Derive initial status on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!isNotificationSupported()) {
      setPushStatus('unsupported');
      return;
    }

    const permission = getNotificationPermission();

    if (permission === 'denied') {
      setPushStatus('denied');
      setPushEnabled(false);
      return;
    }

    if (permission === 'granted') {
      // Already granted — restore saved preference
      let preferred = false;
      try { preferred = localStorage.getItem(PUSH_ENABLED_KEY) === 'true'; } catch { /* ignore */ }
      if (preferred) {
        setPushStatus('subscribed');
        setPushEnabled(true);
        // Silently try to re-establish Web Push subscription in background (Layer 2)
        void getCurrentSubscription().then((sub) => {
          if (!sub) void subscribeToPush();
        });
      } else {
        setPushStatus('unsubscribed');
        setPushEnabled(false);
      }
    } else {
      // 'default' — not yet asked
      setPushStatus('default');
      setPushEnabled(false);
    }
  }, []);

  // ── Handle SW → app messages (notification click → tab switch) ─────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION_CLICK' && event.data?.tab) {
        onTabSwitch?.(event.data.tab as 'queue');
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [onTabSwitch]);

  // ── Enable push ─────────────────────────────────────────────────────────────
  const enablePush = useCallback(async () => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      // Step 1: request permission (Layer 1 — in-app SW notifications)
      const permission = await import('../lib/pushNotifications').then(m => m.requestPermission());
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'default');
        setPushEnabled(false);
        return;
      }

      // Permission granted — Layer 1 is now active (in-app notifications work)
      setPushStatus('subscribed');
      setPushEnabled(true);
      try { localStorage.setItem(PUSH_ENABLED_KEY, 'true'); } catch { /* ignore */ }

      // Step 2: attempt Web Push subscription (Layer 2 — background push)
      // This may silently fail if VAPID key not set; Layer 1 still works.
      void subscribeToPush();
    } catch {
      setPushEnabled(false);
    } finally {
      setPushLoading(false);
    }
  }, [pushLoading]);

  // ── Disable push ────────────────────────────────────────────────────────────
  const disablePush = useCallback(async () => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      await unsubscribeFromPush();
      setPushStatus('unsubscribed');
      setPushEnabled(false);
      try { localStorage.setItem(PUSH_ENABLED_KEY, 'false'); } catch { /* ignore */ }
    } catch {
      /* Ignore errors — UI will still reflect the change */
    } finally {
      setPushLoading(false);
    }
  }, [pushLoading]);

  return { pushStatus, pushEnabled, pushLoading, enablePush, disablePush };
}
