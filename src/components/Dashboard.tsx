import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Receipt, PlusCircle, AlertTriangle, CalendarDays } from 'lucide-react';
import { Order, Expense } from '../types';

interface DashboardProps {
  orders: Order[];
  expenses: Expense[];
  onAddExpense: (desc: string, amount: number) => void;
  onClearData: () => void;
}

export function Dashboard({ orders, expenses, onAddExpense, onClearData }: DashboardProps) {
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  // Calculate today's stats
  const today = new Date().setHours(0, 0, 0, 0);
  
  const todaysOrders = orders.filter(o => o.timestamp >= today);
  const todaysExpenses = expenses.filter(e => e.timestamp >= today);

  const totalSales = todaysOrders.reduce((sum, o) => sum + o.total, 0);
  const cashSales = todaysOrders.filter(o => o.paymentMethod === 'cash' && o.paymentStatus !== 'unpaid').reduce((sum, o) => sum + o.total, 0);
  const upiSales = todaysOrders.filter(o => o.paymentMethod === 'upi' && o.paymentStatus !== 'unpaid').reduce((sum, o) => sum + o.total, 0);
  const pendingSales = todaysOrders.filter(o => o.paymentStatus === 'unpaid').reduce((sum, o) => sum + o.total, 0);
  
  const totalExpenses = todaysExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = (cashSales + upiSales) - totalExpenses;

  // Calculate monthly stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  
  const monthlyOrders = orders.filter(o => o.timestamp >= startOfMonth);
  const monthlyExpenses = expenses.filter(e => e.timestamp >= startOfMonth);

  const monthlyTotalSales = monthlyOrders.reduce((sum, o) => sum + o.total, 0);
  const monthlyCollected = monthlyOrders.filter(o => o.paymentStatus !== 'unpaid').reduce((sum, o) => sum + o.total, 0);
  const monthlyPending = monthlyOrders.filter(o => o.paymentStatus === 'unpaid').reduce((sum, o) => sum + o.total, 0);
  const monthlyTotalExpenses = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
  const monthlyNetProfit = monthlyCollected - monthlyTotalExpenses;

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount) return;
    onAddExpense(expenseDesc, parseFloat(expenseAmount));
    setExpenseDesc('');
    setExpenseAmount('');
  };

  const StatCard = ({ title, amount, icon: Icon, colorClass, subtitle }: any) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
      <div>
        <p className="text-slate-500 font-medium text-sm mb-1">{title}</p>
        <h3 className={`text-3xl font-bold ${colorClass}`}>₹{amount}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-2">{subtitle}</p>}
      </div>
      <div className={`p-3 rounded-xl ${colorClass.replace('text-', 'bg-').replace('600', '100')}`}>
        <Icon className={`w-6 h-6 ${colorClass}`} />
      </div>
    </div>
  );

  return (
    <div className="pb-20 md:pb-0 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Today's Dashboard</h2>
        <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard 
          title="Today's Collected" 
          amount={cashSales + upiSales} 
          icon={TrendingUp} 
          colorClass="text-indigo-600"
          subtitle={`Cash: ₹${cashSales} | UPI: ₹${upiSales}${pendingSales > 0 ? ` | Unpaid: ₹${pendingSales}` : ''}`}
        />
        <StatCard 
          title="Today's Expenses" 
          amount={totalExpenses} 
          icon={TrendingDown} 
          colorClass="text-rose-600"
          subtitle={`${todaysExpenses.length} expense items`}
        />
        <StatCard 
          title="Today's Net Profit" 
          amount={netProfit} 
          icon={DollarSign} 
          colorClass={netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}
          subtitle="Based on collected amount"
        />
      </div>

      {/* Monthly Preview */}
      <div className="bg-slate-800 rounded-2xl p-6 mb-8 text-white shadow-lg">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
          <CalendarDays className="w-5 h-5 text-indigo-400" />
          Monthly Finance Preview ({now.toLocaleString('default', { month: 'long' })})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Total Sales</p>
            <p className="text-xl font-bold">₹{monthlyTotalSales}</p>
          </div>
          <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Collected</p>
            <p className="text-xl font-bold text-emerald-400">₹{monthlyCollected}</p>
          </div>
          <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Pending</p>
            <p className="text-xl font-bold text-rose-400">₹{monthlyPending}</p>
          </div>
          <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Net Profit</p>
            <p className={`text-xl font-bold ${monthlyNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ₹{monthlyNetProfit}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Add Expense Form */}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
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

        {/* Recent Expenses List */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-slate-500" />
            Today's Expenses
          </h3>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {todaysExpenses.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No expenses recorded today.</p>
            ) : (
              todaysExpenses.sort((a, b) => b.timestamp - a.timestamp).map(expense => (
                <div key={expense.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="font-medium text-slate-800">{expense.description}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(expense.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="font-bold text-rose-600">₹{expense.amount}</span>
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
