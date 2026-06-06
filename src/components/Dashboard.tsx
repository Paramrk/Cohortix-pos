import React, { useMemo, useState } from 'react';
import { AIInsights } from './AIInsights';
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

interface DashboardProps {
  onAddExpense: (desc: string, amount: number) => void;
  onClearData: () => void;
  customerAIEnabled: boolean;
  customerAISettingsLoading?: boolean;
  customerAISettingsSaving?: boolean;
  metrics?: DashboardMetrics | null;
  metricsLoading?: boolean;
  analyticsFilter: AnalyticsFilter;
  analyticsRange: AnalyticsRange;
  analyticsOrders: Order[];
  analyticsExpenses: Expense[];
  analyticsLoading?: boolean;
  analyticsError?: string | null;
  onChangeAnalyticsFilter: (filter: AnalyticsFilter | AnalyticsRange) => void;
  onToggleCustomerAI: (enabled: boolean) => Promise<void>;
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
    .filter(Boolean);
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
  customerAIEnabled,
  customerAISettingsLoading = false,
  customerAISettingsSaving = false,
  metrics,
  metricsLoading = false,
  analyticsFilter,
  analyticsRange,
  analyticsOrders,
  analyticsExpenses,
  analyticsLoading = false,
  analyticsError,
  onChangeAnalyticsFilter,
  onToggleCustomerAI,
}: DashboardProps) {
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [specificDate, setSpecificDate] = useState(analyticsFilter.specificDate ?? '');
  const [specificMonth, setSpecificMonth] = useState(analyticsFilter.specificMonth ?? '');
  const [customStartDate, setCustomStartDate] = useState(analyticsFilter.customStartDate ?? '');
  const [customEndDate, setCustomEndDate] = useState(analyticsFilter.customEndDate ?? '');
  const [customerAIError, setCustomerAIError] = useState<string | null>(null);

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
    ? 'Day'
    : analyticsRange === 'week'
      ? 'Week'
      : analyticsRange === 'month'
        ? 'Month'
        : analyticsRange === 'specific_date'
          ? 'Specific Date'
          : analyticsRange === 'specific_month'
            ? 'Specific Month'
            : 'Custom Range';
  const visibleMetricsLoading = metricsLoading || analyticsLoading;

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(expenseAmount);
    if (!expenseDesc.trim() || !Number.isFinite(amount) || amount <= 0) return;
    onAddExpense(expenseDesc.trim(), amount);
    setExpenseDesc('');
    setExpenseAmount('');
  };

  const handleToggleCustomerAI = async (enabled: boolean) => {
    setCustomerAIError(null);
    try {
      await onToggleCustomerAI(enabled);
    } catch (error) {
      setCustomerAIError(error instanceof Error ? error.message : 'Failed to update customer AI.');
    }
  };

  const maxQty = useMemo(() => {
    if (productStats.topRows.length === 0) return 1;
    return Math.max(...productStats.topRows.map((r) => r.quantitySold), 1);
  }, [productStats.topRows]);

  return (
    <div className="mobile-bottom-offset md:pb-0 max-w-6xl mx-auto space-y-6">
      <AIInsights
        rangeLabel={rangeLabel}
        totalSales={totalSales}
        collected={collected}
        netProfit={netProfit}
        orderCount={orderCount}
        itemsSold={itemsSold}
        avgOrderValue={avgOrderValue}
        expensesTotal={expensesTotal}
        collectionRate={collectionRate}
        topProducts={productStats.topRows}
        bottomProducts={productStats.bottomRows}
        paymentBreakdown={paymentBreakdown}
        analyticsOrders={analyticsOrders}
        analyticsExpenses={analyticsExpenses}
      />

      {/* Customer AI Access Card */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-on-surface">
              <Sparkles className="h-5 w-5 text-secondary" />
              <h3 className="text-base font-bold font-headline">Customer AI Access</h3>
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">
              Turn the customer Ask AI tab on or off for the live menu. When off, the customer app hides the tab and the Edge Function rejects AI requests.
            </p>
            <p className={`mt-2 text-xs font-bold ${customerAIEnabled ? 'text-secondary' : 'text-error'}`}>
              Status: {customerAIEnabled ? 'Enabled for customers' : 'Disabled for customers'}
            </p>
            {customerAIError && (
              <p className="mt-2 text-xs font-semibold text-error">{customerAIError}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void handleToggleCustomerAI(true); }}
              disabled={customerAISettingsLoading || customerAISettingsSaving || customerAIEnabled}
              className="h-10 rounded-xl bg-secondary px-4 text-xs font-bold text-on-secondary transition-all scale-98 active:scale-95 hover:opacity-90 disabled:cursor-not-allowed disabled:bg-outline-variant disabled:text-on-surface-variant"
            >
              {customerAISettingsLoading || customerAISettingsSaving ? 'Saving...' : 'Enable AI'}
            </button>
            <button
              type="button"
              onClick={() => { void handleToggleCustomerAI(false); }}
              disabled={customerAISettingsLoading || customerAISettingsSaving || !customerAIEnabled}
              className="h-10 rounded-xl border border-outline-variant bg-surface-container px-4 text-xs font-bold text-on-surface transition-all scale-98 active:scale-95 hover:bg-surface-container-high disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-outline"
            >
              {customerAISettingsLoading || customerAISettingsSaving ? 'Saving...' : 'Disable AI'}
            </button>
          </div>
        </div>
      </div>

      {/* POS Analytics Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-bold text-on-surface font-headline">POS Analytics</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-secondary-container text-on-secondary-container px-2.5 py-1 rounded-full border border-transparent">
            {rangeLabel} View
          </span>
        </div>
        <span className="text-xs font-bold text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/30">
          {formatRangeDate(analyticsFilter)}
        </span>
      </div>

      {/* Analytics Tabs Selector */}
      <div className="bg-surface-container border border-outline-variant rounded-xl p-1 inline-grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onChangeAnalyticsFilter('day')}
          className={`h-9 px-4 rounded-lg text-xs font-bold transition-all scale-98 active:scale-95 ${analyticsRange === 'day'
            ? 'bg-secondary-container text-on-secondary-container shadow-sm font-bold'
            : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
        >
          Day
        </button>
        <button
          type="button"
          onClick={() => onChangeAnalyticsFilter('week')}
          className={`h-9 px-4 rounded-lg text-xs font-bold transition-all scale-98 active:scale-95 ${analyticsRange === 'week'
            ? 'bg-secondary-container text-on-secondary-container shadow-sm font-bold'
            : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
        >
          Week
        </button>
        <button
          type="button"
          onClick={() => onChangeAnalyticsFilter('month')}
          className={`h-9 px-4 rounded-lg text-xs font-bold transition-all scale-98 active:scale-95 ${analyticsRange === 'month'
            ? 'bg-secondary-container text-on-secondary-container shadow-sm font-bold'
            : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
        >
          Month
        </button>
      </div>

      {/* Analytics Filters Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 space-y-3 shadow-sm hover:scale-[1.01] transition-transform duration-200">
          <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant font-mono">Specific Date</p>
          <input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
          />
          <button
            type="button"
            onClick={() => onChangeAnalyticsFilter({ range: 'specific_date', specificDate })}
            className="w-full h-10 rounded-xl bg-secondary text-on-secondary text-xs font-bold transition-colors shadow-sm hover:opacity-95"
          >
            Apply Date
          </button>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 space-y-3 shadow-sm hover:scale-[1.01] transition-transform duration-200">
          <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant font-mono">Specific Month</p>
          <input
            type="month"
            value={specificMonth}
            onChange={(e) => setSpecificMonth(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
          />
          <button
            type="button"
            onClick={() => onChangeAnalyticsFilter({ range: 'specific_month', specificMonth })}
            className="w-full h-10 rounded-xl bg-secondary text-on-secondary text-xs font-bold transition-colors shadow-sm hover:opacity-95"
          >
            Apply Month
          </button>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 space-y-3 shadow-sm hover:scale-[1.01] transition-transform duration-200">
          <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant font-mono">Custom Date Range</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            />
          </div>
          <button
            type="button"
            onClick={() => onChangeAnalyticsFilter({ range: 'custom', customStartDate, customEndDate })}
            className="w-full h-10 rounded-xl bg-secondary text-on-secondary text-xs font-bold transition-colors shadow-sm hover:opacity-95"
          >
            Apply Range
          </button>
        </div>
      </div>

      {visibleMetricsLoading && (
        <div className="text-xs font-bold uppercase tracking-wider text-on-secondary-container bg-secondary-container/20 border border-secondary-container/30 rounded-xl px-4 py-2.5 inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          Refreshing analytics
        </div>
      )}

      {analyticsError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {analyticsError}
        </div>
      )}

      {/* Primary & Secondary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Today's Sales (Collected) Card — Premium Highlighted style from screen 2 */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col justify-between gap-2 shadow-sm relative overflow-hidden transition-all duration-200 hover:scale-[1.02] sm:col-span-2 md:col-span-3 xl:col-span-1 xl:row-span-1">
          {/* Decorative subtle gradient blob */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-secondary-container rounded-full blur-3xl opacity-30 pointer-events-none"></div>
          <div className="flex justify-between items-start z-10">
            <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Today's Sales</p>
            <TrendingUp className="w-5 h-5 text-secondary" />
          </div>
          <div className="z-10 mt-1">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-secondary font-headline">
              {formatCurrency(collected)}
            </h3>
            <p className="text-[10px] text-slate-400 font-medium mt-1">
              Billed: {formatCurrency(totalSales)}
            </p>
          </div>
          {/* Sparkline Chart SVG */}
          <div className="w-full h-11 mt-2 z-10 pointer-events-none">
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 30">
              <path d="M0,30 L0,25 L10,22 L20,26 L30,18 L40,20 L50,12 L60,15 L70,5 L80,8 L90,2 L100,0 L100,30 Z" fill="#6cf8bb" opacity="0.12"></path>
              <path d="M0,25 L10,22 L20,26 L30,18 L40,20 L50,12 L60,15 L70,5 L80,8 L90,2 L100,0" fill="none" stroke="#006c49" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
              <circle cx="100" cy="0" fill="#ffffff" r="2.5" stroke="#006c49" strokeWidth="1.5"></circle>
            </svg>
          </div>
        </div>

        {/* Expenses Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-1.5 shadow-sm relative overflow-hidden transition-all duration-200 hover:scale-[1.02]">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Expenses</p>
          <h3 className="text-2xl font-bold text-rose-600 font-headline mt-1">
            {formatCurrency(expensesTotal)}
          </h3>
          <p className="text-[10px] text-slate-400 font-medium mt-auto">
            {sortedExpenses.length} entries recorded
          </p>
        </div>

        {/* Net Profit Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-1.5 shadow-sm relative overflow-hidden transition-all duration-200 hover:scale-[1.02]">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Net Profit</p>
          <h3 className={`text-2xl font-bold font-headline mt-1 ${netProfit >= 0 ? 'text-secondary' : 'text-rose-600'}`}>
            {formatCurrency(netProfit)}
          </h3>
          <p className="text-[10px] text-slate-400 font-medium mt-auto">
            Based on collected cash/UPI
          </p>
        </div>

        {/* Orders Count Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-1.5 shadow-sm relative overflow-hidden transition-all duration-200 hover:scale-[1.02]">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Total Orders</p>
          <h3 className="text-2xl font-bold text-on-surface font-headline mt-1">
            {orderCount}
          </h3>
          <p className="text-[10px] text-slate-400 font-medium mt-auto">
            {itemsSold} items sold
          </p>
        </div>

        {/* Avg Order Value Card */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-1.5 shadow-sm relative overflow-hidden transition-all duration-200 hover:scale-[1.02]">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Avg Order Value</p>
          <h3 className="text-2xl font-bold text-on-surface font-headline mt-1">
            {formatCurrency(avgOrderValue)}
          </h3>
          <p className="text-[10px] text-slate-400 font-medium mt-auto">
            {orderCount > 0 ? `${orderCount} orders` : 'No orders yet'}
          </p>
        </div>
      </div>

      {/* Breakdown Metrics Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Breakdown */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider">Payment Breakdown</h3>
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/60 bg-surface/50 p-3">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <Wallet className="w-4 h-4 text-secondary" />
              <span className="text-xs font-semibold">Cash Paid</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-secondary font-headline">{formatCurrency(paymentBreakdown.cash.total)}</p>
              <p className="text-[10px] text-slate-400">{paymentBreakdown.cash.count} orders</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/60 bg-surface/50 p-3">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <Smartphone className="w-4 h-4 text-secondary" />
              <span className="text-xs font-semibold">UPI Paid</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-secondary font-headline">{formatCurrency(paymentBreakdown.upi.total)}</p>
              <p className="text-[10px] text-slate-400">{paymentBreakdown.upi.count} orders</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-rose-200/60 bg-rose-50/50 p-3">
            <div className="flex items-center gap-2 text-rose-700">
              <Clock3 className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-semibold">Unpaid Due</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-rose-700 font-headline">{formatCurrency(paymentBreakdown.unpaid.total)}</p>
              <p className="text-[10px] text-rose-500">{paymentBreakdown.unpaid.count} orders</p>
            </div>
          </div>
        </div>

        {/* Order Flow */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider">Order Flow</h3>
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/60 bg-surface/50 p-3">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <CircleDot className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-semibold">Pending</span>
            </div>
            <span className="text-xs font-bold text-orange-600 font-mono">{flowBreakdown.pending}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/60 bg-surface/50 p-3">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <ClipboardCheck className="w-4 h-4 text-secondary" />
              <span className="text-xs font-semibold">Completed</span>
            </div>
            <span className="text-xs font-bold text-secondary font-mono">{flowBreakdown.completed}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-rose-200/60 bg-rose-50/50 p-3">
            <div className="flex items-center gap-2 text-rose-700">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-semibold">Cancelled</span>
            </div>
            <span className="text-xs font-bold text-rose-600 font-mono">{flowBreakdown.cancelled}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/60 bg-surface/50 p-3">
            <span className="text-xs font-semibold text-on-surface-variant">POS Orders</span>
            <span className="text-xs font-bold text-on-surface font-mono">{sourceBreakdown.pos}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/60 bg-surface/50 p-3">
            <span className="text-xs font-semibold text-on-surface-variant">Customer App</span>
            <span className="text-xs font-bold text-on-surface font-mono">{sourceBreakdown.customer}</span>
          </div>
        </div>

        {/* Collection Health */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider">Collection Health</h3>
          <div className="rounded-xl border border-outline-variant/60 bg-surface/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Collection Rate</p>
            <p className="text-lg font-bold text-secondary font-headline">{collectionRate}%</p>
          </div>
          <div className="rounded-xl border border-outline-variant/60 bg-surface/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Expense Share</p>
            <p className="text-lg font-bold text-rose-600 font-headline">{expenseShare}%</p>
          </div>
          <div className="rounded-xl border border-outline-variant/60 bg-surface/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Avg Expense Entry</p>
            <p className="text-lg font-bold text-on-surface font-headline">{formatCurrency(avgExpense)}</p>
          </div>
          <div className="rounded-xl border border-outline-variant/60 bg-surface/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Pending Due</p>
            <p className="text-lg font-bold text-error font-headline">{formatCurrency(pendingDue)}</p>
          </div>
        </div>
      </div>

      {/* Highlights & Top Selling Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider mb-3">Product Sales Highlights</h3>
          {productStats.allRows.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No product sales in this range.</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-secondary/20 bg-secondary-container/10 p-3.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-secondary">Most Sold Item</p>
                <p className="text-sm font-bold text-on-secondary-container mt-1">{productStats.mostSold?.name}</p>
                <p className="text-xs text-secondary mt-1 font-mono font-bold">
                  Qty: {productStats.mostSold?.quantitySold ?? 0} | Orders: {productStats.mostSold?.orderCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200/50 bg-rose-50/50 p-3.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-rose-700">Least Sold Item</p>
                <p className="text-sm font-bold text-rose-800 mt-1">{productStats.leastSold?.name}</p>
                <p className="text-xs text-rose-700 mt-1 font-mono font-bold">
                  Qty: {productStats.leastSold?.quantitySold ?? 0} | Orders: {productStats.leastSold?.orderCount ?? 0}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider mb-3">Product Order Count</h3>
          {productStats.allRows.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No product stats available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Top Sold list with Progress Bars */}
              <div className="rounded-xl border border-outline-variant/60 bg-surface/50 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant mb-1 font-mono">Top Selling</p>
                <div className="space-y-3">
                  {productStats.topRows.slice(0, 5).map((row) => {
                    const pct = Math.round((row.quantitySold / maxQty) * 100);
                    return (
                      <div key={`top-${row.key}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-semibold text-on-surface truncate">{row.name}</span>
                          <span className="font-bold text-on-surface shrink-0 text-[10px] font-mono">{row.quantitySold} sold</span>
                        </div>
                        <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                          <div className="bg-secondary h-full rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Least Sold list with Progress Bars */}
              <div className="rounded-xl border border-outline-variant/60 bg-surface/50 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant mb-1 font-mono">Least Selling</p>
                <div className="space-y-3">
                  {productStats.bottomRows.slice(0, 5).map((row) => {
                    const pct = Math.round((row.quantitySold / maxQty) * 100);
                    return (
                      <div key={`bottom-${row.key}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-semibold text-on-surface truncate">{row.name}</span>
                          <span className="font-bold text-on-surface shrink-0 text-[10px] font-mono">{row.quantitySold} sold</span>
                        </div>
                        <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                          <div className="bg-secondary-fixed-dim h-full rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expense Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-rose-500" />
            Add Expense
          </h3>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">Description</label>
              <input
                type="text"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder="e.g., Ice blocks, syrups, cups"
                className="w-full h-10 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">Amount (₹)</label>
              <input
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full h-10 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full h-11 bg-rose-600 hover:opacity-90 text-white font-bold rounded-xl transition-all scale-98 active:scale-95 duration-150 shadow-sm text-sm"
            >
              Save Expense
            </button>
          </form>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider flex items-center gap-2">
            <Receipt className="w-5 h-5 text-slate-500" />
            {rangeLabel} Expenses Log
          </h3>
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 no-scrollbar">
            {sortedExpenses.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-10">No expenses recorded for this range.</p>
            ) : (
              sortedExpenses.map((expense) => (
                <div key={expense.id} className="flex justify-between items-center p-3 bg-surface border border-outline-variant/60 rounded-xl">
                  <div>
                    <p className="font-semibold text-xs text-on-surface">{expense.description}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{formatDateTime(expense.timestamp)}</p>
                  </div>
                  <span className="font-bold text-xs text-rose-600 font-headline">{formatCurrency(expense.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Orders List (Detailed) */}
      <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant">
        <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider mb-4 flex items-center gap-2">
          <ShoppingCart className="w-4.5 h-4.5 text-secondary" />
          Orders List (Detailed)
        </h3>
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
          {sortedOrders.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-12">No orders in this range.</p>
          ) : (
            sortedOrders.map((order) => {
              const cancelReason = getCancelReason(order.orderInstructions);
              const visibleInstructions = getVisibleInstructions(order.orderInstructions);
              return (
                <div key={order.id} className="rounded-xl border border-outline-variant bg-surface/30 p-4 shadow-sm hover:scale-[1.005] transition-transform duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-on-surface">#{order.orderNumber}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-transparent ${order.status === 'pending'
                        ? 'bg-error-container text-on-error-container'
                        : order.status === 'completed'
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-surface-variant text-on-surface-variant border-outline-variant'
                        }`}>
                        {order.status}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-transparent ${order.paymentStatus === 'paid'
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-error-container text-on-error-container'
                        }`}>
                        {order.paymentStatus} / {order.paymentMethod.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-on-surface font-headline">{formatCurrency(order.total)}</div>
                  </div>

                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-on-surface-variant">
                    <p><strong>Customer:</strong> {order.customerName}</p>
                    <p><strong>Source:</strong> <span className="uppercase font-semibold">{order.source ?? 'unknown'}</span></p>
                    <p><strong>When:</strong> {formatDateTime(order.timestamp)}</p>
                  </div>

                  {cancelReason && (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <strong>Cancel reason:</strong> {cancelReason}
                    </div>
                  )}

                  {visibleInstructions && (
                    <div className="mt-2 rounded-xl border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface whitespace-pre-line">
                      <strong>Instructions:</strong> {visibleInstructions}
                    </div>
                  )}

                  <div className="mt-2.5 rounded-xl border border-outline-variant/60 bg-surface/60 p-3 space-y-2">
                    {order.items.map((item, idx) => {
                      const rawItem = item as unknown as Record<string, unknown>;
                      const variant = getItemVariant(rawItem);
                      const lineTotal = getLineTotal(rawItem);
                      const unitPrice = Number(rawItem.calculatedPrice ?? rawItem.price ?? 0);
                      return (
                        <div key={`${order.id}-${idx}`} className="flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-on-surface break-words flex items-center gap-1.5">
                              <span className="font-bold text-on-secondary-container bg-secondary-container px-1.5 py-0.5 rounded text-[10px] font-mono">
                                {rawItem.quantity ?? item.quantity}x
                              </span>
                              {rawItem.name ?? item.name}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5 pl-6">
                              {typeof rawItem.category === 'string' ? rawItem.category : item.category}
                              {variant ? ` | ${variant}` : ''}
                              {' | '}
                              {formatCurrency(Number.isFinite(unitPrice) ? unitPrice : 0)} each
                            </p>
                          </div>
                          <p className="font-bold text-on-surface font-headline shrink-0">{formatCurrency(lineTotal)}</p>
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
        <div className="rounded-xl border border-outline-variant/50 bg-surface-container px-4 py-2.5 text-xs text-on-surface-variant flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-secondary" />
          RPC Metrics synced for business date <span className="font-bold">{metrics.businessDate}</span>
        </div>
      )}

      {/* End of Day Data Reset */}
      <div className="pt-6 border-t border-outline-variant/60 flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => {
            const confirmation = window.prompt("Type RESET TODAY to permanently clear today's orders and month expenses.");
            if (confirmation !== 'RESET TODAY') return;
            onClearData();
          }}
          className="flex items-center gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-xl border border-transparent hover:border-rose-200 transition-all text-xs font-bold"
        >
          <AlertTriangle className="w-4 h-4" />
          Reset All Data (End of Day)
        </button>
        <p className="text-[10px] text-slate-400 pl-4">
          Warning: This will delete all orders and expenses history. Use only when closing the shop.
        </p>
      </div>
    </div>
  );
}
