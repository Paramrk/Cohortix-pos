import { useState, useEffect, useCallback, useRef } from 'react';
import { Order, Expense, MenuItem, PricingRule } from './types';
import { supabase } from './lib/supabase';

const PRICING_RULE_STORAGE_KEY = 'pos_pricing_rule_v1';
const PRICING_RULE_MENU_NAME = '__pricing_rule__';
const PRICING_RULE_MENU_CATEGORY = '__system__';
const ORDER_SYNC_INTERVAL_MS = 12000;
const DEFAULT_PRICING_RULE: PricingRule = {
  discountPercent: 0,
  bogoEnabled: false,
};

function clampDiscountPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function readPricingRule(): PricingRule {
  try {
    const raw = localStorage.getItem(PRICING_RULE_STORAGE_KEY);
    if (!raw) return DEFAULT_PRICING_RULE;
    const parsed = JSON.parse(raw) as Partial<PricingRule>;
    return {
      discountPercent: clampDiscountPercent(parsed.discountPercent ?? 0),
      bogoEnabled: Boolean(parsed.bogoEnabled),
    };
  } catch {
    return DEFAULT_PRICING_RULE;
  }
}

function isPricingRuleMenuRow(row: Record<string, unknown>) {
  return row.name === PRICING_RULE_MENU_NAME && row.category === PRICING_RULE_MENU_CATEGORY;
}

function pricingRuleFromMenuRow(row: Record<string, unknown>): PricingRule {
  return {
    discountPercent: clampDiscountPercent(Number(row.price ?? 0)),
    bogoEnabled: Number(row.dish_price ?? 0) > 0,
  };
}

// Helper: today's start/end as unix ms
function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

function isTodayTimestamp(timestamp: number) {
  const { start, end } = todayRange();
  return timestamp >= start && timestamp <= end;
}

// Map DB row → MenuItem
function toMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    id: row.id as string,
    name: row.name as string,
    price: Number(row.price),
    dishPrice: row.dish_price != null ? Number(row.dish_price) : undefined,
    category: row.category as string,
    hasVariants: (row.has_variants as boolean) || false,
    hasGolaVariants: (row.has_gola_variants as boolean) || false,
    golaVariantPrices: row.gola_variant_prices ? (row.gola_variant_prices as any) : undefined,
  };
}

// Map DB row → Order
function toOrder(row: Record<string, unknown>): Order {
  const rawInstructions =
    typeof row.order_instructions === 'string'
      ? row.order_instructions
      : typeof row.instructions === 'string'
        ? row.instructions
        : null;

  return {
    id: row.id as string,
    orderNumber: row.order_number as number,
    customerName: row.customer_name as string,
    orderInstructions: rawInstructions ? rawInstructions : undefined,
    items: row.items as Order['items'],
    total: Number(row.total),
    status: row.status as Order['status'],
    paymentMethod: row.payment_method as Order['paymentMethod'],
    paymentStatus: row.payment_status as Order['paymentStatus'],
    timestamp: row.timestamp as number,
  };
}

// Map DB row → Expense
function toExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    description: row.description as string,
    amount: Number(row.amount),
    timestamp: row.timestamp as number,
  };
}

function upsertOrder(list: Order[], order: Order) {
  const existing = list.find((item) => item.id === order.id);
  const mergedOrder =
    existing && !order.orderInstructions && existing.orderInstructions
      ? { ...order, orderInstructions: existing.orderInstructions }
      : order;
  return [mergedOrder, ...list.filter((item) => item.id !== order.id)].sort((a, b) => b.timestamp - a.timestamp);
}

function upsertMenuItem(list: MenuItem[], menuItem: MenuItem) {
  const index = list.findIndex((item) => item.id === menuItem.id);
  if (index === -1) return [...list, menuItem];

  const next = [...list];
  next[index] = menuItem;
  return next;
}

function buildOrderFingerprint(order: {
  timestamp: number;
  customerName: string;
  total: number;
  itemCount: number;
}) {
  return `${order.timestamp}|${order.customerName}|${order.total}|${order.itemCount}`;
}

function isMissingColumnError(error: { code?: string; message?: string } | null, column: string) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${column}' column`)
  );
}

export function useStore() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricingRule, setPricingRule] = useState<PricingRule>(() => readPricingRule());
  const [incomingOrderNotification, setIncomingOrderNotification] = useState<Order | null>(null);
  const [ordersRealtimeConnected, setOrdersRealtimeConnected] = useState(false);
  const localInsertFingerprintsRef = useRef<Map<string, number>>(new Map());

  const persistPricingRuleToSupabase = useCallback(async (rule: PricingRule) => {
    const rowWithGola = {
      name: PRICING_RULE_MENU_NAME,
      category: PRICING_RULE_MENU_CATEGORY,
      price: clampDiscountPercent(rule.discountPercent),
      dish_price: rule.bogoEnabled ? 1 : 0,
      has_variants: false,
      has_gola_variants: false,
      gola_variant_prices: null,
    };
    const rowLegacy = {
      name: PRICING_RULE_MENU_NAME,
      category: PRICING_RULE_MENU_CATEGORY,
      price: clampDiscountPercent(rule.discountPercent),
      dish_price: rule.bogoEnabled ? 1 : 0,
      has_variants: false,
    };

    const { data: existingRows } = await supabase
      .from('menu_items')
      .select('id')
      .eq('name', PRICING_RULE_MENU_NAME)
      .eq('category', PRICING_RULE_MENU_CATEGORY)
      .limit(1);
    const existingId = existingRows?.[0]?.id as string | undefined;

    if (existingId) {
      let { error } = await supabase.from('menu_items').update(rowWithGola).eq('id', existingId);
      if (isMissingColumnError(error, 'gola_variant_prices') || isMissingColumnError(error, 'has_gola_variants')) {
        ({ error } = await supabase.from('menu_items').update(rowLegacy).eq('id', existingId));
      }
      return;
    }

    let { error } = await supabase.from('menu_items').insert(rowWithGola);
    if (isMissingColumnError(error, 'gola_variant_prices') || isMissingColumnError(error, 'has_gola_variants')) {
      ({ error } = await supabase.from('menu_items').insert(rowLegacy));
    }
  }, []);

  // Initial data fetch
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { start, end } = todayRange();

    const [menuRes, ordersRes, expensesRes] = await Promise.all([
      supabase.from('menu_items').select('*').order('created_at'),
      supabase.from('orders').select('*').gte('timestamp', start).lte('timestamp', end).order('timestamp', { ascending: false }),
      supabase.from('expenses').select('*').order('timestamp', { ascending: false }),
    ]);

    if (menuRes.data) {
      const pricingRow = menuRes.data.find((row) => isPricingRuleMenuRow(row as Record<string, unknown>));
      if (pricingRow) {
        const nextRule = pricingRuleFromMenuRow(pricingRow as Record<string, unknown>);
        setPricingRule(nextRule);
        localStorage.setItem(PRICING_RULE_STORAGE_KEY, JSON.stringify(nextRule));
      }
      setMenuItems(
        menuRes.data
          .filter((row) => !isPricingRuleMenuRow(row as Record<string, unknown>))
          .map(toMenuItem)
      );
    }
    if (ordersRes.data) setOrders(ordersRes.data.map(toOrder));
    if (expensesRes.data) setExpenses(expensesRes.data.map(toExpense));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refreshOrders = useCallback(async () => {
    const { start, end } = todayRange();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .gte('timestamp', start)
      .lte('timestamp', end)
      .order('timestamp', { ascending: false });
    if (!error && data) {
      setOrders(data.map(toOrder));
    }
  }, []);

  // Realtime sync: keep menu and orders consistent across POS + customer devices.
  useEffect(() => {
    const ordersChannel = supabase
      .channel('pos-live-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id as string | undefined;
            if (!deletedId) return;
            setOrders((prev) => prev.filter((order) => order.id !== deletedId));
            return;
          }

          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;

          const parsed = toOrder(row);
          if (!isTodayTimestamp(parsed.timestamp)) return;

          if (payload.eventType === 'INSERT') {
            const fingerprint = buildOrderFingerprint({
              timestamp: parsed.timestamp,
              customerName: parsed.customerName,
              total: parsed.total,
              itemCount: parsed.items.length,
            });
            const expiresAt = localInsertFingerprintsRef.current.get(fingerprint);
            const isLocalInsert = typeof expiresAt === 'number' && expiresAt > Date.now();
            localInsertFingerprintsRef.current.delete(fingerprint);

            setOrders((prev) => upsertOrder(prev, parsed));
            if (!isLocalInsert) {
              setIncomingOrderNotification(parsed);
            }
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setOrders((prev) => upsertOrder(prev, parsed));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setOrdersRealtimeConnected(true);
          return;
        }
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setOrdersRealtimeConnected(false);
          void refreshOrders();
        }
      });

    const menuChannel = supabase
      .channel('pos-live-menu')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id as string | undefined;
            if (!deletedId) return;
            const deletedName = payload.old?.name as string | undefined;
            const deletedCategory = payload.old?.category as string | undefined;
            if (deletedName === PRICING_RULE_MENU_NAME && deletedCategory === PRICING_RULE_MENU_CATEGORY) {
              const resetRule = DEFAULT_PRICING_RULE;
              setPricingRule(resetRule);
              localStorage.setItem(PRICING_RULE_STORAGE_KEY, JSON.stringify(resetRule));
              return;
            }
            setMenuItems((prev) => prev.filter((item) => item.id !== deletedId));
            return;
          }

          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;

           if (isPricingRuleMenuRow(row)) {
            const nextRule = pricingRuleFromMenuRow(row);
            setPricingRule(nextRule);
            localStorage.setItem(PRICING_RULE_STORAGE_KEY, JSON.stringify(nextRule));
            return;
          }

          const parsed = toMenuItem(row);
          setMenuItems((prev) => upsertMenuItem(prev, parsed));
        }
      )
      .subscribe();

    return () => {
      setOrdersRealtimeConnected(false);
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(menuChannel);
    };
  }, [refreshOrders]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!ordersRealtimeConnected) {
        void refreshOrders();
      }
    }, ORDER_SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [ordersRealtimeConnected, refreshOrders]);

  useEffect(() => {
    const onFocus = () => {
      void refreshOrders();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshOrders]);

  // Derive today's order counter
  const getNextOrderNumber = useCallback(async (): Promise<number> => {
    const { start, end } = todayRange();
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', start)
      .lte('timestamp', end);
    return (count ?? 0) + 1;
  }, []);

  const addOrder = useCallback(async (orderData: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>) => {
    const orderNumber = await getNextOrderNumber();
    const timestamp = Date.now();
    const fingerprint = buildOrderFingerprint({
      timestamp,
      customerName: orderData.customerName,
      total: orderData.total,
      itemCount: orderData.items.length,
    });
    localInsertFingerprintsRef.current.set(fingerprint, Date.now() + 15000);

    const newOrder = {
      order_number: orderNumber,
      customer_name: orderData.customerName,
      order_instructions: orderData.orderInstructions ?? null,
      items: orderData.items,
      total: orderData.total,
      status: orderData.status,
      payment_method: orderData.paymentMethod,
      payment_status: orderData.paymentStatus,
      timestamp,
    };

    const legacyOrder = {
      order_number: orderNumber,
      customer_name: orderData.customerName,
      items: orderData.items,
      total: orderData.total,
      status: orderData.status,
      payment_method: orderData.paymentMethod,
      payment_status: orderData.paymentStatus,
      timestamp,
    };

    let { data, error } = await supabase.from('orders').insert(newOrder).select().single();
    if (isMissingColumnError(error, 'order_instructions')) {
      ({ data, error } = await supabase.from('orders').insert(legacyOrder).select().single());
    }

    if (!error && data) {
      const inserted = toOrder(data);
      if (!inserted.orderInstructions && orderData.orderInstructions) {
        inserted.orderInstructions = orderData.orderInstructions;
      }
      setOrders((prev) => upsertOrder(prev, inserted));
      return;
    }
    localInsertFingerprintsRef.current.delete(fingerprint);
  }, [getNextOrderNumber]);

  const updateOrderStatus = useCallback(async (id: string, status: 'pending' | 'completed') => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (!error) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    }
  }, []);

  const updatePayment = useCallback(async (id: string, method: 'cash' | 'upi') => {
    const { error } = await supabase
      .from('orders')
      .update({ payment_method: method, payment_status: 'paid' })
      .eq('id', id);
    if (!error) {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, paymentMethod: method, paymentStatus: 'paid' } : o))
      );
    }
  }, []);

  const clearPayment = useCallback(async (id: string, updatedTotal?: number) => {
    const safeAmount =
      typeof updatedTotal === 'number' && Number.isFinite(updatedTotal) && updatedTotal > 0
        ? Math.round(updatedTotal)
        : undefined;
    const payload: { payment_method: 'pay_later'; payment_status: 'unpaid'; total?: number } = {
      payment_method: 'pay_later',
      payment_status: 'unpaid',
    };
    if (safeAmount !== undefined) {
      payload.total = safeAmount;
    }

    const { error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', id);
    if (!error) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                paymentMethod: 'pay_later',
                paymentStatus: 'unpaid',
                total: safeAmount ?? o.total,
              }
            : o
        )
      );
    }
  }, []);

  const addExpense = useCallback(async (description: string, amount: number) => {
    const newExpense = { description, amount, timestamp: Date.now() };
    const { data, error } = await supabase.from('expenses').insert(newExpense).select().single();
    if (!error && data) {
      setExpenses((prev) => [toExpense(data), ...prev]);
    }
  }, []);

  const addMenuItem = useCallback(async (item: Omit<MenuItem, 'id'>) => {
    const rowWithGola = {
      name: item.name,
      price: item.hasGolaVariants ? (item.golaVariantPrices?.['Plain'] ?? item.price) : item.price,
      dish_price: item.dishPrice ?? null,
      category: item.category,
      has_variants: item.hasVariants ?? false,
      has_gola_variants: item.hasGolaVariants ?? false,
      gola_variant_prices: item.hasGolaVariants ? item.golaVariantPrices ?? null : null,
    };
    const rowLegacy = {
      name: item.name,
      price: item.hasGolaVariants ? (item.golaVariantPrices?.['Plain'] ?? item.price) : item.price,
      dish_price: item.dishPrice ?? null,
      category: item.category,
      has_variants: item.hasVariants ?? false,
    };

    let { data, error } = await supabase.from('menu_items').insert(rowWithGola).select().single();
    if (isMissingColumnError(error, 'gola_variant_prices') || isMissingColumnError(error, 'has_gola_variants')) {
      ({ data, error } = await supabase.from('menu_items').insert(rowLegacy).select().single());
    }
    if (error) throw new Error(error.message);
    if (data) {
      setMenuItems((prev) => [...prev, toMenuItem(data)]);
    }
  }, []);

  const updateMenuItem = useCallback(async (id: string, updatedItem: Omit<MenuItem, 'id'>) => {
    const rowWithGola = {
      name: updatedItem.name,
      price: updatedItem.hasGolaVariants ? (updatedItem.golaVariantPrices?.['Plain'] ?? updatedItem.price) : updatedItem.price,
      dish_price: updatedItem.dishPrice ?? null,
      category: updatedItem.category,
      has_variants: updatedItem.hasVariants ?? false,
      has_gola_variants: updatedItem.hasGolaVariants ?? false,
      gola_variant_prices: updatedItem.hasGolaVariants ? updatedItem.golaVariantPrices ?? null : null,
    };
    const rowLegacy = {
      name: updatedItem.name,
      price: updatedItem.hasGolaVariants ? (updatedItem.golaVariantPrices?.['Plain'] ?? updatedItem.price) : updatedItem.price,
      dish_price: updatedItem.dishPrice ?? null,
      category: updatedItem.category,
      has_variants: updatedItem.hasVariants ?? false,
    };

    let { error } = await supabase.from('menu_items').update(rowWithGola).eq('id', id);
    if (isMissingColumnError(error, 'gola_variant_prices') || isMissingColumnError(error, 'has_gola_variants')) {
      ({ error } = await supabase.from('menu_items').update(rowLegacy).eq('id', id));
    }
    if (error) throw new Error(error.message);
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...updatedItem, id } : m)));
  }, []);

  const deleteMenuItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (!error) {
      setMenuItems((prev) => prev.filter((m) => m.id !== id));
    }
  }, []);

  const clearData = useCallback(async () => {
    if (!window.confirm('Are you sure you want to clear all data? This cannot be undone.')) return;
    const { start, end } = todayRange();
    await Promise.all([
      supabase.from('orders').delete().gte('timestamp', start).lte('timestamp', end),
      supabase.from('expenses').delete().gte('timestamp', 0),
    ]);
    setOrders([]);
    setExpenses([]);
  }, []);

  const clearIncomingOrderNotification = useCallback(() => {
    setIncomingOrderNotification(null);
  }, []);

  const updatePricingRule = useCallback((next: Partial<PricingRule>) => {
    setPricingRule((prev) => {
      const merged: PricingRule = {
        discountPercent: clampDiscountPercent(next.discountPercent ?? prev.discountPercent),
        bogoEnabled: next.bogoEnabled ?? prev.bogoEnabled,
      };
      localStorage.setItem(PRICING_RULE_STORAGE_KEY, JSON.stringify(merged));
      void persistPricingRuleToSupabase(merged);
      return merged;
    });
  }, [persistPricingRuleToSupabase]);

  return {
    menuItems,
    orders,
    expenses,
    loading,
    pricingRule,
    ordersRealtimeConnected,
    incomingOrderNotification,
    addOrder,
    updateOrderStatus,
    updatePayment,
    clearPayment,
    updatePricingRule,
    addExpense,
    clearData,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    clearIncomingOrderNotification,
  };
}

