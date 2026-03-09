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
  isPushSupported,
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
    if (!isPushSupported()) {
      setPushStatus('unsupported');
      return;
    }

    const permission = getNotificationPermission();
    if (permission === 'denied') {
      setPushStatus('denied');
      setPushEnabled(false);
      return;
    }

    // Check if there is already an active subscription
    void getCurrentSubscription().then((sub) => {
      if (sub) {
        setPushStatus('subscribed');
        setPushEnabled(true);
        // Persist preference
        try { localStorage.setItem(PUSH_ENABLED_KEY, 'true'); } catch { /* ignore */ }
      } else {
        // Restore preference: if user had it on but SW lost the subscription, re-subscribe
        let preferred = false;
        try { preferred = localStorage.getItem(PUSH_ENABLED_KEY) === 'true'; } catch { /* ignore */ }
        if (preferred && permission === 'granted') {
          // Silently re-subscribe in the background
          void subscribeToPush().then((newSub) => {
            if (newSub) {
              setPushStatus('subscribed');
              setPushEnabled(true);
            } else {
              setPushStatus('unsubscribed');
              setPushEnabled(false);
            }
          });
        } else {
          setPushStatus(permission === 'granted' ? 'unsubscribed' : 'default');
          setPushEnabled(false);
        }
      }
    });
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
      const sub = await subscribeToPush();
      if (sub) {
        setPushStatus('subscribed');
        setPushEnabled(true);
        try { localStorage.setItem(PUSH_ENABLED_KEY, 'true'); } catch { /* ignore */ }
      } else {
        const perm = getNotificationPermission();
        if (perm === 'denied') {
          setPushStatus('denied');
        } else {
          setPushStatus('unsubscribed');
        }
        setPushEnabled(false);
      }
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
