import React, { useEffect, useState } from 'react';
import { Store, ClipboardList, BarChart3, Settings, BellRing } from 'lucide-react';
import { useStore } from './store';
import { NewOrder } from './components/NewOrder';
import { OrderQueue } from './components/OrderQueue';
import { Dashboard } from './components/Dashboard';
import { MenuManager } from './components/MenuManager';

type Tab = 'new-order' | 'queue' | 'dashboard' | 'menu';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('new-order');
  const {
    orders, expenses, menuItems, loading,
    addOrder, updateOrderStatus, updatePayment, addExpense, clearData,
    addMenuItem, updateMenuItem, deleteMenuItem,
    incomingOrderNotification, clearIncomingOrderNotification,
  } = useStore();

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  useEffect(() => {
    if (!incomingOrderNotification) return;
    const timeoutId = window.setTimeout(() => {
      clearIncomingOrderNotification();
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [incomingOrderNotification, clearIncomingOrderNotification]);

  const NavButton = ({ tab, icon: Icon, label, badge }: any) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 flex-1 py-3 md:py-4 px-2 md:px-6 transition-all relative ${activeTab === tab
        ? 'text-indigo-600 bg-indigo-50/50 md:bg-transparent md:border-b-2 border-indigo-600'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
        }`}
    >
      <div className="relative">
        <Icon className={`w-6 h-6 md:w-5 md:h-5 ${activeTab === tab ? 'stroke-[2.5px]' : ''}`} />
        {badge > 0 && (
          <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] md:text-sm font-medium ${activeTab === tab ? 'font-bold' : ''}`}>
        {label}
      </span>
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Loading Ice Dish POS…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header (Desktop) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Store className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Ice Dish POS</h1>
            </div>
            <nav className="flex space-x-2">
              <NavButton tab="new-order" icon={Store} label="New Order" />
              <NavButton tab="queue" icon={ClipboardList} label="Orders Queue" badge={pendingCount} />
              <NavButton tab="dashboard" icon={BarChart3} label="Dashboard" />
              <NavButton tab="menu" icon={Settings} label="Menu" />
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="bg-white border-b border-slate-200 p-4 md:hidden sticky top-0 z-10 flex items-center gap-2 shadow-sm">
        <div className="bg-indigo-600 p-1.5 rounded-lg">
          <Store className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">Ice Dish POS</h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 overflow-hidden flex flex-col">
        {activeTab === 'new-order' && <NewOrder menuItems={menuItems} onPlaceOrder={addOrder} />}
        {activeTab === 'queue' && <OrderQueue orders={orders} onUpdateStatus={updateOrderStatus} onUpdatePayment={updatePayment} />}
        {activeTab === 'dashboard' && (
          <Dashboard
            orders={orders}
            expenses={expenses}
            onAddExpense={addExpense}
            onClearData={clearData}
          />
        )}
        {activeTab === 'menu' && (
          <MenuManager
            menuItems={menuItems}
            onAdd={addMenuItem}
            onUpdate={updateMenuItem}
            onDelete={deleteMenuItem}
          />
        )}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center pb-safe z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <NavButton tab="new-order" icon={Store} label="New Order" />
        <NavButton tab="queue" icon={ClipboardList} label="Queue" badge={pendingCount} />
        <NavButton tab="dashboard" icon={BarChart3} label="Dashboard" />
        <NavButton tab="menu" icon={Settings} label="Menu" />
      </nav>

      {incomingOrderNotification && (
        <button
          type="button"
          onClick={() => {
            setActiveTab('queue');
            clearIncomingOrderNotification();
          }}
          className="fixed right-4 md:right-6 bottom-24 md:bottom-6 z-30 w-[calc(100%-2rem)] md:w-auto max-w-sm bg-indigo-600 text-white rounded-xl shadow-xl p-4 text-left hover:bg-indigo-700 transition-colors"
        >
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">New Order Received</p>
              <p className="text-sm text-indigo-100">
                #{incomingOrderNotification.orderNumber} · {incomingOrderNotification.customerName}
              </p>
              <p className="text-xs text-indigo-100 mt-1">
                {incomingOrderNotification.items.reduce((sum, item) => sum + item.quantity, 0)} items · ₹{incomingOrderNotification.total}
              </p>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
