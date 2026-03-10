import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AnalyticsFilter,
  AnalyticsRange,
  DashboardMetrics,
  Expense,
  MenuItem,
  Order,
  OrderCreateResult,
  PricingRule,
  UpdateOrderDetailsInput,
  VariantMode,
} from './types';
import { supabase } from './lib/supabase';
import { recordOrderCreate, recordRealtimeDisconnect } from './lib/telemetry';

const PRICING_RULE_STORAGE_KEY = 'pos_pricing_rule_v1';
const PRICING_RULE_MENU_NAME = '__pricing_rule__';
const PRICING_RULE_MENU_CATEGORY = '__system__';
const ORDER_SYNC_INTERVAL_MS = 12000;
const ORDER_RECONCILIATION_DELAYS_MS = [300, 900, 2000] as const;
const SHOP_ID = 'main';
const PAYMENT_NOTE_PREFIX = 'Payment note:';
const CANCEL_REASON_PREFIX = 'Cancel reason:';
const IST_TIMEZONE = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_RE = /^\d{4}-\d{2}$/;
const DEFAULT_PRICING_RULE: PricingRule = {
  discountPercent: 0,
  bogoEnabled: false,
  bogoType: 'b2g1',
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
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'cancelled';
  }
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
    timeZone: IST_TIMEZONE,
  }).format(date);
}

function getIstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: Number(getPart('year')),
    month: Number(getPart('month')),
    day: Number(getPart('day')),
    weekday: getPart('weekday').toLowerCase(),
  };
}

function toIstMidnightTimestamp(year: number, month: number, day: number) {
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+05:30`).getTime();
}

function getAnalyticsRangeBounds(range: 'day' | 'week' | 'month', referenceDate = new Date()) {
  const { year, month, day, weekday } = getIstDateParts(referenceDate);
  const dayStart = toIstMidnightTimestamp(year, month, day);

  if (range === 'day') {
    return { start: dayStart, end: dayStart + DAY_MS - 1 };
  }

  if (range === 'week') {
    const weekdayIndex = IST_WEEKDAY_INDEX[weekday] ?? 0;
    const daysSinceMonday = (weekdayIndex + 6) % 7;
    const start = dayStart - daysSinceMonday * DAY_MS;
    return { start, end: start + 7 * DAY_MS - 1 };
  }

  const start = toIstMidnightTimestamp(year, month, 1);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = toIstMidnightTimestamp(nextMonthYear, nextMonth, 1) - 1;
  return { start, end };
}

function getSpecificDateBounds(dateValue: string) {
  if (!ISO_DATE_RE.test(dateValue)) return null;
  const start = new Date(`${dateValue}T00:00:00+05:30`).getTime();
  if (!Number.isFinite(start)) return null;
  return { start, end: start + DAY_MS - 1 };
}

function getSpecificMonthBounds(monthValue: string) {
  if (!ISO_MONTH_RE.test(monthValue)) return null;
  const [yearText, monthText] = monthValue.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const start = toIstMidnightTimestamp(year, month, 1);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = toIstMidnightTimestamp(nextMonthYear, nextMonth, 1) - 1;
  return { start, end };
}

function getCustomDateRangeBounds(startDate: string, endDate: string) {
  const startBounds = getSpecificDateBounds(startDate);
  const endBounds = getSpecificDateBounds(endDate);
  if (!startBounds || !endBounds) return null;
  if (startBounds.start > endBounds.end) return null;
  return { start: startBounds.start, end: endBounds.end };
}

function normalizeAnalyticsFilter(input: AnalyticsFilter | AnalyticsRange): AnalyticsFilter {
  if (typeof input === 'string') {
    return { range: input };
  }

  return {
    range: input.range,
    specificDate: input.specificDate,
    specificMonth: input.specificMonth,
    customStartDate: input.customStartDate,
    customEndDate: input.customEndDate,
  };
}

function getAnalyticsFilterBounds(filter: AnalyticsFilter, referenceDate = new Date()) {
  if (filter.range === 'specific_date') {
    const fallbackDate = getBusinessDateString(referenceDate);
    const specificDate = filter.specificDate && ISO_DATE_RE.test(filter.specificDate) ? filter.specificDate : fallbackDate;
    const bounds = getSpecificDateBounds(specificDate) ?? getAnalyticsRangeBounds('day', referenceDate);
    return {
      ...bounds,
      normalizedFilter: {
        range: 'specific_date' as const,
        specificDate,
      },
    };
  }

  if (filter.range === 'specific_month') {
    const parts = getIstDateParts(referenceDate);
    const fallbackMonth = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
    const specificMonth = filter.specificMonth && ISO_MONTH_RE.test(filter.specificMonth) ? filter.specificMonth : fallbackMonth;
    const bounds = getSpecificMonthBounds(specificMonth) ?? getAnalyticsRangeBounds('month', referenceDate);
    return {
      ...bounds,
      normalizedFilter: {
        range: 'specific_month' as const,
        specificMonth,
      },
    };
  }

  if (filter.range === 'custom') {
    const customStartDate = filter.customStartDate ?? '';
    const customEndDate = filter.customEndDate ?? '';
    const bounds = getCustomDateRangeBounds(customStartDate, customEndDate);
    if (bounds) {
      return {
        ...bounds,
        normalizedFilter: {
          range: 'custom' as const,
          customStartDate,
          customEndDate,
        },
      };
    }

    const fallback = getAnalyticsRangeBounds('day', referenceDate);
    const fallbackDate = getBusinessDateString(referenceDate);
    return {
      ...fallback,
      normalizedFilter: {
        range: 'custom' as const,
        customStartDate: customStartDate && ISO_DATE_RE.test(customStartDate) ? customStartDate : fallbackDate,
        customEndDate: customEndDate && ISO_DATE_RE.test(customEndDate) ? customEndDate : fallbackDate,
      },
    };
  }

  const range = filter.range === 'day' || filter.range === 'week' || filter.range === 'month' ? filter.range : 'day';
  const bounds = getAnalyticsRangeBounds(range, referenceDate);
  return { ...bounds, normalizedFilter: { range } };
}

function monthStartTimestampInIst() {
  return getAnalyticsRangeBounds('month').start;
}

function businessDateFromTimestamp(timestamp: number) {
  return getBusinessDateString(new Date(timestamp));
}

function readPricingRule(): PricingRule {
  try {
    const raw = localStorage.getItem(PRICING_RULE_STORAGE_KEY);
    if (!raw) return DEFAULT_PRICING_RULE;
    const parsed = JSON.parse(raw) as Partial<PricingRule>;
    const normalizedBogoType = parsed.bogoType === 'b1g1' ? 'b1g1' : 'b2g1';
    return {
      discountPercent: clampDiscountPercent(parsed.discountPercent ?? 0),
      bogoEnabled: Boolean(parsed.bogoEnabled),
      bogoType: normalizedBogoType,
    };
  } catch {
    return DEFAULT_PRICING_RULE;
  }
}

function isPricingRuleMenuRow(row: Record<string, unknown>) {
  return row.name === PRICING_RULE_MENU_NAME && row.category === PRICING_RULE_MENU_CATEGORY;
}

function pricingRuleFromMenuRow(row: Record<string, unknown>): PricingRule {
  const modeCode = Number(row.dish_price ?? 0);
  const bogoEnabled = modeCode > 0;
  const bogoType = modeCode === 1 ? 'b1g1' : 'b2g1';
  return {
    discountPercent: clampDiscountPercent(Number(row.price ?? 0)),
    bogoEnabled,
    bogoType,
  };
}

function pricingRuleDishCode(rule: PricingRule) {
  if (!rule.bogoEnabled) return 0;
  return rule.bogoType === 'b1g1' ? 1 : 2;
}

function toMenuItem(row: Record<string, unknown>): MenuItem {
  const rawVariantMode = row.variant_mode;
  const hasVariants = Boolean(row.has_variants) || false;
  const hasGolaVariants = Boolean(row.has_gola_variants) || false;
  const hasDishPrice = row.dish_price != null && toSafeNumber(row.dish_price) > 0;
  const normalizedCategory = String(row.category ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const categoryForcesDishOnly =
    normalizedCategory === 'special' ||
    normalizedCategory === 'special dish' ||
    normalizedCategory === 'pyali' ||
    normalizedCategory === 'pyaali';

  const variantMode: VariantMode =
    rawVariantMode === 'stick_only' || rawVariantMode === 'dish_only' || rawVariantMode === 'both'
      ? rawVariantMode
      : categoryForcesDishOnly
        ? 'dish_only'
        : (hasVariants && !hasGolaVariants && !hasDishPrice)
          ? 'stick_only'
          : 'both';

  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    price: toSafeNumber(row.price),
    dishPrice: row.dish_price != null ? toSafeNumber(row.dish_price) : undefined,
    category: String(row.category ?? 'Regular'),
    hasVariants,
    hasGolaVariants,
    golaVariantPrices: row.gola_variant_prices ? (row.gola_variant_prices as any) : undefined,
    defaultGolaVariant: row.default_gola_variant ? (row.default_gola_variant as any) : undefined,
    variantMode,
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

function mergePaymentNote(existingInstructions: string | undefined, paymentNote?: string) {
  const trimmedNote = typeof paymentNote === 'string' ? paymentNote.trim() : '';
  const baseInstructions = (existingInstructions ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(PAYMENT_NOTE_PREFIX))
    .join('\n');

  if (!trimmedNote) {
    return baseInstructions || undefined;
  }

  return [baseInstructions, `${PAYMENT_NOTE_PREFIX} ${trimmedNote}`]
    .filter(Boolean)
    .join('\n');
}

function mergeCancelReason(existingInstructions: string | undefined, cancelReason?: string) {
  const trimmedReason = typeof cancelReason === 'string' ? cancelReason.trim() : '';
  const baseInstructions = (existingInstructions ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(CANCEL_REASON_PREFIX))
    .join('\n');

  if (!trimmedReason) {
    return baseInstructions || undefined;
  }

  return [baseInstructions, `${CANCEL_REASON_PREFIX} ${trimmedReason}`]
    .filter(Boolean)
    .join('\n');
}

function toOrderItemsPayload(items: Order['items']) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    price: item.calculatedPrice,
    variantName: item.variant,
  }));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function menuWriteErrorMessage(error: { code?: string; message?: string } | null) {
  if (isPermissionError(error)) {
    return 'Menu/offer update denied. Use a permitted account and try again.';
  }
  return error?.message || 'Failed to update menu/offer.';
}

function orderActionErrorMessage(error: { code?: string; message?: string } | null, fallback: string) {
  const lowerMessage = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (
    (error?.code === '22P02' || error?.code === '23514') &&
    lowerMessage.includes('cancel')
  ) {
    return 'Cancel failed: orders.status must allow either "canceled" or "cancelled" in Supabase.';
  }
  if (isPermissionError(error)) {
    return 'Staff session required for live order actions.';
  }
  return error?.message || fallback;
}

export function useStore() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricingRule, setPricingRule] = useState<PricingRule>(() => readPricingRule());
  const [incomingOrderNotification, setIncomingOrderNotification] = useState<Order | null>(null);
  const [ordersRealtimeConnected, setOrdersRealtimeConnected] = useState(false);
  const [ordersPermissionError, setOrdersPermissionError] = useState<string | null>(null);
  const [orderPending, setOrderPending] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [dashboardMetricsLoading, setDashboardMetricsLoading] = useState(false);
  const [analyticsFilter, setAnalyticsFilter] = useState<AnalyticsFilter>({ range: 'day' });
  const [analyticsOrders, setAnalyticsOrders] = useState<Order[]>([]);
  const [analyticsExpenses, setAnalyticsExpenses] = useState<Expense[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const localInsertRequestIdsRef = useRef<Map<string, number>>(new Map());
  const analyticsFilterRef = useRef<AnalyticsFilter>({ range: 'day' });

  const persistPricingRuleToSupabase = useCallback(async (rule: PricingRule) => {
    await supabase.auth.refreshSession().catch(() => undefined);

    const rowWithGola = {
      name: PRICING_RULE_MENU_NAME,
      category: PRICING_RULE_MENU_CATEGORY,
      price: clampDiscountPercent(rule.discountPercent),
      dish_price: pricingRuleDishCode(rule),
      has_variants: false,
      has_gola_variants: false,
      gola_variant_prices: null,
      shop_id: SHOP_ID,
    };
    const rowLegacy = {
      name: PRICING_RULE_MENU_NAME,
      category: PRICING_RULE_MENU_CATEGORY,
      price: clampDiscountPercent(rule.discountPercent),
      dish_price: pricingRuleDishCode(rule),
      has_variants: false,
    };

    // 1. Look up the pricing rule row WITHOUT shop_id filter first
    const { data: existingRows, error: selectError } = await supabase
      .from('menu_items')
      .select('id')
      .eq('name', PRICING_RULE_MENU_NAME)
      .eq('category', PRICING_RULE_MENU_CATEGORY)
      .limit(1);

    if (selectError) {
      console.error('Failed to query existing pricing rule:', selectError);
      throw new Error(menuWriteErrorMessage(selectError));
    }

    const existingId = existingRows?.[0]?.id as string | undefined;

    if (existingId) {
      // Update logic — use count to detect silent RLS blocks (0 rows = permission denied)
      let { error: updateError, count: updateCount } = await supabase
        .from('menu_items')
        .update(rowWithGola)
        .eq('id', existingId)
        .select('id');

      if (updateError && (isMissingColumnError(updateError, 'gola_variant_prices') || isMissingColumnError(updateError, 'has_gola_variants') || isMissingColumnError(updateError, 'shop_id'))) {
        // Fallback update for older schema
        const { error: legacyUpdateError, data: legacyData } = await supabase
          .from('menu_items')
          .update(rowLegacy)
          .eq('id', existingId)
          .select('id');
        if (legacyUpdateError) {
          console.error('[persistPricingRule] legacy update error:', legacyUpdateError.code, legacyUpdateError.message);
          throw new Error(menuWriteErrorMessage(legacyUpdateError));
        }
        if (!legacyData || legacyData.length === 0) {
          console.error('[persistPricingRule] 0 rows updated - RLS blocked write. is_staff() returned false. Sign out and sign back in.');
          throw new Error('Offer update denied. Please sign out and sign back in to refresh permissions.');
        }
      } else if (updateError) {
        console.error('[persistPricingRule] update error:', updateError.code, updateError.message);
        throw new Error(menuWriteErrorMessage(updateError));
      } else if (!updateCount && updateCount !== null) {
        // Sanity check when count returned
      }
      return;
    }

    // Insert logic
    let { error: insertError } = await supabase.from('menu_items').insert(rowWithGola);

    if (insertError && (isMissingColumnError(insertError, 'gola_variant_prices') || isMissingColumnError(insertError, 'has_gola_variants') || isMissingColumnError(insertError, 'shop_id'))) {
      // Fallback insert for older schema
      const { error: legacyInsertError } = await supabase.from('menu_items').insert(rowLegacy);
      if (legacyInsertError) {
        console.error('Failed to insert pricing rule with legacy schema:', legacyInsertError);
        throw new Error(menuWriteErrorMessage(legacyInsertError));
      }
    } else if (insertError) {
      console.error('Failed to insert pricing rule:', insertError);
      throw new Error(menuWriteErrorMessage(insertError));
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

  const fetchOrdersByRange = useCallback(async (startMs: number, endMs: number) => {
    let { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('shop_id', SHOP_ID)
      .gte('timestamp', startMs)
      .lte('timestamp', endMs)
      .order('timestamp', { ascending: false });

    if (isMissingColumnError(error, 'shop_id')) {
      ({ data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('timestamp', startMs)
        .lte('timestamp', endMs)
        .order('timestamp', { ascending: false }));
    }

    if (!error && data) {
      return {
        orders: data
          .map((row) => toOrder(row as Record<string, unknown>))
          .filter((order) => isOrderForCurrentShop(order)),
        error: null as { code?: string; message?: string } | null,
      };
    }

    return { orders: [] as Order[], error };
  }, []);

  const fetchExpensesByRange = useCallback(async (startMs: number, endMs: number) => {
    let { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', SHOP_ID)
      .gte('timestamp', startMs)
      .lte('timestamp', endMs)
      .order('timestamp', { ascending: false });

    if (isMissingColumnError(error, 'shop_id')) {
      ({ data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('timestamp', startMs)
        .lte('timestamp', endMs)
        .order('timestamp', { ascending: false }));
    }

    if (!error && data) {
      return {
        expenses: data.map((row) => toExpense(row as Record<string, unknown>)),
        error: null as { code?: string; message?: string } | null,
      };
    }

    return { expenses: [] as Expense[], error };
  }, []);

  const refreshAnalytics = useCallback(async (nextFilter: AnalyticsFilter | AnalyticsRange) => {
    const normalizedInput = normalizeAnalyticsFilter(nextFilter);
    const { start, end, normalizedFilter } = getAnalyticsFilterBounds(normalizedInput);
    setAnalyticsFilter(normalizedFilter);
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    const [ordersResult, expensesResult] = await Promise.all([
      fetchOrdersByRange(start, end),
      fetchExpensesByRange(start, end),
    ]);

    setAnalyticsOrders(ordersResult.orders);
    setAnalyticsExpenses(expensesResult.expenses);

    if (isPermissionError(ordersResult.error) || isPermissionError(expensesResult.error)) {
      setAnalyticsError('Staff session required for analytics data.');
    } else if (ordersResult.error || expensesResult.error) {
      setAnalyticsError('Could not refresh analytics for the selected range.');
      if (ordersResult.error && !isPermissionError(ordersResult.error)) {
        console.error('Failed to fetch analytics orders', ordersResult.error.code, ordersResult.error.message);
      }
      if (expensesResult.error && !isPermissionError(expensesResult.error)) {
        console.error('Failed to fetch analytics expenses', expensesResult.error.code, expensesResult.error.message);
      }
    } else {
      setAnalyticsError(null);
    }

    setAnalyticsLoading(false);
  }, [fetchExpensesByRange, fetchOrdersByRange]);

  useEffect(() => {
    analyticsFilterRef.current = analyticsFilter;
  }, [analyticsFilter]);

  const refreshSelectedAnalytics = useCallback(() => {
    void refreshAnalytics(analyticsFilterRef.current);
  }, [refreshAnalytics]);

  const findOrderByClientRequestId = useCallback(async (clientRequestId: string, source: 'pos' | 'customer') => {
    let { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('client_request_id', clientRequestId)
      .eq('source', source)
      .eq('shop_id', SHOP_ID)
      .limit(1);

    if (isMissingColumnError(error, 'shop_id')) {
      ({ data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('client_request_id', clientRequestId)
        .eq('source', source)
        .limit(1));
    }

    if (isMissingColumnError(error, 'source')) {
      ({ data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('client_request_id', clientRequestId)
        .limit(1));
    }

    if (isMissingColumnError(error, 'client_request_id')) {
      return null;
    }

    if (error || !data || data.length === 0) {
      return null;
    }

    const parsed = toOrder(data[0] as Record<string, unknown>);
    return isOrderForCurrentShop(parsed) ? parsed : null;
  }, []);

  const reconcileCreatedOrder = useCallback(async (clientRequestId: string, source: 'pos' | 'customer') => {
    for (const delayMs of ORDER_RECONCILIATION_DELAYS_MS) {
      await wait(delayMs);
      const reconciledOrder = await findOrderByClientRequestId(clientRequestId, source);
      if (reconciledOrder) {
        return reconciledOrder;
      }
    }
    return null;
  }, [findOrderByClientRequestId]);

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
    if (!menuRes.error && menuData && menuData.length === 0) {
      // Compatibility fallback: existing rows may not be backfilled with shop_id yet.
      const fallback = await supabase.from('menu_items').select('*').order('created_at');
      if (!fallback.error && fallback.data && fallback.data.length > 0) {
        menuData = fallback.data;
      }
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
      setOrdersPermissionError(null);
      setOrders(ordersRes.data.map((row) => toOrder(row as Record<string, unknown>)));
    } else if (isMissingColumnError(ordersRes.error, 'business_date') || isMissingColumnError(ordersRes.error, 'shop_id')) {
      // Backward compatibility path before migration is applied.
      const fallback = await supabase.from('orders').select('*').order('timestamp', { ascending: false });
      if (fallback.data) {
        const today = getBusinessDateString();
        setOrdersPermissionError(null);
        setOrders(
          fallback.data
            .map((row) => toOrder(row as Record<string, unknown>))
            .filter((order) => order.businessDate === today),
        );
      }
    } else if (isPermissionError(ordersRes.error)) {
      setOrdersPermissionError(
        'Orders access denied. Sign in using a Supabase staff account with app_metadata.role set to staff.',
      );
    } else if (ordersRes.error && !isPermissionError(ordersRes.error)) {
      setOrdersPermissionError(null);
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

  useEffect(() => {
    void refreshAnalytics('day');
  }, [refreshAnalytics]);

  const refreshOrders = useCallback(async () => {
    const businessDate = getBusinessDateString();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('business_date', businessDate)
      .eq('shop_id', SHOP_ID)
      .order('timestamp', { ascending: false });

    if (!error && data) {
      setOrdersPermissionError(null);
      setOrders(data.map((row) => toOrder(row as Record<string, unknown>)));
      refreshSelectedAnalytics();
      return;
    }

    if ((isMissingColumnError(error, 'business_date') || isMissingColumnError(error, 'shop_id')) && error) {
      const fallback = await supabase.from('orders').select('*').order('timestamp', { ascending: false });
      if (fallback.data) {
        const today = getBusinessDateString();
        setOrdersPermissionError(null);
        setOrders(
          fallback.data
            .map((row) => toOrder(row as Record<string, unknown>))
            .filter((order) => order.businessDate === today),
        );
        refreshSelectedAnalytics();
      }
      return;
    }

    if (isPermissionError(error)) {
      setOrdersPermissionError(
        'Orders access denied. Sign in using a Supabase staff account with app_metadata.role set to staff.',
      );
      return;
    }

    if (error && !isPermissionError(error)) {
      setOrdersPermissionError(null);
      console.error('Failed to refresh orders', error.code, error.message);
    }
  }, [refreshSelectedAnalytics]);

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
            refreshSelectedAnalytics();
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
            refreshSelectedAnalytics();
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setOrders((prev) => upsertOrder(prev, parsed));
            void refreshDashboardMetrics();
            refreshSelectedAnalytics();
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
  }, [refreshDashboardMetrics, refreshOrders, refreshSelectedAnalytics]);

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
      refreshSelectedAnalytics();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDashboardMetrics, refreshOrders, refreshSelectedAnalytics]);

  const addOrder = useCallback(async (orderData: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>): Promise<OrderCreateResult | null> => {
    setOrderPending(true);
    setOrderError(null);

    const startedAt = performance.now();
    const clientRequestId = crypto.randomUUID();
    localInsertRequestIdsRef.current.set(clientRequestId, Date.now() + 30000);

    const itemsPayload = toOrderItemsPayload(orderData.items);

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

    if (error) {
      const reconciledOrder = await reconcileCreatedOrder(clientRequestId, 'pos');
      if (reconciledOrder) {
        setOrderPending(false);
        setOrders((prev) => upsertOrder(prev, reconciledOrder));
        setOrderError(null);
        void refreshDashboardMetrics();
        refreshSelectedAnalytics();
        recordOrderCreate('pos', true, performance.now() - startedAt, {
          orderNumber: reconciledOrder.orderNumber,
          reconciled: true,
          originalErrorCode: error.code,
        });
        return {
          orderId: reconciledOrder.id,
          orderNumber: reconciledOrder.orderNumber,
          timestamp: reconciledOrder.timestamp,
          businessDate: reconciledOrder.businessDate,
          source: reconciledOrder.source,
          clientRequestId,
        };
      }

      setOrderPending(false);
      localInsertRequestIdsRef.current.delete(clientRequestId);
      const message = isPermissionError(error)
        ? 'Sign in as staff to create orders.'
        : error.message || 'Failed to place order. Please try again.';
      setOrderError(message);
      recordOrderCreate('pos', false, performance.now() - startedAt, {
        code: error.code,
        message: error.message,
        reconciled: false,
      });
      return null;
    }

    const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!raw) {
      const reconciledOrder = await reconcileCreatedOrder(clientRequestId, 'pos');
      if (reconciledOrder) {
        setOrderPending(false);
        setOrders((prev) => upsertOrder(prev, reconciledOrder));
        setOrderError(null);
        void refreshDashboardMetrics();
        refreshSelectedAnalytics();
        recordOrderCreate('pos', true, performance.now() - startedAt, {
          orderNumber: reconciledOrder.orderNumber,
          reconciled: true,
          originalErrorCode: 'empty_response',
        });
        return {
          orderId: reconciledOrder.id,
          orderNumber: reconciledOrder.orderNumber,
          timestamp: reconciledOrder.timestamp,
          businessDate: reconciledOrder.businessDate,
          source: reconciledOrder.source,
          clientRequestId,
        };
      }

      setOrderPending(false);
      localInsertRequestIdsRef.current.delete(clientRequestId);
      setOrderError('Order not confirmed yet. Please retry once the warning clears.');
      recordOrderCreate('pos', false, performance.now() - startedAt, {
        message: 'empty response',
        reconciled: false,
      });
      return null;
    }

    const inserted = toOrder(raw);
    setOrderPending(false);
    setOrders((prev) => upsertOrder(prev, inserted));
    setOrderError(null);
    void refreshDashboardMetrics();
    refreshSelectedAnalytics();

    recordOrderCreate('pos', true, performance.now() - startedAt, {
      orderNumber: inserted.orderNumber,
      reconciled: false,
    });

    return {
      orderId: inserted.id,
      orderNumber: inserted.orderNumber,
      timestamp: inserted.timestamp,
      businessDate: inserted.businessDate,
      source: inserted.source,
      clientRequestId,
    };
  }, [reconcileCreatedOrder, refreshDashboardMetrics, refreshSelectedAnalytics]);

  const updateOrderStatus = useCallback(async (id: string, status: 'pending' | 'completed') => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (!error) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      void refreshDashboardMetrics();
      refreshSelectedAnalytics();
      return;
    }
    throw new Error(orderActionErrorMessage(error, 'Failed to update order status.'));
  }, [refreshDashboardMetrics, refreshSelectedAnalytics]);

  const updatePayment = useCallback(async (id: string, method: 'cash' | 'upi', note?: string) => {
    const existingOrder = orders.find((order) => order.id === id);
    const nextInstructions = mergePaymentNote(existingOrder?.orderInstructions, note);
    const { error } = await supabase
      .from('orders')
      .update({
        payment_method: method,
        payment_status: 'paid',
        order_instructions: nextInstructions ?? null,
      })
      .eq('id', id);
    if (!error) {
      setOrders((prev) =>
        prev.map((o) => (
          o.id === id
            ? {
              ...o,
              paymentMethod: method,
              paymentStatus: 'paid',
              orderInstructions: mergePaymentNote(o.orderInstructions, note),
            }
            : o
        )),
      );
      void refreshDashboardMetrics();
      refreshSelectedAnalytics();
      return;
    }
    throw new Error(orderActionErrorMessage(error, 'Failed to update payment.'));
  }, [orders, refreshDashboardMetrics, refreshSelectedAnalytics]);

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
      refreshSelectedAnalytics();
      return;
    }
    throw new Error(orderActionErrorMessage(error, 'Failed to clear payment.'));
  }, [refreshDashboardMetrics, refreshSelectedAnalytics]);

  const updateOrderDetails = useCallback(async (id: string, payload: UpdateOrderDetailsInput) => {
    const existingOrder = orders.find((order) => order.id === id) ?? analyticsOrders.find((order) => order.id === id);
    if (!existingOrder) {
      throw new Error('Order not found.');
    }
    if (existingOrder.status !== 'pending') {
      throw new Error('Only pending orders can be modified.');
    }

    const sanitizedInstructions = payload.orderInstructions?.trim() ? payload.orderInstructions.trim() : undefined;
    const roundedTotal = Math.max(0, Math.round(payload.total));
    const clonedItems = payload.items.map((item) => ({ ...item }));
    const { error } = await supabase
      .from('orders')
      .update({
        customer_name: payload.customerName.trim() || 'Guest',
        items: toOrderItemsPayload(clonedItems),
        total: roundedTotal,
        payment_method: payload.paymentMethod,
        payment_status: payload.paymentStatus,
        order_instructions: sanitizedInstructions ?? null,
      })
      .eq('id', id);

    if (!error) {
      setOrders((prev) =>
        prev.map((order) => (
          order.id === id
            ? {
              ...order,
              customerName: payload.customerName.trim() || 'Guest',
              items: clonedItems,
              total: roundedTotal,
              paymentMethod: payload.paymentMethod,
              paymentStatus: payload.paymentStatus,
              orderInstructions: sanitizedInstructions,
            }
            : order
        )),
      );
      setAnalyticsOrders((prev) =>
        prev.map((order) => (
          order.id === id
            ? {
              ...order,
              customerName: payload.customerName.trim() || 'Guest',
              items: clonedItems,
              total: roundedTotal,
              paymentMethod: payload.paymentMethod,
              paymentStatus: payload.paymentStatus,
              orderInstructions: sanitizedInstructions,
            }
            : order
        )),
      );
      void refreshDashboardMetrics();
      refreshSelectedAnalytics();
      return;
    }

    throw new Error(orderActionErrorMessage(error, 'Failed to modify order.'));
  }, [analyticsOrders, orders, refreshDashboardMetrics, refreshSelectedAnalytics]);

  const cancelOrder = useCallback(async (id: string, reason?: string) => {
    const existingOrder = orders.find((order) => order.id === id) ?? analyticsOrders.find((order) => order.id === id);
    if (!existingOrder) {
      throw new Error('Order not found.');
    }
    if (existingOrder.status !== 'pending') {
      throw new Error('Only pending orders can be cancelled.');
    }

    const nextInstructions = mergeCancelReason(existingOrder.orderInstructions, reason);
    const cancelPayload = {
      order_instructions: nextInstructions ?? null,
    };

    const cancelStatusCandidates = ['canceled', 'cancelled'] as const;
    let error: { code?: string; message?: string } | null = null;

    for (const cancelStatus of cancelStatusCandidates) {
      const result = await supabase
        .from('orders')
        .update({
          ...cancelPayload,
          status: cancelStatus,
        })
        .eq('id', id);

      error = result.error;
      if (!error) {
        break;
      }

      const lowerMessage = typeof error.message === 'string' ? error.message.toLowerCase() : '';
      const isCancelStatusConstraintError = (
        (error.code === '22P02' || error.code === '23514') &&
        lowerMessage.includes('cancel') &&
        lowerMessage.includes('status')
      );

      if (!isCancelStatusConstraintError) {
        break;
      }
    }

    if (!error) {
      setOrders((prev) =>
        prev.map((order) => (
          order.id === id
            ? {
              ...order,
              status: 'cancelled',
              orderInstructions: nextInstructions,
            }
            : order
        )),
      );
      setAnalyticsOrders((prev) =>
        prev.map((order) => (
          order.id === id
            ? {
              ...order,
              status: 'cancelled',
              orderInstructions: nextInstructions,
            }
            : order
        )),
      );
      void refreshDashboardMetrics();
      refreshSelectedAnalytics();
      return;
    }

    throw new Error(orderActionErrorMessage(error, 'Failed to cancel order.'));
  }, [analyticsOrders, orders, refreshDashboardMetrics, refreshSelectedAnalytics]);

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
      refreshSelectedAnalytics();
      return;
    }

    if (error && !isPermissionError(error)) {
      console.error('Failed to add expense', error.code, error.message);
    }
  }, [refreshDashboardMetrics, refreshSelectedAnalytics]);

  const addMenuItem = useCallback(async (item: Omit<MenuItem, 'id'>) => {
    await supabase.auth.refreshSession().catch(() => undefined);

    const rowWithGola = {
      name: item.name,
      price: item.price,
      dish_price: item.dishPrice ?? null,
      category: item.category,
      has_variants: item.hasVariants ?? false,
      has_gola_variants: item.hasGolaVariants ?? false,
      gola_variant_prices: item.hasGolaVariants ? item.golaVariantPrices ?? null : null,
      default_gola_variant: item.hasGolaVariants ? item.defaultGolaVariant ?? 'Plain' : null,
      variant_mode: item.variantMode ?? 'both',
      shop_id: SHOP_ID,
    };
    const rowLegacy = {
      name: item.name,
      price: item.price,
      dish_price: item.dishPrice ?? null,
      category: item.category,
      has_variants: item.hasVariants ?? false,
    };

    let { data, error } = await supabase.from('menu_items').insert(rowWithGola).select().single();
    if (
      isMissingColumnError(error, 'gola_variant_prices') ||
      isMissingColumnError(error, 'has_gola_variants') ||
      isMissingColumnError(error, 'variant_mode') ||
      isMissingColumnError(error, 'shop_id')
    ) {
      ({ data, error } = await supabase.from('menu_items').insert(rowLegacy).select().single());
    }

    if (error) throw new Error(isPermissionError(error) ? 'Staff sign-in required to edit menu.' : error.message);
    if (!data) throw new Error('Menu item was not created. Please try again.');
    setMenuItems((prev) => [...prev, toMenuItem(data)]);
  }, []);

  const updateMenuItem = useCallback(async (id: string, updatedItem: Omit<MenuItem, 'id'>) => {
    await supabase.auth.refreshSession().catch(() => undefined);

    const rowWithGola = {
      name: updatedItem.name,
      price: updatedItem.price,
      dish_price: updatedItem.dishPrice ?? null,
      category: updatedItem.category,
      has_variants: updatedItem.hasVariants ?? false,
      has_gola_variants: updatedItem.hasGolaVariants ?? false,
      gola_variant_prices: updatedItem.hasGolaVariants ? updatedItem.golaVariantPrices ?? null : null,
      default_gola_variant: updatedItem.hasGolaVariants ? updatedItem.defaultGolaVariant ?? 'Plain' : null,
      variant_mode: updatedItem.variantMode ?? 'both',
      shop_id: SHOP_ID,
    };
    const rowLegacy = {
      name: updatedItem.name,
      price: updatedItem.price,
      dish_price: updatedItem.dishPrice ?? null,
      category: updatedItem.category,
      has_variants: updatedItem.hasVariants ?? false,
    };

    let { error } = await supabase
      .from('menu_items')
      .update(rowWithGola)
      .eq('id', id);
    if (
      isMissingColumnError(error, 'gola_variant_prices') ||
      isMissingColumnError(error, 'has_gola_variants') ||
      isMissingColumnError(error, 'variant_mode') ||
      isMissingColumnError(error, 'shop_id')
    ) {
      ({ error } = await supabase
        .from('menu_items')
        .update(rowLegacy)
        .eq('id', id));
    }

    if (error) {
      console.error('[updateMenuItem] error:', error.code, error.message);
      throw new Error(isPermissionError(error) ? 'Staff sign-in required to edit menu.' : error.message);
    }
    // Optimistically apply the change locally; realtime will confirm it.
    setMenuItems((prev) => upsertMenuItem(prev, { id, ...updatedItem }));
  }, []);

  const renameMenuCategory = useCallback(async (currentCategory: string, nextCategory: string) => {
    const from = currentCategory.trim();
    const to = nextCategory.trim();

    if (!from || !to || from === to) {
      return;
    }

    await supabase.auth.refreshSession().catch(() => undefined);

    let { error } = await supabase
      .from('menu_items')
      .update({ category: to })
      .eq('category', from)
      .eq('shop_id', SHOP_ID);

    if (isMissingColumnError(error, 'shop_id')) {
      ({ error } = await supabase
        .from('menu_items')
        .update({ category: to })
        .eq('category', from));
    }

    if (error) {
      console.error('[renameMenuCategory] error:', error.code, error.message);
      throw new Error(isPermissionError(error) ? 'Staff sign-in required to edit menu.' : error.message);
    }

    setMenuItems((prev) =>
      prev.map((item) => (item.category === from ? { ...item, category: to } : item)),
    );
  }, []);

  const deleteMenuItem = useCallback(async (id: string) => {
    await supabase.auth.refreshSession().catch(() => undefined);

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
    refreshSelectedAnalytics();
  }, [refreshDashboardMetrics, refreshSelectedAnalytics]);

  const clearIncomingOrderNotification = useCallback(() => {
    setIncomingOrderNotification(null);
  }, []);

  const clearOrderError = useCallback(() => {
    setOrderError(null);
  }, []);

  const updatePricingRule = useCallback(async (next: Partial<PricingRule>) => {
    const merged: PricingRule = {
      discountPercent: clampDiscountPercent(next.discountPercent !== undefined ? next.discountPercent : pricingRule.discountPercent),
      bogoEnabled: next.bogoEnabled !== undefined ? next.bogoEnabled : pricingRule.bogoEnabled,
      bogoType: next.bogoType !== undefined ? next.bogoType : pricingRule.bogoType,
    };
    await persistPricingRuleToSupabase(merged);
    localStorage.setItem(PRICING_RULE_STORAGE_KEY, JSON.stringify(merged));
    setPricingRule(merged);
  }, [persistPricingRuleToSupabase, pricingRule]);
  const analyticsRange = analyticsFilter.range;

  return {
    menuItems,
    orders,
    expenses,
    loading,
    pricingRule,
    ordersRealtimeConnected,
    ordersPermissionError,
    incomingOrderNotification,
    orderPending,
    orderError,
    dashboardMetrics,
    dashboardMetricsLoading,
    analyticsFilter,
    analyticsRange,
    analyticsOrders,
    analyticsExpenses,
    analyticsLoading,
    analyticsError,
    addOrder,
    updateOrderDetails,
    cancelOrder,
    updateOrderStatus,
    updatePayment,
    clearPayment,
    updatePricingRule,
    addExpense,
    clearData,
    addMenuItem,
    updateMenuItem,
    renameMenuCategory,
    deleteMenuItem,
    clearIncomingOrderNotification,
    clearOrderError,
    refreshAll: fetchAll,
    refreshDashboardMetrics,
    refreshAnalytics,
  };
}
