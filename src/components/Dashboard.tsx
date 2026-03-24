import React, { useMemo, useState } from 'react';

import {
  AlertTriangle,
  CalendarDays,
  CircleDot,
  ClipboardCheck,
  Clock3,
  IndianRupee,
  PlusCircle,
  Receipt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { AnalyticsFilter, AnalyticsRange, DashboardMetrics, Expense, Order } from '../types';
import { useLanguage } from '../lib/i18n';

interface DashboardProps {
  onAddExpense: (desc: string, amount: number) => void;
  onClearData: () => void;
  metrics?: DashboardMetrics | null;
  metricsLoading?: boolean;
  analyticsFilter: AnalyticsFilter;
  analyticsRange: AnalyticsRange;
  analyticsOrders: Order[];
  analyticsExpenses: Expense[];
  analyticsLoading?: boolean;
  analyticsError?: string | null;
  onChangeAnalyticsFilter: (filter: AnalyticsFilter | AnalyticsRange) => void;
}

const CANCEL_REASON_PREFIX = 'Cancel reason:';

function formatCurrency(value: number) {
  return `Rs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(value))}`;
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRangeDate(filter: AnalyticsFilter) {
  const range = filter.range;
  const now = new Date();
  const dayLabel = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

  if (range === 'day') {
    return dayLabel;
  }

  if (range === 'month') {
    return now.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  }

  if (range === 'specific_date' && filter.specificDate) {
    const parsed = new Date(`${filter.specificDate}T00:00:00+05:30`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      });
    }
  }

  if (range === 'specific_month' && filter.specificMonth) {
    const parsed = new Date(`${filter.specificMonth}-01T00:00:00+05:30`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
    }
  }

  if (range === 'custom' && filter.customStartDate && filter.customEndDate) {
    const start = new Date(`${filter.customStartDate}T00:00:00+05:30`);
    const end = new Date(`${filter.customEndDate}T00:00:00+05:30`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} - ${end.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      })}`;
    }
  }

  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const year = Number(dateParts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(dateParts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(dateParts.find((part) => part.type === 'day')?.value ?? '1');
  const weekday = (dateParts.find((part) => part.type === 'weekday')?.value ?? 'sun').toLowerCase();
  const dayStart = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+05:30`).getTime();
  const weekdayIndex: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const daysSinceMonday = ((weekdayIndex[weekday] ?? 0) + 6) % 7;
  const start = new Date(dayStart - daysSinceMonday * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} - ${end.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })}`;
}

function getItemVariant(item: Record<string, unknown>) {
  if (typeof item.variant === 'string' && item.variant.trim()) return item.variant;
  if (typeof item.variantName === 'string' && item.variantName.trim()) return item.variantName;
  if (typeof item.variant_name === 'string' && item.variant_name.trim()) return item.variant_name;
  return null;
}

function parseInstructionLines(instructions?: string) {
  return (instructions ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('ORDER_META:'));
}

function getCancelReason(instructions?: string) {
  const reasonLine = parseInstructionLines(instructions).find((line) => line.startsWith(CANCEL_REASON_PREFIX));
  if (!reasonLine) return null;
  return reasonLine.replace(CANCEL_REASON_PREFIX, '').trim() || null;
}

function getVisibleInstructions(instructions?: string) {
  const lines = parseInstructionLines(instructions).filter((line) => !line.startsWith(CANCEL_REASON_PREFIX));
  return lines.length ? lines.join('\n') : null;
}

function getLineTotal(item: Record<string, unknown>) {
  const unitPrice = Number(item.calculatedPrice ?? item.price ?? 0);
  const quantity = Number(item.quantity ?? 0);
  return (Number.isFinite(unitPrice) ? unitPrice : 0) * (Number.isFinite(quantity) ? quantity : 0);
}

interface ProductSalesRow {
  key: string;
  name: string;
  quantitySold: number;
  orderCount: number;
}

export function Dashboard({
  onAddExpense,
  onClearData,
  metrics,
  metricsLoading = false,
  analyticsFilter,
  analyticsRange,
  analyticsOrders,
  analyticsExpenses,
  analyticsLoading = false,
  analyticsError,
  onChangeAnalyticsFilter,
}: DashboardProps) {
  const { t } = useLanguage();
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [specificDate, setSpecificDate] = useState(analyticsFilter.specificDate ?? '');
  const [specificMonth, setSpecificMonth] = useState(analyticsFilter.specificMonth ?? '');
  const [customStartDate, setCustomStartDate] = useState(analyticsFilter.customStartDate ?? '');
  const [customEndDate, setCustomEndDate] = useState(analyticsFilter.customEndDate ?? '');


  React.useEffect(() => {
    setSpecificDate(analyticsFilter.specificDate ?? '');
    setSpecificMonth(analyticsFilter.specificMonth ?? '');
    setCustomStartDate(analyticsFilter.customStartDate ?? '');
    setCustomEndDate(analyticsFilter.customEndDate ?? '');
  }, [analyticsFilter.customEndDate, analyticsFilter.customStartDate, analyticsFilter.range, analyticsFilter.specificDate, analyticsFilter.specificMonth]);

  const sortedOrders = useMemo(
    () => [...analyticsOrders].sort((a, b) => b.timestamp - a.timestamp),
    [analyticsOrders],
  );
  const activeOrders = useMemo(
    () => sortedOrders.filter((order) => order.status !== 'cancelled'),
    [sortedOrders],
  );
  const sortedExpenses = useMemo(
    () => [...analyticsExpenses].sort((a, b) => b.timestamp - a.timestamp),
    [analyticsExpenses],
  );

  const totalSales = activeOrders.reduce((sum, order) => sum + order.total, 0);
  const collected = activeOrders
    .filter((order) => order.paymentStatus !== 'unpaid')
    .reduce((sum, order) => sum + order.total, 0);
  const pendingDue = activeOrders
    .filter((order) => order.paymentStatus === 'unpaid')
    .reduce((sum, order) => sum + order.total, 0);
  const expensesTotal = sortedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const netProfit = collected - expensesTotal;
  const orderCount = activeOrders.length;
  const itemsSold = activeOrders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
  const avgOrderValue = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;
  const collectionRate = totalSales > 0 ? Math.round((collected / totalSales) * 100) : 0;
  const expenseShare = collected > 0 ? Math.round((expensesTotal / collected) * 100) : 0;
  const avgExpense = sortedExpenses.length > 0 ? Math.round(expensesTotal / sortedExpenses.length) : 0;

  const paymentBreakdown = useMemo(() => {
    const breakdown = {
      cash: { total: 0, count: 0 },
      upi: { total: 0, count: 0 },
      unpaid: { total: 0, count: 0 },
    };

    for (const order of activeOrders) {
      if (order.paymentStatus === 'unpaid') {
        breakdown.unpaid.total += order.total;
        breakdown.unpaid.count += 1;
        continue;
      }

      if (order.paymentMethod === 'upi') {
        breakdown.upi.total += order.total;
        breakdown.upi.count += 1;
      } else {
        breakdown.cash.total += order.total;
        breakdown.cash.count += 1;
      }
    }

    return breakdown;
  }, [activeOrders]);

  const flowBreakdown = useMemo(() => ({
    pending: sortedOrders.filter((order) => order.status === 'pending').length,
    completed: sortedOrders.filter((order) => order.status === 'completed').length,
    cancelled: sortedOrders.filter((order) => order.status === 'cancelled').length,
  }), [sortedOrders]);

  const sourceBreakdown = useMemo(() => {
    const source = { pos: 0, customer: 0, unknown: 0 };
    for (const order of sortedOrders) {
      if (order.source === 'pos') source.pos += 1;
      else if (order.source === 'customer') source.customer += 1;
      else source.unknown += 1;
    }
    return source;
  }, [sortedOrders]);

  const productStats = useMemo(() => {
    const rowsMap = new Map<string, { name: string; quantitySold: number; orderIds: Set<string> }>();

    for (const order of activeOrders) {
      for (const item of order.items) {
        const rawItem = item as unknown as Record<string, unknown>;
        const itemNameRaw = typeof rawItem.name === 'string' ? rawItem.name.trim() : item.name;
        const itemName = itemNameRaw && itemNameRaw.length > 0 ? itemNameRaw : 'Unknown Item';
        const key = itemName.toLowerCase();
        const quantity = Number(rawItem.quantity ?? item.quantity);
        const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

        const current = rowsMap.get(key);
        if (current) {
          current.quantitySold += safeQty;
          current.orderIds.add(order.id);
          continue;
        }

        rowsMap.set(key, {
          name: itemName,
          quantitySold: safeQty,
          orderIds: new Set([order.id]),
        });
      }
    }

    const allRows: ProductSalesRow[] = Array.from(rowsMap.entries()).map(([key, value]) => ({
      key,
      name: value.name,
      quantitySold: value.quantitySold,
      orderCount: value.orderIds.size,
    }));

    const topRows = [...allRows].sort((a, b) =>
      b.quantitySold - a.quantitySold ||
      b.orderCount - a.orderCount ||
      a.name.localeCompare(b.name),
    );
    const bottomRows = [...allRows].sort((a, b) =>
      a.quantitySold - b.quantitySold ||
      a.orderCount - b.orderCount ||
      a.name.localeCompare(b.name),
    );

    return {
      allRows,
      topRows,
      bottomRows,
      mostSold: topRows[0] ?? null,
      leastSold: bottomRows[0] ?? null,
    };
  }, [activeOrders]);

  const rangeLabel = analyticsRange === 'day'
    ? t('dashboard.day')
    : analyticsRange === 'week'
      ? t('dashboard.week')
      : analyticsRange === 'month'
        ? t('dashboard.month')
        : analyticsRange === 'specific_date'
          ? t('dashboard.specificDate')
          : analyticsRange === 'specific_month'
            ? t('dashboard.specificMonth')
            : t('dashboard.customRange');
  const visibleMetricsLoading = metricsLoading || analyticsLoading;

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(expenseAmount);
    if (!expenseDesc.trim() || !Number.isFinite(amount) || amount <= 0) return;
    onAddExpense(expenseDesc.trim(), amount);
    setExpenseDesc('');
    setExpenseAmount('');
  };

  return (
    <div className="mobile-bottom-offset md:pb-0 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">{t('dashboard.title')}</h2>
          <span className="text-[11px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full">
            {rangeLabel}
          </span>
        </div>
        <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          {formatRangeDate(analyticsFilter)}
        </span>
      </div>

      <div className="mb-5 bg-white border border-slate-200 rounded-xl p-1 inline-grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onChangeAnalyticsFilter('day')}
          className={`min-h-10 px-4 rounded-lg text-sm font-bold transition-colors ${analyticsRange === 'day'
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-slate-500 hover:bg-slate-50'
            }`}
        >
          {t('dashboard.day')}
        </button>
        <button
          type="button"
          onClick={() => onChangeAnalyticsFilter('week')}
          className={`min-h-10 px-4 rounded-lg text-sm font-bold transition-colors ${analyticsRange === 'week'
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-slate-500 hover:bg-slate-50'
            }`}
        >
          {t('dashboard.week')}
        </button>
        <button
          type="button"
          onClick={() => onChangeAnalyticsFilter('month')}
          className={`min-h-10 px-4 rounded-lg text-sm font-bold transition-colors ${analyticsRange === 'month'
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-slate-500 hover:bg-slate-50'
            }`}
        >
          {t('dashboard.month')}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <p className="text-xs uppercase tracking-wide font-bold text-slate-500">{t('dashboard.specificDate')}</p>
          <input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
          />
          <button
            type="button"
            onClick={() => onChangeAnalyticsFilter({ range: 'specific_date', specificDate })}
            className="w-full h-10 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold hover:bg-indigo-200"
          >
            {t('dashboard.applyDate')}
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <p className="text-xs uppercase tracking-wide font-bold text-slate-500">{t('dashboard.specificMonth')}</p>
          <input
            type="month"
            value={specificMonth}
            onChange={(e) => setSpecificMonth(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
          />
          <button
            type="button"
            onClick={() => onChangeAnalyticsFilter({ range: 'specific_month', specificMonth })}
            className="w-full h-10 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold hover:bg-indigo-200"
          >
            {t('dashboard.applyMonth')}
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <p className="text-xs uppercase tracking-wide font-bold text-slate-500">{t('dashboard.customRange')}</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => onChangeAnalyticsFilter({ range: 'custom', customStartDate, customEndDate })}
            className="w-full h-10 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold hover:bg-indigo-200"
          >
            {t('dashboard.applyRange')}
          </button>
        </div>
      </div>

      {visibleMetricsLoading && (
        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          {t('dashboard.refreshing')}
        </div>
      )}

      {analyticsError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {analyticsError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 font-medium text-sm mb-1">{t('dashboard.collected')}</p>
          <h3 className="text-2xl sm:text-3xl font-bold text-indigo-600">{formatCurrency(collected)}</h3>
          <p className="text-xs text-slate-400 mt-2">Total billed: {formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 font-medium text-sm mb-1">{t('dashboard.expenses')}</p>
          <h3 className="text-2xl sm:text-3xl font-bold text-rose-600">{formatCurrency(expensesTotal)}</h3>
          <p className="text-xs text-slate-400 mt-2">{sortedExpenses.length} expense entries</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 font-medium text-sm mb-1">{t('dashboard.netProfit')}</p>
          <h3 className={`text-2xl sm:text-3xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(netProfit)}
          </h3>
          <p className="text-xs text-slate-400 mt-2">Based on collected amount</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 font-medium text-sm mb-1">{t('dashboard.orders')}</p>
          <h3 className="text-2xl sm:text-3xl font-bold text-slate-800">{orderCount}</h3>
          <p className="text-xs text-slate-400 mt-2">{itemsSold} items sold</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 font-medium text-sm mb-1">{t('dashboard.avgOrderValue')}</p>
          <h3 className="text-2xl sm:text-3xl font-bold text-blue-600">{formatCurrency(avgOrderValue)}</h3>
          <p className="text-xs text-slate-400 mt-2">{orderCount > 0 ? `${orderCount} orders` : 'No orders yet'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-800">{t('dashboard.paymentBreakdown')}</h3>
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-slate-700">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold">Cash Paid</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-700">{formatCurrency(paymentBreakdown.cash.total)}</p>
              <p className="text-xs text-slate-500">{paymentBreakdown.cash.count} orders</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-slate-700">
              <Smartphone className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-semibold">UPI Paid</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-indigo-700">{formatCurrency(paymentBreakdown.upi.total)}</p>
              <p className="text-xs text-slate-500">{paymentBreakdown.upi.count} orders</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 p-3">
            <div className="flex items-center gap-2 text-rose-700">
              <Clock3 className="w-4 h-4" />
              <span className="text-sm font-semibold">Unpaid Due</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-rose-700">{formatCurrency(paymentBreakdown.unpaid.total)}</p>
              <p className="text-xs text-rose-600">{paymentBreakdown.unpaid.count} orders</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-800">{t('dashboard.orderFlow')}</h3>
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-slate-700">
              <CircleDot className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold">Pending</span>
            </div>
            <span className="text-sm font-bold text-orange-600">{flowBreakdown.pending}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-slate-700">
              <ClipboardCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold">Completed</span>
            </div>
            <span className="text-sm font-bold text-emerald-600">{flowBreakdown.completed}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 p-3">
            <div className="flex items-center gap-2 text-rose-700">
              <TrendingDown className="w-4 h-4" />
              <span className="text-sm font-semibold">Cancelled</span>
            </div>
            <span className="text-sm font-bold text-rose-600">{flowBreakdown.cancelled}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
            <span className="text-sm font-semibold text-slate-700">POS Orders</span>
            <span className="text-sm font-bold text-slate-800">{sourceBreakdown.pos}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
            <span className="text-sm font-semibold text-slate-700">Customer App Orders</span>
            <span className="text-sm font-bold text-slate-800">{sourceBreakdown.customer}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-800">{t('dashboard.collectionHealth')}</h3>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Collection Rate</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{collectionRate}%</p>
            <p className="text-xs text-slate-500 mt-1">Collected vs total billed</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Expense Share</p>
            <p className="text-xl font-bold text-rose-600 mt-1">{expenseShare}%</p>
            <p className="text-xs text-slate-500 mt-1">Expenses as share of collected amount</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Average Expense Entry</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(avgExpense)}</p>
            <p className="text-xs text-slate-500 mt-1">{sortedExpenses.length} entries</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending Due</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(pendingDue)}</p>
            <p className="text-xs text-slate-500 mt-1">Unpaid active orders</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-base font-bold text-slate-800 mb-3">{t('dashboard.productSales')}</h3>
          {productStats.allRows.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No product sales in this range.</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Most Sold</p>
                <p className="text-sm font-bold text-emerald-800 mt-1">{productStats.mostSold?.name ? t(productStats.mostSold.name) : ''}</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Qty: {productStats.mostSold?.quantitySold ?? 0} | Orders: {productStats.mostSold?.orderCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs uppercase tracking-wide text-amber-700">Least Sold</p>
                <p className="text-sm font-bold text-amber-800 mt-1">{productStats.leastSold?.name ? t(productStats.leastSold.name) : ''}</p>
                <p className="text-xs text-amber-700 mt-1">
                  Qty: {productStats.leastSold?.quantitySold ?? 0} | Orders: {productStats.leastSold?.orderCount ?? 0}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-base font-bold text-slate-800 mb-3">{t('dashboard.productOrderCount')}</h3>
          {productStats.allRows.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No product stats available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-600 mb-2">Top Sold</p>
                <div className="space-y-2">
                  {productStats.topRows.slice(0, 5).map((row) => (
                    <div key={`top-${row.key}`} className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium text-slate-700 truncate">{t(row.name)}</span>
                      <span className="font-bold text-slate-800 shrink-0">{row.quantitySold} qty ({row.orderCount} orders)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-600 mb-2">Least Sold</p>
                <div className="space-y-2">
                  {productStats.bottomRows.slice(0, 5).map((row) => (
                    <div key={`bottom-${row.key}`} className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium text-slate-700 truncate">{t(row.name)}</span>
                      <span className="font-bold text-slate-800 shrink-0">{row.quantitySold} qty ({row.orderCount} orders)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-rose-500" />
            {t('dashboard.addExpense')}
          </h3>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder="e.g., Ice blocks, syrups, cups"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (Rs)</label>
              <input
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Save Expense
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-slate-500" />
            {rangeLabel} {t('dashboard.expenses')}
          </h3>
          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
            {sortedExpenses.length === 0 ? (
              <p className="text-slate-400 text-center py-6">No expenses recorded for this range.</p>
            ) : (
              sortedExpenses.map((expense) => (
                <div key={expense.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="font-medium text-slate-800">{expense.description}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(expense.timestamp)}</p>
                  </div>
                  <span className="font-bold text-rose-600">{formatCurrency(expense.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 mb-8">
        <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-indigo-600" />
          {t('dashboard.ordersList')}
        </h3>
        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {sortedOrders.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No orders in this range.</p>
          ) : (
            sortedOrders.map((order) => {
              const cancelReason = getCancelReason(order.orderInstructions);
              const visibleInstructions = getVisibleInstructions(order.orderInstructions);
              return (
                <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800">#{order.orderNumber}</span>
                      {order.serviceMode === 'dine_in' && order.tableNumber && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          Table {order.tableNumber}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${order.status === 'pending'
                        ? 'bg-orange-100 text-orange-700'
                        : order.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                        }`}>
                        {order.status}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${order.paymentStatus === 'paid'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-amber-100 text-amber-700'
                        }`}>
                        {order.paymentStatus} / {order.paymentMethod}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-800">{formatCurrency(order.total)}</div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-600">
                    <p><strong>Customer:</strong> {order.customerName}</p>
                    <p><strong>Source:</strong> {order.source ?? 'unknown'}</p>
                    <p><strong>When:</strong> {formatDateTime(order.timestamp)}</p>
                  </div>

                  {cancelReason && (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
                      <strong>Cancel reason:</strong> {cancelReason}
                    </div>
                  )}

                  {visibleInstructions && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 whitespace-pre-line">
                      <strong>Instructions:</strong> {visibleInstructions}
                    </div>
                  )}

                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                    {order.items.map((item, idx) => {
                      const rawItem = item as unknown as Record<string, unknown>;
                      const variant = getItemVariant(rawItem);
                      const lineTotal = getLineTotal(rawItem);
                      const unitPrice = Number(rawItem.calculatedPrice ?? rawItem.price ?? 0);
                      return (
                        <div key={`${order.id}-${idx}`} className="flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-700 break-words">
                              {rawItem.quantity ?? item.quantity} x {rawItem.name ?? item.name}
                            </p>
                            <p className="text-slate-500">
                              {typeof rawItem.category === 'string' ? rawItem.category : item.category}
                              {variant ? ` | ${variant}` : ''}
                              {' | '}
                              {formatCurrency(Number.isFinite(unitPrice) ? unitPrice : 0)} each
                            </p>
                          </div>
                          <p className="font-bold text-slate-700 shrink-0">{formatCurrency(lineTotal)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {metrics && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-500" />
          RPC Metrics synced for business date {metrics.businessDate}
        </div>
      )}

      <div className="pt-6 border-t border-slate-200">
        <button
          onClick={() => {
            const confirmation = window.prompt('Type RESET TODAY to permanently clear today\'s orders and month expenses.');
            if (confirmation !== 'RESET TODAY') return;
            onClearData();
          }}
          className="flex items-center gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
        >
          <AlertTriangle className="w-4 h-4" />
          Reset All Data (End of Day)
        </button>
        <p className="text-xs text-slate-500 mt-2 ml-2">
          Warning: This will delete all orders and expenses history. Use only when closing the shop.
        </p>
      </div>
    </div>
  );
}
