import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Store, ClipboardList, BarChart3, Settings, BellRing, LogOut, Download, Sparkles } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { useStore } from './store';
import { NewOrder } from './components/NewOrder';
import { OrderQueue } from './components/OrderQueue';
import { Dashboard } from './components/Dashboard';
import { MenuManager } from './components/MenuManager';
import { AuthGate } from './components/AuthGate';
import { supabase } from './lib/supabase';
import type { Order } from './types';
import { usePushNotifications } from './hooks/usePushNotifications';
import { showLocalNotification } from './lib/pushNotifications';

type Tab = 'new-order' | 'queue' | 'dashboard' | 'menu';
const ORDER_ALERTS_ENABLED_STORAGE_KEY = 'pos_order_alerts_enabled_v1';

const COHORTIX_LIGHT_LOGO = `${import.meta.env.BASE_URL}cohortix/logo-name-lightheme.png`;
const COHORTIX_DARK_LOGO = `${import.meta.env.BASE_URL}cohortix/darktheme-logo-name.png`;

const DARK_THEMES = new Set([
  'theme-dark',
  'theme-eclipse',
  'theme-abyss',
  'theme-carbon',
  'theme-emerald-night',
  'theme-rose-noir',
]);

function isColorDark(hex: string) {
  if (!hex || hex[0] !== '#') return false;
  const cleanHex = hex.length === 4 
    ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    : hex;
  const rgb = parseInt(cleanHex.substring(1), 16);
  if (isNaN(rgb)) return false;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 140;
}

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
  const isActive = activeTab === tab;
  return (
    <button
      onClick={() => onSelect(tab)}
      className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all relative scale-98 active:scale-95 duration-150 ${
        isActive
          ? 'bg-secondary-container text-on-secondary-container rounded-full px-4 py-1.5 my-1.5 md:my-0 md:rounded-none md:bg-transparent md:border-b-2 md:border-secondary md:text-secondary md:px-6 md:py-4 md:flex-1'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container py-3 md:py-4 px-2 md:px-6 md:flex-1'
      }`}
    >
      <div className="relative">
        <Icon className={`w-6 h-6 md:w-5 md:h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
        {badge > 0 && (
          <span className="absolute -top-2 -right-2 bg-error text-on-error text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] md:text-sm font-medium ${isActive ? 'font-bold font-headline' : ''}`}>
        {label}
      </span>
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('new-order');
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [appInstalled, setAppInstalled] = useState(false);
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_theme') || 'theme-default';
    } catch {
      return 'theme-default';
    }
  });

  const [customPrimary, setCustomPrimary] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_custom_primary') || '#000000';
    } catch {
      return '#000000';
    }
  });

  const [customSecondary, setCustomSecondary] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_custom_secondary') || '#006c49';
    } catch {
      return '#006c49';
    }
  });

  const [customBackground, setCustomBackground] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_custom_background') || '#f8f9ff';
    } catch {
      return '#f8f9ff';
    }
  });

  const [customSurface, setCustomSurface] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_custom_surface') || '#ffffff';
    } catch {
      return '#ffffff';
    }
  });

  const [customText, setCustomText] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_custom_text') || '#0b1c30';
    } catch {
      return '#0b1c30';
    }
  });

  const isDark = theme === 'theme-custom'
    ? isColorDark(customBackground)
    : DARK_THEMES.has(theme);

  const logoSrc = isDark ? COHORTIX_DARK_LOGO : COHORTIX_LIGHT_LOGO;

  useEffect(() => {
    try {
      localStorage.setItem('pos_custom_primary', customPrimary);
    } catch {}
  }, [customPrimary]);

  useEffect(() => {
    try {
      localStorage.setItem('pos_custom_secondary', customSecondary);
    } catch {}
  }, [customSecondary]);

  useEffect(() => {
    try {
      localStorage.setItem('pos_custom_background', customBackground);
    } catch {}
  }, [customBackground]);

  useEffect(() => {
    try {
      localStorage.setItem('pos_custom_surface', customSurface);
    } catch {}
  }, [customSurface]);

  useEffect(() => {
    try {
      localStorage.setItem('pos_custom_text', customText);
    } catch {}
  }, [customText]);

  useEffect(() => {
    try {
      localStorage.setItem('pos_theme', theme);
    } catch {}
    const doc = document.documentElement;
    doc.classList.remove(
      'theme-default',
      'theme-ocean',
      'theme-sunset',
      'theme-lavender',
      'theme-forest',
      'theme-dark',
      'theme-nordic',
      'theme-rose',
      'theme-amber',
      'theme-plum',
      'theme-charcoal',
      'theme-crimson',
      'theme-sage',
      'theme-steel',
      'theme-terracotta',
      'theme-sakura',
      'theme-citrus',
      'theme-midnight',
      'theme-eclipse',
      'theme-abyss',
      'theme-carbon',
      'theme-emerald-night',
      'theme-rose-noir',
      'theme-custom'
    );
    doc.classList.add(theme);

    if (theme === 'theme-custom') {
      doc.style.setProperty('--primary', customPrimary);
      doc.style.setProperty('--secondary', customSecondary);
      doc.style.setProperty('--primary-container', `${customPrimary}1a`);
      doc.style.setProperty('--on-primary-container', customPrimary);
      doc.style.setProperty('--secondary-container', `${customSecondary}33`);
      doc.style.setProperty('--on-secondary-container', customSecondary);
      
      doc.style.setProperty('--background', customBackground);
      doc.style.setProperty('--surface', customBackground);
      doc.style.setProperty('--surface-container-lowest', customSurface);
      doc.style.setProperty('--surface-container', customSurface);
      doc.style.setProperty('--on-surface', customText);
      doc.style.setProperty('--on-background', customText);
      doc.style.setProperty('--on-surface-variant', `${customText}b3`); // 70% opacity
      doc.style.setProperty('--outline-variant', `${customText}26`); // 15% opacity
    } else {
      doc.style.removeProperty('--primary');
      doc.style.removeProperty('--secondary');
      doc.style.removeProperty('--primary-container');
      doc.style.removeProperty('--on-primary-container');
      doc.style.removeProperty('--secondary-container');
      doc.style.removeProperty('--on-secondary-container');
      doc.style.removeProperty('--background');
      doc.style.removeProperty('--surface');
      doc.style.removeProperty('--surface-container-lowest');
      doc.style.removeProperty('--surface-container');
      doc.style.removeProperty('--on-surface');
      doc.style.removeProperty('--on-background');
      doc.style.removeProperty('--on-surface-variant');
      doc.style.removeProperty('--outline-variant');
    }
  }, [theme, customPrimary, customSecondary, customBackground, customSurface, customText]);

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

  const handlePushTabSwitch = useCallback((tab: 'queue') => {
    setActiveTab(tab);
  }, []);

  const { pushEnabled, pushStatus, pushLoading, enablePush, disablePush } =
    usePushNotifications(handlePushTabSwitch);

  const handleTogglePush = useCallback(
    (enabled: boolean) => {
      if (enabled) void enablePush();
      else void disablePush();
    },
    [enablePush, disablePush],
  );
  const {
    orders, expenses, menuItems, loading,
    addOrder, updateOrderDetails, cancelOrder, updateOrderStatus, updatePayment, clearPayment, addExpense, clearData,
    addMenuItem, updateMenuItem, renameMenuCategory, deleteMenuItem, updatePricingRule,
    customerAppSettings, customerAppSettingsLoading, customerAppSettingsSaving, updateCustomerAIEnabled,
    incomingOrderNotification, clearIncomingOrderNotification,
    ordersRealtimeConnected, pricingRule,
    orderPending, orderError, clearOrderError,
    ordersPermissionError,
    dashboardMetrics, dashboardMetricsLoading,
    analyticsFilter, analyticsRange, analyticsOrders, analyticsExpenses, analyticsLoading, analyticsError, refreshAnalytics,
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

    const isNewOrder = lastPlayedOrderIdRef.current !== incomingOrderNotification.id;

    if (isNewOrder) {
      lastPlayedOrderIdRef.current = incomingOrderNotification.id;

      // Layer 1: play in-app chime (if alerts enabled)
      if (orderAlertsEnabled) {
        playIncomingOrderAlert();
      }

      // Layer 1: fire OS notification via SW (if push enabled + permission granted)
      if (pushEnabled && Notification.permission === 'granted') {
        const order = incomingOrderNotification;
        const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
        void showLocalNotification('New Order Received', {
          body: [
            `#${order.orderNumber} — ${order.customerName}`,
            `${itemCount} item${itemCount !== 1 ? 's' : ''}`,
            `Rs ${order.total}`,
          ].filter(Boolean).join(' | '),
          tag: `order-${order.id}`,
          data: { orderId: order.id, tab: 'queue' },
        });
      }
    }

    if (!orderAlertsEnabled && !pushEnabled) {
      clearIncomingOrderNotification();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearIncomingOrderNotification();
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [incomingOrderNotification, clearIncomingOrderNotification, orderAlertsEnabled, playIncomingOrderAlert, pushEnabled]);

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
    // beforeinstallprompt only fires on Android; iOS uses different mechanism
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
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      if (subscription?.subscription) {
        subscription.subscription.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (session) {
      void refreshAll();
      void refreshAnalytics('day');
    }
  }, [refreshAll, refreshAnalytics, session]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
          <p className="text-on-surface-variant text-sm font-medium">Checking staff session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthGate />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
          <p className="text-on-surface-variant text-sm font-medium">Loading Cohortix POS...</p>
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
    <div className="min-h-dvh bg-background flex flex-col font-sans overflow-x-hidden">
      {/* Header (Desktop) */}
      <header className="bg-surface border-b border-outline-variant sticky top-0 z-10 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-surface-container-lowest p-1.5 rounded-lg border border-outline-variant shadow-sm">
                <img
                  src={logoSrc}
                  alt="Cohortix logo"
                  className="h-8 w-auto object-contain"
                />
              </div>
              <h1 className="text-xl font-bold text-on-surface tracking-tight">Cohortix POS</h1>
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
                  className="h-10 px-3 rounded-lg border border-secondary-container bg-secondary-container/20 text-on-secondary-container hover:bg-secondary-container/40 flex items-center gap-2 text-sm font-semibold"
                >
                  <Download className="w-4 h-4" />
                  Install App
                </button>
              )}
              <button
                type="button"
                onClick={() => { void handleSignOut(); }}
                className="h-10 px-3 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container flex items-center gap-2 text-sm font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="bg-surface border-b border-outline-variant md:hidden sticky top-0 z-10 shadow-sm"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-2 px-3 h-14">
          <div className="bg-surface-container-lowest p-1 rounded-lg border border-outline-variant shadow-sm shrink-0">
            <img
              src={logoSrc}
              alt="Cohortix logo"
              className="h-7 w-auto object-contain"
            />
          </div>
          <h1 className="text-base font-bold text-on-surface tracking-tight flex-1 min-w-0 truncate">Cohortix POS</h1>
          {canInstallApp && (
            <button
              type="button"
              onClick={() => { void handleInstallApp(); }}
              className="h-8 px-2.5 rounded-lg border border-secondary-container bg-secondary-container/20 text-on-secondary-container flex items-center justify-center gap-1.5 text-xs font-semibold shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
          )}
          <button
            type="button"
            onClick={() => { void handleSignOut(); }}
            className="h-8 w-8 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container flex items-center justify-center shrink-0"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {serviceAlerts.length > 0 && (
        <div className="border-b border-outline-variant bg-surface/90 backdrop-blur-sm">
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
            editingOrder={editingOrder}
            onUpdateOrder={updateOrderDetails}
            onExitEditMode={() => setEditingOrder(null)}
            pricingRule={pricingRule}
            orderPending={orderPending}
            orderError={orderError}
            onClearOrderError={clearOrderError}
            showVoiceAssistant={showVoiceAssistant}
            setShowVoiceAssistant={setShowVoiceAssistant}
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
            pushEnabled={pushEnabled}
            pushStatus={pushStatus}
            pushLoading={pushLoading}
            onTogglePush={handleTogglePush}
            onUpdateStatus={updateOrderStatus}
            onUpdatePayment={updatePayment}
            onClearPayment={clearPayment}
            onCancelOrder={cancelOrder}
            onRequestModifyOrder={(order) => {
              setEditingOrder(order);
              setActiveTab('new-order');
            }}
          />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard
            onAddExpense={addExpense}
            onClearData={clearData}
            customerAIEnabled={customerAppSettings.customerAIEnabled}
            customerAISettingsLoading={customerAppSettingsLoading}
            customerAISettingsSaving={customerAppSettingsSaving}
            metrics={dashboardMetrics}
            metricsLoading={dashboardMetricsLoading}
            analyticsFilter={analyticsFilter}
            analyticsRange={analyticsRange}
            analyticsOrders={analyticsOrders}
            analyticsExpenses={analyticsExpenses}
            analyticsLoading={analyticsLoading}
            analyticsError={analyticsError}
            onChangeAnalyticsFilter={(nextFilter) => {
              void refreshAnalytics(nextFilter);
            }}
            onToggleCustomerAI={updateCustomerAIEnabled}
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
            theme={theme}
            onChangeTheme={setTheme}
            customPrimary={customPrimary}
            onChangeCustomPrimary={setCustomPrimary}
            customSecondary={customSecondary}
            onChangeCustomSecondary={setCustomSecondary}
            customBackground={customBackground}
            onChangeCustomBackground={setCustomBackground}
            customSurface={customSurface}
            onChangeCustomSurface={setCustomSurface}
            customText={customText}
            onChangeCustomText={setCustomText}
          />
        )}
      </main>

      <footer className="hidden md:block bg-surface border-t border-outline-variant py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-3">
          <img
            src={logoSrc}
            alt="Cohortix"
            className="h-6 w-auto object-contain"
          />
          <span className="text-xs font-medium text-on-surface-variant">Powered by Cohortix</span>
        </div>
      </footer>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-outline-variant flex justify-around items-start z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <NavButton tab="new-order" icon={Store} label="Order" activeTab={activeTab} onSelect={setActiveTab} />
        <NavButton tab="queue" icon={ClipboardList} label="Queue" badge={pendingCount} activeTab={activeTab} onSelect={setActiveTab} />
        <NavButton tab="dashboard" icon={BarChart3} label="Stats" activeTab={activeTab} onSelect={setActiveTab} />
        <NavButton tab="menu" icon={Settings} label="Menu" activeTab={activeTab} onSelect={setActiveTab} />
      </nav>

      {/* Global Animated AI Assistant Floating Button */}
      {!showVoiceAssistant && (
        <button
          type="button"
          onClick={() => {
            setActiveTab('new-order');
            setShowVoiceAssistant(true);
          }}
          className="fixed z-40 right-6 md:right-8 bottom-20 md:bottom-8 w-14 h-14 rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 group overflow-hidden animate-ai-button cursor-pointer"
          title="Open AI Assistant"
        >
          <Sparkles className="w-6 h-6 text-white group-hover:rotate-12 transition-transform duration-300" />
        </button>
      )}

      {incomingOrderNotification && orderAlertsEnabled && (
        <button
          type="button"
          onClick={() => {
            setActiveTab('queue');
            clearIncomingOrderNotification();
          }}
          className="fixed right-3 md:right-6 mobile-floating-offset md:bottom-6 z-30 w-[calc(100%-1.5rem)] md:w-auto max-w-sm bg-secondary text-white rounded-xl shadow-xl p-4 text-left hover:opacity-90 transition-opacity"
        >
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">New Order Received</p>
              <p className="text-sm text-secondary-container">
                #{incomingOrderNotification.orderNumber} | {incomingOrderNotification.customerName}
              </p>
              <p className="text-xs text-secondary-container mt-1">
                {incomingOrderNotification.items.reduce((sum, item) => sum + item.quantity, 0)} items | Rs {incomingOrderNotification.total}
              </p>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
