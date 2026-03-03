import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Receipt, PlusCircle, AlertTriangle, CalendarDays, Activity } from 'lucide-react';
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
  const todayExpenses = metrics?.todayExpenses ?? fallbackTodayExpenses;
  const todayNetProfit = metrics?.todayNetProfit ?? (todayCollected - todayExpenses);

  const monthTotalSales = metrics?.monthTotalSales ?? fallbackMonthTotalSales;
  const monthCollected = metrics?.monthCollected ?? fallbackMonthCollected;
  const monthPending = metrics?.monthPending ?? fallbackMonthPending;
  const monthExpenses = metrics?.monthExpenses ?? fallbackMonthExpenses;
  const monthNetProfit = metrics?.monthNetProfit ?? (monthCollected - monthExpenses);

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

  const StatCard = ({ title, amount, icon: Icon, colorClass, subtitle }: any) => (
    <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-slate-500 font-medium text-sm mb-1">{title}</p>
        <h3 className={`text-2xl sm:text-3xl font-bold ${colorClass}`}>Rs {amount}</h3>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Today's Collected"
          amount={todayCollected}
          icon={TrendingUp}
          colorClass="text-indigo-600"
          subtitle={`Total: Rs ${todayTotalSales}${todayPending > 0 ? ` | Unpaid: Rs ${todayPending}` : ''}`}
        />
        <StatCard
          title="Today's Expenses"
          amount={todayExpenses}
          icon={TrendingDown}
          colorClass="text-rose-600"
          subtitle={`${todaysExpenses.length} expense items`}
        />
        <StatCard
          title="Today's Net Profit"
          amount={todayNetProfit}
          icon={DollarSign}
          colorClass={todayNetProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          subtitle="Based on collected amount"
        />
      </div>

      <div className="bg-slate-800 rounded-2xl p-4 sm:p-6 mb-8 text-white shadow-lg">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
          <CalendarDays className="w-5 h-5 text-indigo-400" />
          Monthly Finance Preview ({now.toLocaleString('default', { month: 'long' })})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Total Sales</p>
            <p className="text-xl font-bold">Rs {monthTotalSales}</p>
          </div>
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Collected</p>
            <p className="text-xl font-bold text-emerald-400">Rs {monthCollected}</p>
          </div>
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Pending</p>
            <p className="text-xl font-bold text-rose-400">Rs {monthPending}</p>
          </div>
          <div className="bg-slate-700/50 p-3 sm:p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Net Profit</p>
            <p className={`text-xl font-bold ${monthNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              Rs {monthNetProfit}
            </p>
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
                      {new Date(expense.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="font-bold text-rose-600">Rs {expense.amount}</span>
                </div>
              ))
            )}
          </div>
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
