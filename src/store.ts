import { useState, useEffect, useCallback, useRef } from 'react';
import { Order, Expense, MenuItem, PricingRule, OrderCreateResult, DashboardMetrics } from './types';
import { supabase } from './lib/supabase';
import { recordOrderCreate, recordRealtimeDisconnect } from './lib/telemetry';

const PRICING_RULE_STORAGE_KEY = 'pos_pricing_rule_v1';
const PRICING_RULE_MENU_NAME = '__pricing_rule__';
const PRICING_RULE_MENU_CATEGORY = '__system__';
const ORDER_SYNC_INTERVAL_MS = 12000;
const SHOP_ID = 'main';
const DEFAULT_PRICING_RULE: PricingRule = {
  discountPercent: 0,
  bogoEnabled: false,
};

function clampDiscountPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toSafeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOrderItems(value: unknown): Order['items'] {
  if (Array.isArray(value)) {
    return value as Order['items'];
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed as Order['items'];
      }
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeOrderStatus(value: unknown): Order['status'] {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'done') {
    return 'completed';
  }
  return 'pending';
}

function normalizePaymentMethod(value: unknown): Order['paymentMethod'] {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'upi') return 'upi';
  if (normalized === 'pay_later') return 'pay_later';
  return 'cash';
}

function normalizePaymentStatus(value: unknown): Order['paymentStatus'] {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'paid' ? 'paid' : 'unpaid';
}

function getBusinessDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function monthStartTimestampInIst() {
  const now = new Date();
  const year = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(now),
  );
  const month = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit' }).format(now),
  );
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`).getTime();
}

function businessDateFromTimestamp(timestamp: number) {
  return getBusinessDateString(new Date(timestamp));
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

function toMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    price: toSafeNumber(row.price),
    dishPrice: row.dish_price != null ? toSafeNumber(row.dish_price) : undefined,
    category: String(row.category ?? 'Regular'),
    hasVariants: Boolean(row.has_variants) || false,
    hasGolaVariants: Boolean(row.has_gola_variants) || false,
    golaVariantPrices: row.gola_variant_prices ? (row.gola_variant_prices as any) : undefined,
  };
}

function toOrder(row: Record<string, unknown>): Order {
  const rawInstructions =
    typeof row.order_instructions === 'string'
      ? row.order_instructions
      : typeof row.instructions === 'string'
        ? row.instructions
        : null;

  const timestamp = toSafeNumber(row.timestamp);
  const businessDate =
    typeof row.business_date === 'string' && row.business_date
      ? row.business_date
      : businessDateFromTimestamp(timestamp);

  const source = row.source === 'pos' || row.source === 'customer' ? row.source : undefined;

  return {
    id: String(row.id),
    orderNumber: toSafeNumber(row.order_number),
    customerName: String(row.customer_name ?? 'Guest'),
    orderInstructions: rawInstructions || undefined,
    items: parseOrderItems(row.items),
    total: toSafeNumber(row.total),
    status: normalizeOrderStatus(row.status),
    paymentMethod: normalizePaymentMethod(row.payment_method),
    paymentStatus: normalizePaymentStatus(row.payment_status),
    timestamp,
    businessDate,
    source,
    clientRequestId: typeof row.client_request_id === 'string' ? row.client_request_id : undefined,
    shopId: typeof row.shop_id === 'string' ? row.shop_id : undefined,
  };
}

function isOrderForCurrentShop(order: Order) {
  return !order.shopId || order.shopId === SHOP_ID;
}

function toExpense(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    description: String(row.description ?? ''),
    amount: toSafeNumber(row.amount),
    timestamp: toSafeNumber(row.timestamp),
  };
}

function toDashboardMetrics(payload: Record<string, unknown>): DashboardMetrics {
  return {
    businessDate: String(payload.business_date ?? getBusinessDateString()),
    shopId: String(payload.shop_id ?? SHOP_ID),
    todayTotalSales: toSafeNumber(payload.today_total_sales),
    todayCollected: toSafeNumber(payload.today_collected),
    todayPending: toSafeNumber(payload.today_pending),
    todayExpenses: toSafeNumber(payload.today_expenses),
    todayNetProfit: toSafeNumber(payload.today_net_profit),
    monthTotalSales: toSafeNumber(payload.month_total_sales),
    monthCollected: toSafeNumber(payload.month_collected),
    monthPending: toSafeNumber(payload.month_pending),
    monthExpenses: toSafeNumber(payload.month_expenses),
    monthNetProfit: toSafeNumber(payload.month_net_profit),
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

function isMissingColumnError(error: { code?: string; message?: string } | null, column: string) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${column}' column`)
  );
}

function isPermissionError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === '42501') return true;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes('permission denied') || message.includes('row-level security');
}

export function useStore() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricingRule, setPricingRule] = useState<PricingRule>(() => readPricingRule());
  const [incomingOrderNotification, setIncomingOrderNotification] = useState<Order | null>(null);
  const [ordersRealtimeConnected, setOrdersRealtimeConnected] = useState(false);
  const [orderPending, setOrderPending] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [dashboardMetricsLoading, setDashboardMetricsLoading] = useState(false);
  const localInsertRequestIdsRef = useRef<Map<string, number>>(new Map());

  const persistPricingRuleToSupabase = useCallback(async (rule: PricingRule) => {
    const rowWithGola = {
      name: PRICING_RULE_MENU_NAME,
      category: PRICING_RULE_MENU_CATEGORY,
      price: clampDiscountPercent(rule.discountPercent),
      dish_price: rule.bogoEnabled ? 1 : 0,
      has_variants: false,
      has_gola_variants: false,
      gola_variant_prices: null,
      shop_id: SHOP_ID,
    };
    const rowLegacy = {
      name: PRICING_RULE_MENU_NAME,
      category: PRICING_RULE_MENU_CATEGORY,
      price: clampDiscountPercent(rule.discountPercent),
      dish_price: rule.bogoEnabled ? 1 : 0,
      has_variants: false,
    };

    let query = supabase
      .from('menu_items')
      .select('id')
      .eq('name', PRICING_RULE_MENU_NAME)
      .eq('category', PRICING_RULE_MENU_CATEGORY)
      .limit(1);

    const withShopId = await query.eq('shop_id', SHOP_ID);
    const existingRows = (withShopId.data ?? []).length > 0 || !isMissingColumnError(withShopId.error, 'shop_id')
      ? withShopId.data
      : (await supabase
          .from('menu_items')
          .select('id')
          .eq('name', PRICING_RULE_MENU_NAME)
          .eq('category', PRICING_RULE_MENU_CATEGORY)
          .limit(1)).data;

    const existingId = existingRows?.[0]?.id as string | undefined;

    if (existingId) {
      let { error } = await supabase.from('menu_items').update(rowWithGola).eq('id', existingId);
      if (isMissingColumnError(error, 'gola_variant_prices') || isMissingColumnError(error, 'has_gola_variants') || isMissingColumnError(error, 'shop_id')) {
        ({ error } = await supabase.from('menu_items').update(rowLegacy).eq('id', existingId));
      }
      if (error) {
        console.error('Failed to persist pricing rule', error.code, error.message);
      }
      return;
    }

    let { error } = await supabase.from('menu_items').insert(rowWithGola);
    if (isMissingColumnError(error, 'gola_variant_prices') || isMissingColumnError(error, 'has_gola_variants') || isMissingColumnError(error, 'shop_id')) {
      ({ error } = await supabase.from('menu_items').insert(rowLegacy));
    }
    if (error) {
      console.error('Failed to insert pricing rule row', error.code, error.message);
    }
  }, []);

  const refreshDashboardMetrics = useCallback(async () => {
    setDashboardMetricsLoading(true);
    const startedAt = performance.now();
    const { data, error } = await supabase.rpc('get_dashboard_metrics', {
      p_business_date: getBusinessDateString(),
      p_shop_id: SHOP_ID,
    });

    if (!error && data) {
      const raw = Array.isArray(data) ? data[0] : data;
      if (raw && typeof raw === 'object') {
        setDashboardMetrics(toDashboardMetrics(raw as Record<string, unknown>));
      }
    } else if (error && !isPermissionError(error)) {
      console.error('Failed to fetch dashboard metrics', error.code, error.message);
    }

    setDashboardMetricsLoading(false);
    console.info('[telemetry]', JSON.stringify({
      type: 'dashboard_metrics_fetch',
      latencyMs: Math.round(performance.now() - startedAt),
      success: !error,
    }));
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const businessDate = getBusinessDateString();
    const monthStartMs = monthStartTimestampInIst();

    const menuReq = supabase.from('menu_items').select('*').eq('shop_id', SHOP_ID).order('created_at');
    const ordersReq = supabase
      .from('orders')
      .select('*')
      .eq('business_date', businessDate)
      .eq('shop_id', SHOP_ID)
      .order('timestamp', { ascending: false });
    const expensesReq = supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', SHOP_ID)
      .gte('timestamp', monthStartMs)
      .order('timestamp', { ascending: false });

    const [menuRes, ordersRes, expensesRes] = await Promise.all([menuReq, ordersReq, expensesReq]);

    let menuData = menuRes.data;
    if (isMissingColumnError(menuRes.error, 'shop_id')) {
      const fallback = await supabase.from('menu_items').select('*').order('created_at');
      menuData = fallback.data;
    }

    if (menuData) {
      const pricingRow = menuData.find((row) => isPricingRuleMenuRow(row as Record<string, unknown>));
      if (pricingRow) {
        const nextRule = pricingRuleFromMenuRow(pricingRow as Record<string, unknown>);
        setPricingRule(nextRule);
        localStorage.setItem(PRICING_RULE_STORAGE_KEY, JSON.stringify(nextRule));
      }
      setMenuItems(
        menuData
          .filter((row) => !isPricingRuleMenuRow(row as Record<string, unknown>))
          .map(toMenuItem),
      );
    }

    if (ordersRes.data) {
      setOrders(ordersRes.data.map((row) => toOrder(row as Record<string, unknown>)));
    } else if (isMissingColumnError(ordersRes.error, 'business_date') || isMissingColumnError(ordersRes.error, 'shop_id')) {
      // Backward compatibility path before migration is applied.
      const fallback = await supabase.from('orders').select('*').order('timestamp', { ascending: false });
      if (fallback.data) {
        const today = getBusinessDateString();
        setOrders(
          fallback.data
            .map((row) => toOrder(row as Record<string, unknown>))
            .filter((order) => order.businessDate === today),
        );
      }
    } else if (ordersRes.error && !isPermissionError(ordersRes.error)) {
      console.error('Failed to fetch orders', ordersRes.error.code, ordersRes.error.message);
    }

    if (expensesRes.data) {
      setExpenses(expensesRes.data.map((row) => toExpense(row as Record<string, unknown>)));
    } else if (isMissingColumnError(expensesRes.error, 'shop_id')) {
      const fallback = await supabase
        .from('expenses')
        .select('*')
        .gte('timestamp', monthStartMs)
        .order('timestamp', { ascending: false });
      if (fallback.data) {
        setExpenses(fallback.data.map((row) => toExpense(row as Record<string, unknown>)));
      }
    } else if (expensesRes.error && !isPermissionError(expensesRes.error)) {
      console.error('Failed to fetch expenses', expensesRes.error.code, expensesRes.error.message);
    }

    setLoading(false);
    void refreshDashboardMetrics();
  }, [refreshDashboardMetrics]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const refreshOrders = useCallback(async () => {
    const businessDate = getBusinessDateString();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('business_date', businessDate)
      .eq('shop_id', SHOP_ID)
      .order('timestamp', { ascending: false });

    if (!error && data) {
      setOrders(data.map((row) => toOrder(row as Record<string, unknown>)));
      return;
    }

    if ((isMissingColumnError(error, 'business_date') || isMissingColumnError(error, 'shop_id')) && error) {
      const fallback = await supabase.from('orders').select('*').order('timestamp', { ascending: false });
      if (fallback.data) {
        const today = getBusinessDateString();
        setOrders(
          fallback.data
            .map((row) => toOrder(row as Record<string, unknown>))
            .filter((order) => order.businessDate === today),
        );
      }
      return;
    }

    if (error && !isPermissionError(error)) {
      console.error('Failed to refresh orders', error.code, error.message);
    }
  }, []);

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
            void refreshDashboardMetrics();
            return;
          }

          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;

          const parsed = toOrder(row);
          if (!isOrderForCurrentShop(parsed)) return;
          if (parsed.businessDate !== getBusinessDateString()) return;

          if (payload.eventType === 'INSERT') {
            const requestId = parsed.clientRequestId;
            const expiresAt = requestId ? localInsertRequestIdsRef.current.get(requestId) : undefined;
            const isLocalInsert = typeof expiresAt === 'number' && expiresAt > Date.now();
            if (requestId) localInsertRequestIdsRef.current.delete(requestId);

            setOrders((prev) => upsertOrder(prev, parsed));
            if (!isLocalInsert && parsed.source === 'customer') {
              setIncomingOrderNotification(parsed);
            }
            void refreshDashboardMetrics();
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setOrders((prev) => upsertOrder(prev, parsed));
            void refreshDashboardMetrics();
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setOrdersRealtimeConnected(true);
          void refreshOrders();
          return;
        }
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setOrdersRealtimeConnected(false);
          recordRealtimeDisconnect('pos', 'pos-live-orders', status);
          void refreshOrders();
        }
      });

    const menuChannel = supabase
      .channel('pos-live-menu')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `shop_id=eq.${SHOP_ID}` },
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
        },
      )
      .subscribe((status) => {
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          recordRealtimeDisconnect('pos', 'pos-live-menu', status);
        }
      });

    return () => {
      setOrdersRealtimeConnected(false);
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(menuChannel);
    };
  }, [refreshDashboardMetrics, refreshOrders]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      // Reconcile queue state periodically so order sync remains correct even if realtime drops events.
      void refreshOrders();
    }, ORDER_SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshOrders]);

  useEffect(() => {
    const onFocus = () => {
      void refreshOrders();
      void refreshDashboardMetrics();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDashboardMetrics, refreshOrders]);

  const addOrder = useCallback(async (orderData: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>): Promise<OrderCreateResult | null> => {
    setOrderPending(true);
    setOrderError(null);

    const startedAt = performance.now();
    const clientRequestId = crypto.randomUUID();
    localInsertRequestIdsRef.current.set(clientRequestId, Date.now() + 30000);

    const itemsPayload = orderData.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.calculatedPrice,
      variantName: item.variant,
    }));

    const { data, error } = await supabase.rpc('create_order_atomic', {
      p_customer_name: orderData.customerName,
      p_items: itemsPayload,
      p_total: Math.round(orderData.total),
      p_payment_method: orderData.paymentMethod,
      p_payment_status: orderData.paymentStatus,
      p_order_instructions: orderData.orderInstructions ?? null,
      p_source: 'pos',
      p_client_request_id: clientRequestId,
      p_shop_id: SHOP_ID,
    });

    setOrderPending(false);

    if (error) {
      localInsertRequestIdsRef.current.delete(clientRequestId);
      const message = isPermissionError(error)
        ? 'Sign in as staff to create orders.'
        : error.message || 'Failed to place order. Please try again.';
      setOrderError(message);
      recordOrderCreate('pos', false, performance.now() - startedAt, {
        code: error.code,
        message: error.message,
      });
      return null;
    }

    const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!raw) {
      localInsertRequestIdsRef.current.delete(clientRequestId);
      setOrderError('Invalid response from server while placing order.');
      recordOrderCreate('pos', false, performance.now() - startedAt, {
        message: 'empty response',
      });
      return null;
    }

    const inserted = toOrder(raw);
    setOrders((prev) => upsertOrder(prev, inserted));
    setOrderError(null);
    void refreshDashboardMetrics();

    recordOrderCreate('pos', true, performance.now() - startedAt, {
      orderNumber: inserted.orderNumber,
    });

    return {
      orderId: inserted.id,
      orderNumber: inserted.orderNumber,
      timestamp: inserted.timestamp,
      businessDate: inserted.businessDate,
      source: inserted.source,
      clientRequestId,
    };
  }, [refreshDashboardMetrics]);

  const updateOrderStatus = useCallback(async (id: string, status: 'pending' | 'completed') => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (!error) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      void refreshDashboardMetrics();
      return;
    }
    if (!isPermissionError(error)) {
      console.error('Failed to update order status', error.code, error.message);
    }
  }, [refreshDashboardMetrics]);

  const updatePayment = useCallback(async (id: string, method: 'cash' | 'upi') => {
    const { error } = await supabase
      .from('orders')
      .update({ payment_method: method, payment_status: 'paid' })
      .eq('id', id);
    if (!error) {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, paymentMethod: method, paymentStatus: 'paid' } : o)),
      );
      void refreshDashboardMetrics();
      return;
    }
    if (!isPermissionError(error)) {
      console.error('Failed to update payment', error.code, error.message);
    }
  }, [refreshDashboardMetrics]);

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
            : o,
        ),
      );
      void refreshDashboardMetrics();
      return;
    }
    if (!isPermissionError(error)) {
      console.error('Failed to clear payment', error.code, error.message);
    }
  }, [refreshDashboardMetrics]);

  const addExpense = useCallback(async (description: string, amount: number) => {
    const newExpense = { description, amount, timestamp: Date.now(), shop_id: SHOP_ID };
    let { data, error } = await supabase.from('expenses').insert(newExpense).select().single();
    if (isMissingColumnError(error, 'shop_id')) {
      ({ data, error } = await supabase
        .from('expenses')
        .insert({ description, amount, timestamp: Date.now() })
        .select()
        .single());
    }

    if (!error && data) {
      setExpenses((prev) => [toExpense(data), ...prev]);
      void refreshDashboardMetrics();
      return;
    }

    if (error && !isPermissionError(error)) {
      console.error('Failed to add expense', error.code, error.message);
    }
  }, [refreshDashboardMetrics]);

  const addMenuItem = useCallback(async (item: Omit<MenuItem, 'id'>) => {
    const rowWithGola = {
      name: item.name,
      price: item.hasGolaVariants ? (item.golaVariantPrices?.Plain ?? item.price) : item.price,
      dish_price: item.dishPrice ?? null,
      category: item.category,
      has_variants: item.hasVariants ?? false,
      has_gola_variants: item.hasGolaVariants ?? false,
      gola_variant_prices: item.hasGolaVariants ? item.golaVariantPrices ?? null : null,
      shop_id: SHOP_ID,
    };
    const rowLegacy = {
      name: item.name,
      price: item.hasGolaVariants ? (item.golaVariantPrices?.Plain ?? item.price) : item.price,
      dish_price: item.dishPrice ?? null,
      category: item.category,
      has_variants: item.hasVariants ?? false,
    };

    let { data, error } = await supabase.from('menu_items').insert(rowWithGola).select().single();
    if (
      isMissingColumnError(error, 'gola_variant_prices') ||
      isMissingColumnError(error, 'has_gola_variants') ||
      isMissingColumnError(error, 'shop_id')
    ) {
      ({ data, error } = await supabase.from('menu_items').insert(rowLegacy).select().single());
    }

    if (error) throw new Error(isPermissionError(error) ? 'Staff sign-in required to edit menu.' : error.message);
    if (data) {
      setMenuItems((prev) => [...prev, toMenuItem(data)]);
    }
  }, []);

  const updateMenuItem = useCallback(async (id: string, updatedItem: Omit<MenuItem, 'id'>) => {
    const rowWithGola = {
      name: updatedItem.name,
      price: updatedItem.hasGolaVariants ? (updatedItem.golaVariantPrices?.Plain ?? updatedItem.price) : updatedItem.price,
      dish_price: updatedItem.dishPrice ?? null,
      category: updatedItem.category,
      has_variants: updatedItem.hasVariants ?? false,
      has_gola_variants: updatedItem.hasGolaVariants ?? false,
      gola_variant_prices: updatedItem.hasGolaVariants ? updatedItem.golaVariantPrices ?? null : null,
      shop_id: SHOP_ID,
    };
    const rowLegacy = {
      name: updatedItem.name,
      price: updatedItem.hasGolaVariants ? (updatedItem.golaVariantPrices?.Plain ?? updatedItem.price) : updatedItem.price,
      dish_price: updatedItem.dishPrice ?? null,
      category: updatedItem.category,
      has_variants: updatedItem.hasVariants ?? false,
    };

    let { error } = await supabase.from('menu_items').update(rowWithGola).eq('id', id);
    if (
      isMissingColumnError(error, 'gola_variant_prices') ||
      isMissingColumnError(error, 'has_gola_variants') ||
      isMissingColumnError(error, 'shop_id')
    ) {
      ({ error } = await supabase.from('menu_items').update(rowLegacy).eq('id', id));
    }

    if (error) throw new Error(isPermissionError(error) ? 'Staff sign-in required to edit menu.' : error.message);
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...updatedItem, id } : m)));
  }, []);

  const deleteMenuItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (!error) {
      setMenuItems((prev) => prev.filter((m) => m.id !== id));
      return;
    }
    if (!isPermissionError(error)) {
      console.error('Failed to delete menu item', error.code, error.message);
    }
  }, []);

  const clearData = useCallback(async () => {
    if (!window.confirm('Are you sure you want to clear all data? This cannot be undone.')) return;
    const businessDate = getBusinessDateString();

    const deleteOrdersReq = supabase
      .from('orders')
      .delete()
      .eq('business_date', businessDate)
      .eq('shop_id', SHOP_ID);

    const deleteExpensesReq = supabase
      .from('expenses')
      .delete()
      .eq('shop_id', SHOP_ID)
      .gte('timestamp', monthStartTimestampInIst());

    const [ordersRes, expensesRes] = await Promise.all([deleteOrdersReq, deleteExpensesReq]);

    if (ordersRes.error && (isMissingColumnError(ordersRes.error, 'business_date') || isMissingColumnError(ordersRes.error, 'shop_id'))) {
      await supabase.from('orders').delete().gte('timestamp', 0);
    }

    if (expensesRes.error && isMissingColumnError(expensesRes.error, 'shop_id')) {
      await supabase.from('expenses').delete().gte('timestamp', 0);
    }

    setOrders([]);
    setExpenses([]);
    void refreshDashboardMetrics();
  }, [refreshDashboardMetrics]);

  const clearIncomingOrderNotification = useCallback(() => {
    setIncomingOrderNotification(null);
  }, []);

  const clearOrderError = useCallback(() => {
    setOrderError(null);
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
    orderPending,
    orderError,
    dashboardMetrics,
    dashboardMetricsLoading,
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
    clearOrderError,
    refreshAll: fetchAll,
    refreshDashboardMetrics,
  };
}
