import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Store, ClipboardList, BarChart3, Settings, BellRing, LogOut, Download } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { useStore } from './store';
import { NewOrder } from './components/NewOrder';
import { OrderQueue } from './components/OrderQueue';
import { Dashboard } from './components/Dashboard';
import { MenuManager } from './components/MenuManager';
import { AuthGate } from './components/AuthGate';
import { supabase } from './lib/supabase';

type Tab = 'new-order' | 'queue' | 'dashboard' | 'menu';
const ORDER_ALERTS_ENABLED_STORAGE_KEY = 'pos_order_alerts_enabled_v1';
const COHORTIX_LOGO_SRC = `${import.meta.env.BASE_URL}cohortix/logo-name-lightheme.png`;

interface NavButtonProps {
  tab: Tab;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  activeTab: Tab;
  onSelect: (tab: Tab) => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function NavButton({ tab, icon: Icon, label, badge = 0, activeTab, onSelect }: NavButtonProps) {
  return (
    <button
      onClick={() => onSelect(tab)}
      className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 flex-1 py-3 md:py-4 px-2 md:px-6 transition-all relative ${activeTab === tab
        ? 'text-indigo-600 bg-indigo-50/50 md:bg-transparent md:border-b-2 border-indigo-600'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
        }`}
    >
      <div className="relative">
        <Icon className={`w-6 h-6 md:w-5 md:h-5 ${activeTab === tab ? 'stroke-[2.5px]' : ''}`} />
        {badge > 0 && (
          <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] md:text-sm font-medium ${activeTab === tab ? 'font-bold' : ''}`}>
        {label}
      </span>
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('new-order');
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [appInstalled, setAppInstalled] = useState(false);
  const [orderAlertsEnabled, setOrderAlertsEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(ORDER_ALERTS_ENABLED_STORAGE_KEY);
      return raw !== 'false';
    } catch {
      return true;
    }
  });
  const alertAudioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedOrderIdRef = useRef<string | null>(null);
  const {
    orders, expenses, menuItems, loading,
    addOrder, updateOrderStatus, updatePayment, clearPayment, addExpense, clearData,
    addMenuItem, updateMenuItem, renameMenuCategory, deleteMenuItem, updatePricingRule,
    incomingOrderNotification, clearIncomingOrderNotification,
    ordersRealtimeConnected, pricingRule,
    orderPending, orderError, clearOrderError,
    ordersPermissionError,
    dashboardMetrics, dashboardMetricsLoading,
    refreshAll,
  } = useStore();

  const pendingCount = useMemo(
    () => orders.filter((order) => order.status === 'pending').length,
    [orders],
  );

  const playIncomingOrderAlert = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return;
    }

    if (!alertAudioContextRef.current || alertAudioContextRef.current.state === 'closed') {
      alertAudioContextRef.current = new window.AudioContext();
    }

    const context = alertAudioContextRef.current;
    if (!context) return;
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }

    const startAt = context.currentTime + 0.02;
    const pattern = [
      { frequency: 880, duration: 0.12, offset: 0 },
      { frequency: 660, duration: 0.11, offset: 0.15 },
      { frequency: 988, duration: 0.18, offset: 0.3 },
    ];

    pattern.forEach(({ frequency, duration, offset }) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const toneStart = startAt + offset;
      const toneEnd = toneStart + duration;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, toneStart);

      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.11, toneStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(toneStart);
      osc.stop(toneEnd + 0.02);
    });

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(60);
    }
  }, []);

  useEffect(() => {
    if (!incomingOrderNotification) return;
    if (!orderAlertsEnabled) {
      clearIncomingOrderNotification();
      return;
    }
    if (lastPlayedOrderIdRef.current !== incomingOrderNotification.id) {
      playIncomingOrderAlert();
      lastPlayedOrderIdRef.current = incomingOrderNotification.id;
    }
    const timeoutId = window.setTimeout(() => {
      clearIncomingOrderNotification();
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [incomingOrderNotification, clearIncomingOrderNotification, orderAlertsEnabled, playIncomingOrderAlert]);

  const handleToggleOrderAlerts = useCallback((enabled: boolean) => {
    setOrderAlertsEnabled(enabled);
    try {
      localStorage.setItem(ORDER_ALERTS_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
      // Ignore storage failures; in-memory toggle still works.
    }
  }, []);

  const handleInstallApp = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice.catch(() => undefined);
    setInstallPromptEvent(null);
  }, [installPromptEvent]);

  useEffect(() => {
    return () => {
      if (alertAudioContextRef.current && alertAudioContextRef.current.state !== 'closed') {
        void alertAudioContextRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateInstalledState = () => {
      const standaloneByDisplayMode = window.matchMedia('(display-mode: standalone)').matches;
      const standaloneByNavigator =
        'standalone' in window.navigator &&
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setAppInstalled(standaloneByDisplayMode || standaloneByNavigator);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setAppInstalled(true);
      setInstallPromptEvent(null);
    };

    updateInstalledState();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthLoading(false);
      if (data.session) {
        void refreshAll();
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void refreshAll();
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshAll]);

  useEffect(() => {
    if (session) {
      void refreshAll();
    }
  }, [refreshAll, session]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Checking staff session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthGate loading={loading} />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Loading Cohortix POS...</p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const serviceAlerts = [
    !ordersRealtimeConnected
      ? {
        id: 'realtime',
        tone: 'amber' as const,
        message: 'Live updates delayed; queue is using fallback refresh.',
      }
      : null,
    ordersPermissionError
      ? {
        id: 'permission',
        tone: 'rose' as const,
        message: 'Staff session required for live order actions.',
      }
      : null,
    orderError
      ? {
        id: 'order',
        tone: 'rose' as const,
        message: 'Order not confirmed yet; retry only after this warning clears.',
      }
      : null,
  ].filter(Boolean) as Array<{ id: string; tone: 'amber' | 'rose'; message: string }>;
  const canInstallApp = Boolean(installPromptEvent) && !appInstalled;

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col font-sans overflow-x-hidden">
      {/* Header (Desktop) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                <img
                  src={COHORTIX_LOGO_SRC}
                  alt="Cohortix logo"
                  className="h-8 w-auto object-contain"
                />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Cohortix POS</h1>
            </div>
            <div className="flex items-center gap-2">
              <nav className="flex space-x-2">
                <NavButton tab="new-order" icon={Store} label="New Order" activeTab={activeTab} onSelect={setActiveTab} />
                <NavButton tab="queue" icon={ClipboardList} label="Orders Queue" badge={pendingCount} activeTab={activeTab} onSelect={setActiveTab} />
                <NavButton tab="dashboard" icon={BarChart3} label="Dashboard" activeTab={activeTab} onSelect={setActiveTab} />
                <NavButton tab="menu" icon={Settings} label="Menu" activeTab={activeTab} onSelect={setActiveTab} />
              </nav>
              {canInstallApp && (
                <button
                  type="button"
                  onClick={() => { void handleInstallApp(); }}
                  className="h-10 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-2 text-sm font-semibold"
                >
                  <Download className="w-4 h-4" />
                  Install App
                </button>
              )}
              <button
                type="button"
                onClick={() => { void handleSignOut(); }}
                className="h-10 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="bg-white border-b border-slate-200 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:hidden sticky top-0 z-10 flex items-center gap-2 shadow-sm">
        <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          <img
            src={COHORTIX_LOGO_SRC}
            alt="Cohortix logo"
            className="h-7 w-auto object-contain"
          />
        </div>
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">Cohortix POS</h1>
        {canInstallApp && (
          <button
            type="button"
            onClick={() => { void handleInstallApp(); }}
            className="h-9 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 flex items-center justify-center gap-2 text-xs font-semibold"
          >
            <Download className="w-4 h-4" />
            Install
          </button>
        )}
        <button
          type="button"
          onClick={() => { void handleSignOut(); }}
          className={`${canInstallApp ? '' : 'ml-auto '}h-9 w-9 rounded-lg border border-slate-200 text-slate-600 flex items-center justify-center`}
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {serviceAlerts.length > 0 && (
        <div className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto w-full p-3 sm:px-6 lg:px-8 space-y-2">
            {serviceAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border px-3 py-2 text-sm font-medium ${alert.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 overflow-visible flex flex-col">
        {activeTab === 'new-order' && (
          <NewOrder
            menuItems={menuItems}
            onPlaceOrder={addOrder}
            pricingRule={pricingRule}
            orderPending={orderPending}
            orderError={orderError}
            onClearOrderError={clearOrderError}
          />
        )}
        {activeTab === 'queue' && (
          <OrderQueue
            orders={orders}
            menuItems={menuItems}
            ordersRealtimeConnected={ordersRealtimeConnected}
            ordersPermissionError={ordersPermissionError}
            orderAlertsEnabled={orderAlertsEnabled}
            onToggleOrderAlerts={handleToggleOrderAlerts}
            onUpdateStatus={updateOrderStatus}
            onUpdatePayment={updatePayment}
            onClearPayment={clearPayment}
          />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard
            orders={orders}
            expenses={expenses}
            onAddExpense={addExpense}
            onClearData={clearData}
            metrics={dashboardMetrics}
            metricsLoading={dashboardMetricsLoading}
          />
        )}
        {activeTab === 'menu' && (
          <MenuManager
            menuItems={menuItems}
            orders={orders}
            onAdd={async (item) => {
              await addMenuItem(item);
            }}
            onUpdate={async (id, item) => {
              await updateMenuItem(id, item);
            }}
            onRenameCategory={async (currentName, nextName) => {
              await renameMenuCategory(currentName, nextName);
            }}
            onDelete={deleteMenuItem}
            pricingRule={pricingRule}
            onUpdatePricingRule={updatePricingRule}
          />
        )}
      </main>

      <footer className="hidden md:block bg-white border-t border-slate-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-3">
          <img
            src={COHORTIX_LOGO_SRC}
            alt="Cohortix"
            className="h-6 w-auto object-contain"
          />
          <span className="text-xs font-medium text-slate-500">Powered by Cohortix</span>
        </div>
      </footer>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center pb-safe mobile-nav-height z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <NavButton tab="new-order" icon={Store} label="Order" activeTab={activeTab} onSelect={setActiveTab} />
        <NavButton tab="queue" icon={ClipboardList} label="Queue" badge={pendingCount} activeTab={activeTab} onSelect={setActiveTab} />
        <NavButton tab="dashboard" icon={BarChart3} label="Stats" activeTab={activeTab} onSelect={setActiveTab} />
        <NavButton tab="menu" icon={Settings} label="Menu" activeTab={activeTab} onSelect={setActiveTab} />
      </nav>

      {incomingOrderNotification && orderAlertsEnabled && (
        <button
          type="button"
          onClick={() => {
            setActiveTab('queue');
            clearIncomingOrderNotification();
          }}
          className="fixed right-3 md:right-6 mobile-floating-offset md:bottom-6 z-30 w-[calc(100%-1.5rem)] md:w-auto max-w-sm bg-indigo-600 text-white rounded-xl shadow-xl p-4 text-left hover:bg-indigo-700 transition-colors"
        >
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">New Order Received</p>
              <p className="text-sm text-indigo-100">
                #{incomingOrderNotification.orderNumber} | {incomingOrderNotification.customerName}
              </p>
              <p className="text-xs text-indigo-100 mt-1">
                {incomingOrderNotification.items.reduce((sum, item) => sum + item.quantity, 0)} items | Rs {incomingOrderNotification.total}
              </p>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
