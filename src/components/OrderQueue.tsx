import React, { useState } from 'react';
import { CheckCircle2, Clock, User, QrCode } from 'lucide-react';
import { Order } from '../types';

interface OrderQueueProps {
  orders: Order[];
  onUpdateStatus: (id: string, status: 'pending' | 'completed') => void | Promise<void>;
  onUpdatePayment: (id: string, method: 'cash' | 'upi') => void | Promise<void>;
}

interface OrderCardProps {
  key?: React.Key;
  order: Order;
  isPending: boolean;
  settlingOrderId: string | null;
  setSettlingOrderId: (id: string | null) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'completed') => void | Promise<void>;
  onUpdatePayment: (id: string, method: 'cash' | 'upi') => void | Promise<void>;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function OrderCard({
  order,
  isPending,
  settlingOrderId,
  setSettlingOrderId,
  onUpdateStatus,
  onUpdatePayment,
}: OrderCardProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 ${isPending ? 'border-orange-200' : 'border-emerald-200 opacity-75'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${isPending ? 'text-orange-600' : 'text-emerald-600'}`}>
              #{order.orderNumber}
            </span>
            <span className="text-sm text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatTime(order.timestamp)}
            </span>
          </div>
          <div className="text-slate-700 font-medium flex items-center gap-1 mt-1">
            <User className="w-4 h-4 text-slate-400" />
            {order.customerName}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-slate-800">₹{order.total}</div>
          <div
            className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-2 py-0.5 rounded inline-block ${order.paymentStatus === 'unpaid'
              ? 'bg-rose-100 text-rose-700'
              : 'bg-slate-100 text-slate-500'
              }`}
          >
            {order.paymentStatus === 'unpaid' ? 'UNPAID' : order.paymentMethod}
          </div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-2 border border-slate-100">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm items-center">
            <span className="text-slate-700 flex items-center gap-2">
              <span className="font-bold text-slate-900 bg-white border border-slate-200 w-6 h-6 flex items-center justify-center rounded-md">
                {item.quantity}
              </span>
              <span className="font-medium">{item.name}</span>
              {item.variant && (
                <span className="text-[10px] uppercase tracking-wider font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                  {item.variant}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {(order.paymentStatus === 'unpaid' || !order.paymentStatus) && order.paymentMethod === 'pay_later' && (
        <div className="mb-4 pt-3 border-t border-slate-100">
          {settlingOrderId === order.id ? (
            <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex justify-center p-2 bg-white rounded-lg border border-slate-200">
                <QrCode className="w-24 h-24 text-slate-800" />
              </div>
              <p className="text-center text-xs font-medium text-slate-500">Scan to pay ₹{order.total}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onUpdatePayment(order.id, 'cash'); setSettlingOrderId(null); }}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  Cash Received
                </button>
                <button
                  onClick={() => { onUpdatePayment(order.id, 'upi'); setSettlingOrderId(null); }}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  UPI Received
                </button>
              </div>
              <button
                onClick={() => setSettlingOrderId(null)}
                className="w-full text-slate-500 hover:text-slate-700 text-sm font-medium py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSettlingOrderId(order.id)}
              className="w-full bg-rose-100 text-rose-700 hover:bg-rose-200 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              Settle Payment (₹{order.total})
            </button>
          )}
        </div>
      )}

      {isPending ? (
        <button
          onClick={() => onUpdateStatus(order.id, 'completed')}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] shadow-sm"
        >
          <CheckCircle2 className="w-5 h-5" />
          Mark as Done
        </button>
      ) : (
        <button
          onClick={() => onUpdateStatus(order.id, 'pending')}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl font-bold text-sm transition-colors"
        >
          Undo (Move to Pending)
        </button>
      )}
    </div>
  );
}

export function OrderQueue({ orders, onUpdateStatus, onUpdatePayment }: OrderQueueProps) {
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);

  const pendingOrders = orders
    .filter((o) => o.status === 'pending')
    .sort((a, b) => a.timestamp - b.timestamp);
  const completedOrders = orders
    .filter((o) => o.status === 'completed')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full pb-20 md:pb-0">
      {/* Pending Orders */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></span>
            Preparing ({pendingOrders.length})
          </h2>
        </div>
        <div className="space-y-4">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <div className="text-4xl mb-2">🧊</div>
              <p className="font-medium">No pending orders. Time to relax!</p>
            </div>
          ) : (
            pendingOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isPending={true}
                settlingOrderId={settlingOrderId}
                setSettlingOrderId={setSettlingOrderId}
                onUpdateStatus={onUpdateStatus}
                onUpdatePayment={onUpdatePayment}
              />
            ))
          )}
        </div>
      </div>

      {/* Completed Orders */}
      <div className="flex-1 md:max-w-md">
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          Recently Completed
        </h2>
        <div className="space-y-4">
          {completedOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <p className="font-medium">No completed orders yet.</p>
            </div>
          ) : (
            completedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isPending={false}
                settlingOrderId={settlingOrderId}
                setSettlingOrderId={setSettlingOrderId}
                onUpdateStatus={onUpdateStatus}
                onUpdatePayment={onUpdatePayment}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
