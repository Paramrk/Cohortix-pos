import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AnalyticsFilter,
  AnalyticsRange,
  CartItem,
  DashboardMetrics,
  Expense,
  MenuItem,
  Order,
  OrderCreateResult,
  UpdateOrderDetailsInput,
} from './types';
import { supabase } from './lib/supabase';
import { recordOrderCreate, recordRealtimeDisconnect } from './lib/telemetry';
import {
  buildMenuConfigPayload,
  buildOrderInstructions,
  calculateCartLinePrice,
  parseOrderInstructions,
  selectedOptionsFromUnknown,
  toCatalogItem,
  toOrderLinePayload,
  type MenuConfigRow,
} from './lib/restaurant';

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



function toSafeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOrderItems(value: unknown): Order['items'] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
      : [];

  return rawItems.map((entry, index) => {
    const row = entry as Record<string, unknown>;
    const legacyVariant =
      typeof row.variant === 'string'
        ? row.variant
        : typeof row.variantName === 'string'
          ? row.variantName
          : typeof row.variant_name === 'string'
            ? row.variant_name
            : '';
    const selectedOptions = selectedOptionsFromUnknown(row.selectedOptions ?? row.selected_options);
    const normalizedOptions = selectedOptions.length > 0 || !legacyVariant.trim()
      ? selectedOptions
      : [{
        groupId: 'legacy-variant',
        groupName: 'Option',
        optionId: legacyVariant.trim().toLowerCase().replace(/\s+/g, '-'),
        optionName: legacyVariant.trim(),
        priceDelta: 0,
      }];
    const quantity = Math.max(1, toSafeNumber(row.quantity) || 1);
    const basePrice = toSafeNumber(row.price);
    const calculatedPrice =
      toSafeNumber(row.calculatedPrice ?? row.calculated_price) ||
      calculateCartLinePrice(basePrice, normalizedOptions);

    return {
      id: String(row.id ?? `item-${index + 1}`),
      cartItemId: typeof row.cartItemId === 'string' ? row.cartItemId : `saved-${index}-${String(row.id ?? 'item')}`,
      name: String(row.name ?? `Item ${index + 1}`),
      category: String(row.category ?? 'Menu'),
      price: basePrice,
      quantity,
      calculatedPrice,
      lineTotal: toSafeNumber(row.lineTotal ?? row.line_total) || calculatedPrice * quantity,
      selectedOptions: normalizedOptions,
    } satisfies CartItem;
  });
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



function toMenuItem(row: Record<string, unknown>, config?: MenuConfigRow | null): MenuItem {
  return toCatalogItem(row, config);
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
  const parsedInstructions = parseOrderInstructions(rawInstructions || undefined, String(row.customer_name ?? 'Walk-in'));
  const rowTableNumber = toSafeNumber(row.table_number);
  const tableNumber =
    Number.isFinite(rowTableNumber) && rowTableNumber > 0
      ? Math.floor(rowTableNumber)
      : parsedInstructions.tableNumber;

  return {
    id: String(row.id),
    orderNumber: toSafeNumber(row.order_number),
    customerName: String(row.customer_name ?? 'Walk-in'),
    displayLabel: parsedInstructions.displayLabel,
    serviceMode: parsedInstructions.serviceMode,
    tableNumber,
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

function summarizeOrdersAndExpenses(orders: Order[], expenses: Expense[]) {
  const activeOrders = orders.filter((order) => order.status !== 'cancelled');
  const paidOrders = activeOrders.filter((order) => order.paymentStatus === 'paid');
  const pendingUnpaidOrders = activeOrders.filter((order) => order.status === 'pending' && order.paymentStatus === 'unpaid');
  return {
    totalSales: activeOrders.reduce((sum, order) => sum + order.total, 0),
    collected: paidOrders.reduce((sum, order) => sum + order.total, 0),
    pending: pendingUnpaidOrders.reduce((sum, order) => sum + order.total, 0),
    expensesTotal: expenses.reduce((sum, expense) => sum + expense.amount, 0),
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
  return items.map(toOrderLinePayload);
}

function toLegacyMenuRow(item: Omit<MenuItem, 'id'>) {
  const sizeGroup = item.optionGroups.find((group) => group.type === 'size');
  const sortedSizeOptions = sizeGroup
    ? [...sizeGroup.options].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
    : [];
  const alternateSizeOption = sortedSizeOptions.find((option) => !option.isDefault) ?? sortedSizeOptions[1];
  const dishPrice = alternateSizeOption ? Math.max(0, item.price + alternateSizeOption.priceDelta) : null;

  return {
    name: item.name,
    price: item.price,
    dish_price: dishPrice,
    category: item.category,
    has_variants: item.optionGroups.length > 0,
    has_gola_variants: false,
    gola_variant_prices: null,
    default_gola_variant: null,
    variant_mode: item.optionGroups.length > 0 ? 'both' : 'stick_only',
    shop_id: SHOP_ID,
  };
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

function isMissingRelationError(error: { code?: string; message?: string } | null, relation: string) {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  return typeof error.message === 'string' && error.message.includes(relation);
}

function isMissingFunctionError(error: { code?: string; message?: string } | null, functionName: string) {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  return typeof error.message === 'string' && error.message.includes(`function public.${functionName}`);
}

function extractMissingColumnName(error: { code?: string; message?: string } | null) {
  if (!error || typeof error.message !== 'string') return null;
  const match = error.message.match(/'([^']+)' column/);
  return match?.[1] ?? null;
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



  const refreshDashboardMetrics = useCallback(async () => {
    setDashboardMetricsLoading(true);
    const startedAt = performance.now();
    const businessDate = getBusinessDateString();
    const dayBounds = getSpecificDateBounds(businessDate) ?? getAnalyticsRangeBounds('day');
    const monthBounds = getAnalyticsRangeBounds('month');

    let ordersData: Record<string, unknown>[] | null = null;
    let ordersError: { code?: string; message?: string } | null = null;
    let expensesData: Record<string, unknown>[] | null = null;
    let expensesError: { code?: string; message?: string } | null = null;

    const monthOrdersResult = await supabase
      .from('orders')
      .select('*')
      .eq('shop_id', SHOP_ID)
      .gte('timestamp', monthBounds.start)
      .lte('timestamp', monthBounds.end)
      .order('timestamp', { ascending: false });

    ordersData = monthOrdersResult.data as Record<string, unknown>[] | null;
    ordersError = monthOrdersResult.error;

    if (isMissingColumnError(ordersError, 'shop_id')) {
      const fallback = await supabase
        .from('orders')
        .select('*')
        .gte('timestamp', monthBounds.start)
        .lte('timestamp', monthBounds.end)
        .order('timestamp', { ascending: false });
      ordersData = fallback.data as Record<string, unknown>[] | null;
      ordersError = fallback.error;
    }

    const monthExpensesResult = await supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', SHOP_ID)
      .gte('timestamp', monthBounds.start)
      .lte('timestamp', monthBounds.end)
      .order('timestamp', { ascending: false });

    expensesData = monthExpensesResult.data as Record<string, unknown>[] | null;
    expensesError = monthExpensesResult.error;

    if (isMissingColumnError(expensesError, 'shop_id')) {
      const fallback = await supabase
        .from('expenses')
        .select('*')
        .gte('timestamp', monthBounds.start)
        .lte('timestamp', monthBounds.end)
        .order('timestamp', { ascending: false });
      expensesData = fallback.data as Record<string, unknown>[] | null;
      expensesError = fallback.error;
    }

    if (!ordersError && !expensesError && ordersData && expensesData) {
      const monthOrders = ordersData.map((row) => toOrder(row));
      const monthExpenses = expensesData.map((row) => toExpense(row));
      const dayOrders = monthOrders.filter((order) => order.businessDate === businessDate);
      const dayExpenses = monthExpenses.filter((expense) => expense.timestamp >= dayBounds.start && expense.timestamp <= dayBounds.end);
      const todaySummary = summarizeOrdersAndExpenses(dayOrders, dayExpenses);
      const monthSummary = summarizeOrdersAndExpenses(monthOrders, monthExpenses);

      setDashboardMetrics({
        businessDate,
        shopId: SHOP_ID,
        todayTotalSales: todaySummary.totalSales,
        todayCollected: todaySummary.collected,
        todayPending: todaySummary.pending,
        todayExpenses: todaySummary.expensesTotal,
        todayNetProfit: todaySummary.collected - todaySummary.expensesTotal,
        monthTotalSales: monthSummary.totalSales,
        monthCollected: monthSummary.collected,
        monthPending: monthSummary.pending,
        monthExpenses: monthSummary.expensesTotal,
        monthNetProfit: monthSummary.collected - monthSummary.expensesTotal,
      });
    } else if (isPermissionError(ordersError) || isPermissionError(expensesError)) {
      setDashboardMetrics(null);
    } else {
      if (ordersError) {
        console.error('Failed to fetch dashboard metric orders', ordersError.code, ordersError.message);
      }
      if (expensesError) {
        console.error('Failed to fetch dashboard metric expenses', expensesError.code, expensesError.message);
      }
    }

    setDashboardMetricsLoading(false);
    console.info('[telemetry]', JSON.stringify({
      type: 'dashboard_metrics_fetch',
      latencyMs: Math.round(performance.now() - startedAt),
      success: !ordersError && !expensesError,
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

  const fetchNextOrderNumber = useCallback(async () => {
    let { data, error } = await supabase
      .from('orders')
      .select('order_number')
      .eq('shop_id', SHOP_ID)
      .order('order_number', { ascending: false })
      .limit(1);

    if (isMissingColumnError(error, 'shop_id')) {
      ({ data, error } = await supabase
        .from('orders')
        .select('order_number')
        .order('order_number', { ascending: false })
        .limit(1));
    }

    if (isMissingColumnError(error, 'order_number')) {
      return 1;
    }

    const currentMax = Array.isArray(data) && data.length > 0
      ? toSafeNumber((data[0] as Record<string, unknown>).order_number)
      : 0;
    return Math.max(1, currentMax + 1);
  }, []);

  const insertOrderDirectly = useCallback(async (
    orderData: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>,
    clientRequestId: string,
    normalizedLabel: string,
    tableNumber: number | undefined,
    nextInstructions: string | undefined,
  ) => {
    const timestamp = Date.now();
    const businessDate = getBusinessDateString(new Date(timestamp));
    const nextOrderNumber = await fetchNextOrderNumber();

    let payload: Record<string, unknown> = {
      shop_id: SHOP_ID,
      table_number: tableNumber ?? null,
      order_number: nextOrderNumber,
      customer_name: normalizedLabel,
      items: toOrderItemsPayload(orderData.items),
      total: Math.round(orderData.total),
      status: 'pending',
      payment_method: orderData.paymentMethod,
      payment_status: orderData.paymentStatus,
      order_instructions: nextInstructions ?? null,
      source: 'pos',
      client_request_id: clientRequestId,
      business_date: businessDate,
      timestamp,
    };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { data, error } = await supabase
        .from('orders')
        .insert(payload)
        .select()
        .single();

      if (!error && data) {
        return toOrder(data as Record<string, unknown>);
      }

      const missingColumn = extractMissingColumnName(error);
      if (missingColumn && missingColumn in payload) {
        const nextPayload = { ...payload };
        delete nextPayload[missingColumn];
        payload = nextPayload;
        continue;
      }

      throw error ?? new Error('Direct order insert failed.');
    }

    throw new Error('Direct order insert failed.');
  }, [fetchNextOrderNumber]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const businessDate = getBusinessDateString();
    const monthStartMs = monthStartTimestampInIst();

    const menuReq = supabase.from('menu_items').select('*').eq('shop_id', SHOP_ID).order('created_at');
    const menuConfigReq = supabase
      .from('menu_item_configs')
      .select('*')
      .eq('shop_id', SHOP_ID);
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


    const [menuRes, menuConfigRes, ordersRes, expensesRes] = await Promise.all([
      menuReq,
      menuConfigReq,
      ordersReq,
      expensesReq,
    ]);

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

    const menuConfigMap = new Map<string, MenuConfigRow>();
    if (!isMissingRelationError(menuConfigRes.error, 'menu_item_configs')) {
      const configRows = (menuConfigRes.data ?? []) as MenuConfigRow[];
      configRows.forEach((row) => {
        menuConfigMap.set(row.menu_item_id, row);
      });
    }

    if (menuData) {
      setMenuItems(
        menuData
          .map((row) => toMenuItem(
            row as Record<string, unknown>,
            menuConfigMap.get(String((row as Record<string, unknown>).id)) ?? null,
          )),
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
        () => {
          void fetchAll();
        },
      )
      .subscribe((status) => {
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          recordRealtimeDisconnect('pos', 'pos-live-menu', status);
        }
      });

    const menuConfigChannel = supabase
      .channel('pos-live-menu-configs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_item_configs' },
        () => {
          void fetchAll();
        },
      )
      .subscribe((status) => {
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          recordRealtimeDisconnect('pos', 'pos-live-menu-configs', status);
        }
      });

    return () => {
      setOrdersRealtimeConnected(false);
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(menuChannel);
      void supabase.removeChannel(menuConfigChannel);
    };
  }, [fetchAll, refreshDashboardMetrics, refreshOrders, refreshSelectedAnalytics]);

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
  const tableNumber =
    typeof orderData.tableNumber === 'number' && Number.isFinite(orderData.tableNumber) && orderData.tableNumber > 0
      ? Math.floor(orderData.tableNumber)
      : undefined;
  const normalizedLabel =
    orderData.displayLabel.trim() ||
    (orderData.serviceMode === 'dine_in' && tableNumber ? `Table ${tableNumber}` : '') ||
    orderData.customerName.trim() ||
    'Walk-in';
  const nextInstructions = buildOrderInstructions(
    {
      displayLabel: normalizedLabel,
      serviceMode: orderData.serviceMode,
    },
    orderData.orderInstructions,
  );

    const { data, error } = await supabase.rpc('create_order_atomic', {
      p_customer_name: normalizedLabel,
      p_table_number: tableNumber ?? null,
      p_items: itemsPayload,
      p_total: Math.round(orderData.total),
      p_payment_method: orderData.paymentMethod,
      p_payment_status: orderData.paymentStatus,
      p_order_instructions: nextInstructions,
      p_source: 'pos',
      p_client_request_id: clientRequestId,
      p_shop_id: SHOP_ID,
    });

      if (error) {
        if (isMissingFunctionError(error, 'create_order_atomic')) {
          try {
            const insertedOrder = await insertOrderDirectly(
              orderData,
              clientRequestId,
              normalizedLabel,
              tableNumber,
              nextInstructions,
            );
            setOrderPending(false);
            setOrders((prev) => upsertOrder(prev, insertedOrder));
            setOrderError(null);
            void refreshDashboardMetrics();
            refreshSelectedAnalytics();
            recordOrderCreate('pos', true, performance.now() - startedAt, {
              orderNumber: insertedOrder.orderNumber,
              reconciled: false,
              fallback: 'direct_insert',
            });
            return {
              orderId: insertedOrder.id,
              orderNumber: insertedOrder.orderNumber,
              timestamp: insertedOrder.timestamp,
              businessDate: insertedOrder.businessDate,
              tableNumber: insertedOrder.tableNumber,
              source: insertedOrder.source,
              clientRequestId,
            };
          } catch (directInsertError) {
            const fallbackError = directInsertError as { code?: string; message?: string } | Error;
            setOrderPending(false);
            localInsertRequestIdsRef.current.delete(clientRequestId);
            const message = fallbackError instanceof Error && fallbackError.message
              ? fallbackError.message
              : 'Failed to place order. Please try again.';
            setOrderError(message);
            recordOrderCreate('pos', false, performance.now() - startedAt, {
              code: fallbackError instanceof Error ? undefined : fallbackError.code,
              message,
              reconciled: false,
              fallback: 'direct_insert_failed',
            });
            return null;
          }
        }

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
          tableNumber: reconciledOrder.tableNumber,
          source: reconciledOrder.source,
          clientRequestId,
        };
      }

      setOrderPending(false);
      localInsertRequestIdsRef.current.delete(clientRequestId);
      const message = isPermissionError(error)
        ? 'Sign in as owner/waiter to create orders.'
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
          tableNumber: reconciledOrder.tableNumber,
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
      tableNumber: inserted.tableNumber,
      source: inserted.source,
      clientRequestId,
    };
  }, [insertOrderDirectly, reconcileCreatedOrder, refreshDashboardMetrics, refreshSelectedAnalytics]);

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
    const normalizedLabel = payload.displayLabel.trim() || payload.customerName.trim() || 'Walk-in';
    const tableNumber =
      typeof payload.tableNumber === 'number' && Number.isFinite(payload.tableNumber) && payload.tableNumber > 0
        ? Math.floor(payload.tableNumber)
        : null;
    const serializedInstructions = buildOrderInstructions(
      {
        displayLabel: normalizedLabel,
        serviceMode: payload.serviceMode,
      },
      sanitizedInstructions,
    );
    const roundedTotal = Math.max(0, Math.round(payload.total));
    const clonedItems = payload.items.map((item) => ({ ...item }));
    const { error } = await supabase
      .from('orders')
      .update({
        customer_name: normalizedLabel,
        items: toOrderItemsPayload(clonedItems),
        total: roundedTotal,
        payment_method: payload.paymentMethod,
        payment_status: payload.paymentStatus,
        table_number: tableNumber,
        order_instructions: serializedInstructions,
      })
      .eq('id', id);

    if (!error) {
      setOrders((prev) =>
        prev.map((order) => (
          order.id === id
            ? {
              ...order,
              customerName: normalizedLabel,
              displayLabel: normalizedLabel,
              serviceMode: payload.serviceMode,
              tableNumber: tableNumber ?? undefined,
              items: clonedItems,
              total: roundedTotal,
              paymentMethod: payload.paymentMethod,
              paymentStatus: payload.paymentStatus,
              orderInstructions: serializedInstructions,
            }
            : order
        )),
      );
      setAnalyticsOrders((prev) =>
        prev.map((order) => (
          order.id === id
            ? {
              ...order,
              customerName: normalizedLabel,
              displayLabel: normalizedLabel,
              serviceMode: payload.serviceMode,
              tableNumber: tableNumber ?? undefined,
              items: clonedItems,
              total: roundedTotal,
              paymentMethod: payload.paymentMethod,
              paymentStatus: payload.paymentStatus,
              orderInstructions: serializedInstructions,
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

    const baseRow = toLegacyMenuRow(item);
    let { data, error } = await supabase.from('menu_items').insert(baseRow).select().single();
    if (isMissingColumnError(error, 'shop_id')) {
      const fallbackRow = {
        name: item.name,
        price: item.price,
        dish_price: baseRow.dish_price,
        category: item.category,
        has_variants: item.optionGroups.length > 0,
      };
      ({ data, error } = await supabase.from('menu_items').insert(fallbackRow).select().single());
    }

    if (error) throw new Error(isPermissionError(error) ? 'Owner sign-in required to edit menu.' : error.message);
    if (!data) throw new Error('Menu item was not created. Please try again.');

    const createdId = String((data as Record<string, unknown>).id);
    const configPayload = {
      menu_item_id: createdId,
      shop_id: SHOP_ID,
      ...buildMenuConfigPayload(item),
    };
    const { error: configError } = await supabase.from('menu_item_configs').upsert(configPayload, { onConflict: 'menu_item_id' });
    if (configError && !isMissingRelationError(configError, 'menu_item_configs')) {
      throw new Error(isPermissionError(configError) ? 'Owner sign-in required to edit menu.' : configError.message);
    }

    setMenuItems((prev) => [...prev, toMenuItem(data as Record<string, unknown>, configPayload)]);
  }, []);

  const updateMenuItem = useCallback(async (id: string, updatedItem: Omit<MenuItem, 'id'>) => {
    await supabase.auth.refreshSession().catch(() => undefined);

    const baseRow = toLegacyMenuRow(updatedItem);

    let { error } = await supabase
      .from('menu_items')
      .update(baseRow)
      .eq('id', id);
    if (isMissingColumnError(error, 'shop_id')) {
      ({ error } = await supabase
        .from('menu_items')
        .update({
          name: updatedItem.name,
          price: updatedItem.price,
          dish_price: baseRow.dish_price,
          category: updatedItem.category,
          has_variants: updatedItem.optionGroups.length > 0,
        })
        .eq('id', id));
    }

    if (error) {
      console.error('[updateMenuItem] error:', error.code, error.message);
      throw new Error(isPermissionError(error) ? 'Owner sign-in required to edit menu.' : error.message);
    }

    const configPayload = {
      menu_item_id: id,
      shop_id: SHOP_ID,
      ...buildMenuConfigPayload(updatedItem),
    };
    const { error: configError } = await supabase.from('menu_item_configs').upsert(configPayload, { onConflict: 'menu_item_id' });
    if (configError && !isMissingRelationError(configError, 'menu_item_configs')) {
      throw new Error(isPermissionError(configError) ? 'Owner sign-in required to edit menu.' : configError.message);
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

  const analyticsRange = analyticsFilter.range;

  return {
    menuItems,
    orders,
    expenses,
    loading,
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
