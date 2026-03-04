import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Receipt,
  PlusCircle,
  AlertTriangle,
  CalendarDays,
  Activity,
  Wallet,
  Smartphone,
  Clock3,
  ClipboardCheck,
  ShoppingCart,
  CircleDot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Order, Expense, DashboardMetrics } from '../types';
import { getRuntimeTelemetrySummary } from '../lib/telemetry';

interface DashboardProps {
  orders: Order[];
  expenses: Expense[];
  onAddExpense: (desc: string, amount: number) => void;
  onClearData: () => void;
  metrics?: DashboardMetrics | null;
  metricsLoading?: boolean;
}

interface StatCardProps {
  title: string;
  amount: number;
  icon: LucideIcon;
  colorClass: string;
  subtitle?: string;
  isCurrency?: boolean;
}

interface ExpenseTrendRow {
  label: string;
  dateLabel: string;
  total: number;
  count: number;
  widthPct: number;
}

function formatCurrency(value: number) {
  return `Rs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(value))}`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getExpenseBucketLabel(hour: number) {
  if (hour >= 6 && hour < 12) return 'Morning (6am-12pm)';
  if (hour >= 12 && hour < 17) return 'Afternoon (12pm-5pm)';
  if (hour >= 17 && hour < 22) return 'Evening (5pm-10pm)';
  return 'Night (10pm-6am)';
}

export function Dashboard({ orders, expenses, onAddExpense, onClearData, metrics, metricsLoading = false }: DashboardProps) {
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [opsSummary, setOpsSummary] = useState(() => getRuntimeTelemetrySummary());

  const now = new Date();
  const today = new Date().setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const todaysOrders = useMemo(() => orders.filter((order) => order.timestamp >= today), [orders, today]);
  const todaysExpenses = useMemo(() => expenses.filter((expense) => expense.timestamp >= today), [expenses, today]);

  const fallbackTodayTotalSales = useMemo(
    () => todaysOrders.reduce((sum, order) => sum + order.total, 0),
    [todaysOrders],
  );
  const fallbackTodayCollected = useMemo(
    () =>
      todaysOrders
        .filter((order) => order.paymentStatus !== 'unpaid')
        .reduce((sum, order) => sum + order.total, 0),
    [todaysOrders],
  );
  const fallbackTodayPending = useMemo(
    () =>
      todaysOrders
        .filter((order) => order.paymentStatus === 'unpaid')
        .reduce((sum, order) => sum + order.total, 0),
    [todaysOrders],
  );
  const fallbackTodayExpenses = useMemo(
    () => todaysExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [todaysExpenses],
  );

  const monthlyOrders = useMemo(() => orders.filter((order) => order.timestamp >= startOfMonth), [orders, startOfMonth]);
  const monthlyExpenses = useMemo(() => expenses.filter((expense) => expense.timestamp >= startOfMonth), [expenses, startOfMonth]);

  const fallbackMonthTotalSales = useMemo(
    () => monthlyOrders.reduce((sum, order) => sum + order.total, 0),
    [monthlyOrders],
  );
  const fallbackMonthCollected = useMemo(
    () =>
      monthlyOrders
        .filter((order) => order.paymentStatus !== 'unpaid')
        .reduce((sum, order) => sum + order.total, 0),
    [monthlyOrders],
  );
  const fallbackMonthPending = useMemo(
    () =>
      monthlyOrders
        .filter((order) => order.paymentStatus === 'unpaid')
        .reduce((sum, order) => sum + order.total, 0),
    [monthlyOrders],
  );
  const fallbackMonthExpenses = useMemo(
    () => monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [monthlyExpenses],
  );

  const todayTotalSales = metrics?.todayTotalSales ?? fallbackTodayTotalSales;
  const todayCollected = metrics?.todayCollected ?? fallbackTodayCollected;
  const todayPending = metrics?.todayPending ?? fallbackTodayPending;
  const todayExpensesTotal = metrics?.todayExpenses ?? fallbackTodayExpenses;
  const todayNetProfit = metrics?.todayNetProfit ?? (todayCollected - todayExpensesTotal);

  const monthTotalSales = metrics?.monthTotalSales ?? fallbackMonthTotalSales;
  const monthCollected = metrics?.monthCollected ?? fallbackMonthCollected;
  const monthPending = metrics?.monthPending ?? fallbackMonthPending;
  const monthExpensesTotal = metrics?.monthExpenses ?? fallbackMonthExpenses;
  const monthNetProfit = metrics?.monthNetProfit ?? (monthCollected - monthExpensesTotal);

  const todaysOrderCount = todaysOrders.length;
  const todaysCompletedCount = useMemo(
    () => todaysOrders.filter((order) => order.status === 'completed').length,
    [todaysOrders],
  );
  const todaysPendingCount = Math.max(0, todaysOrderCount - todaysCompletedCount);
  const todaysItemsSold = useMemo(
    () =>
      todaysOrders.reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      ),
    [todaysOrders],
  );
  const avgOrderValueToday = todaysOrderCount > 0 ? Math.round(todayTotalSales / todaysOrderCount) : 0;
  const avgExpenseToday = todaysExpenses.length > 0 ? Math.round(todayExpensesTotal / todaysExpenses.length) : 0;
  const avgExpenseMonth = monthlyExpenses.length > 0 ? Math.round(monthExpensesTotal / monthlyExpenses.length) : 0;

  const todayPaymentBreakdown = useMemo(() => {
    const breakdown = {
      cash: { count: 0, total: 0 },
      upi: { count: 0, total: 0 },
      unpaid: { count: 0, total: 0 },
    };

    for (const order of todaysOrders) {
      if (order.paymentStatus === 'unpaid') {
        breakdown.unpaid.count += 1;
        breakdown.unpaid.total += order.total;
        continue;
      }

      if (order.paymentMethod === 'upi') {
        breakdown.upi.count += 1;
        breakdown.upi.total += order.total;
      } else {
        breakdown.cash.count += 1;
        breakdown.cash.total += order.total;
      }
    }

    return breakdown;
  }, [todaysOrders]);

  const todaySourceBreakdown = useMemo(() => {
    const source = { pos: 0, customer: 0, unknown: 0 };
    for (const order of todaysOrders) {
      if (order.source === 'pos') source.pos += 1;
      else if (order.source === 'customer') source.customer += 1;
      else source.unknown += 1;
    }
    return source;
  }, [todaysOrders]);

  const todayCollectionRate = todayTotalSales > 0 ? Math.round((todayCollected / todayTotalSales) * 100) : 0;
  const todayExpenseShare = todayCollected > 0 ? Math.round((todayExpensesTotal / todayCollected) * 100) : 0;

  const largestTodayExpense = useMemo(() => {
    if (todaysExpenses.length === 0) return null;
    return todaysExpenses.reduce((largest, expense) => (expense.amount > largest.amount ? expense : largest));
  }, [todaysExpenses]);

  const largestMonthExpense = useMemo(() => {
    if (monthlyExpenses.length === 0) return null;
    return monthlyExpenses.reduce((largest, expense) => (expense.amount > largest.amount ? expense : largest));
  }, [monthlyExpenses]);

  const todaysExpenseBuckets = useMemo(() => {
    const buckets = [
      { key: 'Morning (6am-12pm)', count: 0, total: 0 },
      { key: 'Afternoon (12pm-5pm)', count: 0, total: 0 },
      { key: 'Evening (5pm-10pm)', count: 0, total: 0 },
      { key: 'Night (10pm-6am)', count: 0, total: 0 },
    ];

    const bucketByLabel = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const expense of todaysExpenses) {
      const label = getExpenseBucketLabel(new Date(expense.timestamp).getHours());
      const bucket = bucketByLabel.get(label);
      if (!bucket) continue;
      bucket.count += 1;
      bucket.total += expense.amount;
    }

    return buckets;
  }, [todaysExpenses]);

  const monthlyTopExpenses = useMemo(
    () => [...monthlyExpenses].sort((a, b) => b.amount - a.amount).slice(0, 8),
    [monthlyExpenses],
  );

  const lastSevenDayExpenseRows = useMemo((): ExpenseTrendRow[] => {
    const nowDate = new Date();
    nowDate.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const rows: ExpenseTrendRow[] = [];

    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = nowDate.getTime() - i * dayMs;
      const dayEnd = dayStart + dayMs;
      const dayExpenses = expenses.filter((expense) => expense.timestamp >= dayStart && expense.timestamp < dayEnd);
      const total = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      rows.push({
        label: new Date(dayStart).toLocaleDateString('en-IN', { weekday: 'short' }),
        dateLabel: new Date(dayStart).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        total,
        count: dayExpenses.length,
        widthPct: 0,
      });
    }

    const maxTotal = Math.max(...rows.map((row) => row.total), 0);
    return rows.map((row) => ({
      ...row,
      widthPct: maxTotal > 0 ? Math.max(6, Math.round((row.total / maxTotal) * 100)) : 6,
    }));
  }, [expenses]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setOpsSummary(getRuntimeTelemetrySummary());
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount) return;
    onAddExpense(expenseDesc, parseFloat(expenseAmount));
    setExpenseDesc('');
    setExpenseAmount('');
  };

  const StatCard = ({ title, amount, icon: Icon, colorClass, subtitle, isCurrency = true }: StatCardProps) => (
    <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-slate-500 font-medium text-sm mb-1">{title}</p>
        <h3 className={`text-2xl sm:text-3xl font-bold ${colorClass}`}>
          {isCurrency ? formatCurrency(amount) : new Intl.NumberFormat('en-IN').format(Math.round(amount))}
        </h3>
        {subtitle && <p className="text-xs text-slate-400 mt-2 break-words leading-relaxed">{subtitle}</p>}
      </div>
      <div className={`p-3 rounded-xl shrink-0 ${colorClass.replace('text-', 'bg-').replace('600', '100')}`}>
        <Icon className={`w-6 h-6 ${colorClass}`} />
      </div>
    </div>
  );

  return (
    <div className="mobile-bottom-offset md:pb-0 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Today's Dashboard</h2>
        <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })}
        </span>
      </div>

      {metricsLoading && (
        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          Refreshing dashboard metrics
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <StatCard
          title="Today's Collected"
          amount={todayCollected}
          icon={TrendingUp}
          colorClass="text-indigo-600"
          subtitle={`Total: ${formatCurrency(todayTotalSales)}${todayPending > 0 ? ` | Unpaid: ${formatCurrency(todayPending)}` : ''}`}
        />
        <StatCard
          title="Today's Expenses"
          amount={todayExpensesTotal}
          icon={TrendingDown}
          colorClass="text-rose-600"
          subtitle={`${todaysExpenses.length} expense items`}
        />
        <StatCard
          title="Today's Net Profit"
          amount={todayNetProfit}
          icon={IndianRupee}
          colorClass={todayNetProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          subtitle="Based on collected amount"
        />
        <StatCard
          title="Orders Today"
          amount={todaysOrderCount}
          icon={ShoppingCart}
          colorClass="text-slate-700"
          subtitle={`${todaysItemsSold} items sold`}
          isCurrency={false}
        />
        <StatCard
          title="Avg Order Value"
          amount={avgOrderValueToday}
          icon={ClipboardCheck}
          colorClass="text-blue-600"
          subtitle={todaysOrderCount > 0 ? `${todaysOrderCount} orders` : 'No orders yet'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-slate-800 mb-4">Payment Breakdown (Today)</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold">Cash Paid</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-emerald-700">{formatCurrency(todayPaymentBreakdown.cash.total)}</p>
                <p className="text-xs text-slate-500">{todayPaymentBreakdown.cash.count} orders</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold">UPI Paid</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-indigo-700">{formatCurrency(todayPaymentBreakdown.upi.total)}</p>
                <p className="text-xs text-slate-500">{todayPaymentBreakdown.upi.count} orders</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 p-3">
              <div className="flex items-center gap-2 text-rose-700">
                <Clock3 className="w-4 h-4" />
                <span className="text-sm font-semibold">Unpaid Due</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-rose-700">{formatCurrency(todayPaymentBreakdown.unpaid.total)}</p>
                <p className="text-xs text-rose-600">{todayPaymentBreakdown.unpaid.count} orders</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-slate-800 mb-4">Order Flow (Today)</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <CircleDot className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-semibold">Pending Queue</span>
              </div>
              <span className="text-sm font-bold text-orange-600">{todaysPendingCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold">Completed</span>
              </div>
              <span className="text-sm font-bold text-emerald-600">{todaysCompletedCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-sm font-semibold text-slate-700">POS Orders</span>
              <span className="text-sm font-bold text-slate-800">{todaySourceBreakdown.pos}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-sm font-semibold text-slate-700">Customer App Orders</span>
              <span className="text-sm font-bold text-slate-800">{todaySourceBreakdown.customer}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-slate-800 mb-4">Collection Health</h3>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Collection Rate</p>
              <p className="text-xl font-bold text-emerald-600 mt-1">{todayCollectionRate}%</p>
              <p className="text-xs text-slate-500 mt-1">Collected vs total billed today</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Expense Share</p>
              <p className="text-xl font-bold text-rose-600 mt-1">{todayExpenseShare}%</p>
              <p className="text-xs text-slate-500 mt-1">Expenses as a share of collected amount</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Average Expense Item</p>
              <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(avgExpenseToday)}</p>
              <p className="text-xs text-slate-500 mt-1">{todaysExpenses.length} entries today</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl p-4 sm:p-6 mb-8 text-white shadow-lg">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
          <CalendarDays className="w-5 h-5 text-indigo-400" />
          Monthly Finance Preview ({now.toLocaleString('default', { month: 'long' })})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Total Sales</p>
            <p className="text-xl font-bold">{formatCurrency(monthTotalSales)}</p>
          </div>
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Collected</p>
            <p className="text-xl font-bold text-emerald-400">{formatCurrency(monthCollected)}</p>
          </div>
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Pending</p>
            <p className="text-xl font-bold text-rose-400">{formatCurrency(monthPending)}</p>
          </div>
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Expenses</p>
            <p className="text-xl font-bold text-amber-300">{formatCurrency(monthExpensesTotal)}</p>
          </div>
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Net Profit</p>
            <p className={`text-xl font-bold ${monthNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(monthNetProfit)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-rose-500" />
            Expense Insights
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Today Total</p>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(todayExpensesTotal)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Month Total</p>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(monthExpensesTotal)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Avg Today Expense</p>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(avgExpenseToday)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Avg Month Expense</p>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(avgExpenseMonth)}</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
              <p className="text-xs uppercase tracking-wide text-rose-700">Largest Today</p>
              {largestTodayExpense ? (
                <>
                  <p className="text-sm font-bold text-rose-700 mt-1">{largestTodayExpense.description}</p>
                  <p className="text-xs text-rose-600">
                    {formatCurrency(largestTodayExpense.amount)} at {formatTime(largestTodayExpense.timestamp)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-rose-600 mt-1">No expenses today.</p>
              )}
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs uppercase tracking-wide text-amber-700">Largest This Month</p>
              {largestMonthExpense ? (
                <>
                  <p className="text-sm font-bold text-amber-700 mt-1">{largestMonthExpense.description}</p>
                  <p className="text-xs text-amber-600">
                    {formatCurrency(largestMonthExpense.amount)} on{' '}
                    {new Date(largestMonthExpense.timestamp).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </>
              ) : (
                <p className="text-xs text-amber-600 mt-1">No expenses this month.</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-indigo-600" />
            Expense Timing (Today)
          </h3>
          <div className="space-y-2">
            {todaysExpenseBuckets.map((bucket) => (
              <div key={bucket.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{bucket.key}</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(bucket.total)}</p>
                </div>
                <p className="text-xs text-slate-500 mt-1">{bucket.count} entries</p>
              </div>
            ))}
          </div>
          <h4 className="mt-4 text-sm font-bold text-slate-700">Last 7 Days Expense Trend</h4>
          <div className="mt-2 space-y-2">
            {lastSevenDayExpenseRows.map((row) => (
              <div key={row.dateLabel} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>{row.label} ({row.dateLabel})</span>
                  <span>{row.count} entries</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${row.widthPct}%` }} />
                </div>
                <p className="text-xs font-bold text-slate-700 mt-1">{formatCurrency(row.total)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 mb-8">
        <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          Runtime Operations Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Order Success</p>
            <p className="font-bold text-slate-800">{opsSummary.orderCreateSuccess}</p>
          </div>
          <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Order Failure</p>
            <p className="font-bold text-rose-600">{opsSummary.orderCreateFailure}</p>
          </div>
          <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Order Latency P50</p>
            <p className="font-bold text-slate-800">{opsSummary.latencyP50} ms</p>
          </div>
          <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Order Latency P95</p>
            <p className="font-bold text-slate-800">{opsSummary.latencyP95} ms</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Realtime disconnects: {opsSummary.realtimeDisconnects}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-rose-500" />
            Add Expense
          </h3>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder="e.g., Ice blocks, Syrups, Cups"
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
            Today's Expenses
          </h3>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {todaysExpenses.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No expenses recorded today.</p>
            ) : (
              [...todaysExpenses].sort((a, b) => b.timestamp - a.timestamp).map((expense) => (
                <div key={expense.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="font-medium text-slate-800">{expense.description}</p>
                    <p className="text-xs text-slate-500">
                      {formatTime(expense.timestamp)}
                    </p>
                  </div>
                  <span className="font-bold text-rose-600">{formatCurrency(expense.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 mt-8">
        <h3 className="text-base font-bold text-slate-800 mb-3">Largest Expenses This Month</h3>
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {monthlyTopExpenses.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No month expense entries available.</p>
          ) : (
            monthlyTopExpenses.map((expense, index) => (
              <div key={expense.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    #{index + 1} {expense.description}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(expense.timestamp).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    {formatTime(expense.timestamp)}
                  </p>
                </div>
                <span className="text-sm font-bold text-rose-600 shrink-0">{formatCurrency(expense.amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-slate-200">
        <button
          onClick={onClearData}
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
