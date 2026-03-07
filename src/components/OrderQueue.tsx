import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, User, QrCode } from 'lucide-react';
import { Order } from '../types';

interface OrderQueueProps {
  orders: Order[];
  ordersRealtimeConnected: boolean;
  ordersPermissionError?: string | null;
  orderAlertsEnabled: boolean;
  onToggleOrderAlerts: (enabled: boolean) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'completed') => void | Promise<void>;
  onUpdatePayment: (id: string, method: 'cash' | 'upi') => void | Promise<void>;
  onClearPayment: (id: string, updatedTotal?: number) => void | Promise<void>;
}

interface OrderCardProps {
  key?: React.Key;
  order: Order;
  isPending: boolean;
  settlingOrderId: string | null;
  setSettlingOrderId: (id: string | null) => void;
  mutationState?: OrderMutationState;
  onRetryAction: (orderId: string) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'completed') => Promise<void>;
  onUpdatePayment: (id: string, method: 'cash' | 'upi') => Promise<void>;
  onClearPayment: (id: string, updatedTotal?: number) => Promise<void>;
}

type OrderActionKind = 'status' | 'payment' | 'clear';

type RetryDescriptor =
  | { kind: 'status'; nextStatus: 'pending' | 'completed' }
  | { kind: 'payment'; method: 'cash' | 'upi' }
  | { kind: 'clear'; updatedTotal?: number };

interface OrderMutationState {
  status: 'idle' | 'pending' | 'error';
  action?: OrderActionKind;
  message?: string;
  retry?: RetryDescriptor;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getItemVariant(item: Record<string, unknown>): string | null {
  if (typeof item.variant === 'string' && item.variant.trim()) return item.variant;
  if (typeof item.variantName === 'string' && item.variantName.trim()) return item.variantName;
  if (typeof item.variant_name === 'string' && item.variant_name.trim()) return item.variant_name;
  return null;
}

function OrderCard({
  order,
  isPending,
  settlingOrderId,
  setSettlingOrderId,
  mutationState,
  onRetryAction,
  onUpdateStatus,
  onUpdatePayment,
  onClearPayment,
}: OrderCardProps) {
  const [showClearOptions, setShowClearOptions] = useState(false);
  const [pendingDueAmount, setPendingDueAmount] = useState(String(order.total));

  useEffect(() => {
    setPendingDueAmount(String(order.total));
  }, [order.total]);

  const isUnpaid = order.paymentStatus !== 'paid';
  const isBusy = mutationState?.status === 'pending';
  const hasError = mutationState?.status === 'error' && mutationState.message;

  const handleClearPayment = async () => {
    const parsedAmount = Number(pendingDueAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      await onClearPayment(order.id);
      setShowClearOptions(false);
      return;
    }
    await onClearPayment(order.id, parsedAmount);
    setShowClearOptions(false);
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 ${isPending ? 'border-orange-200' : 'border-emerald-200 opacity-75'}`}>
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${isPending ? 'text-orange-600' : 'text-emerald-600'}`}>
              #{order.orderNumber}
            </span>
            <span className="text-xs sm:text-sm text-slate-500 flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" /> {formatTime(order.timestamp)}
            </span>
          </div>
          <div className="text-slate-700 font-medium flex items-center gap-1 mt-1 break-words">
            <User className="w-4 h-4 text-slate-400" />
            {order.customerName}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-slate-800">₹{order.total}</div>
          <div
            className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-2 py-0.5 rounded inline-block ${isUnpaid
              ? 'bg-rose-100 text-rose-700'
              : 'bg-slate-100 text-slate-500'
              }`}
          >
            {isUnpaid ? 'UNPAID' : order.paymentMethod}
          </div>
        </div>
      </div>

      {order.orderInstructions && (
        <div className="mb-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <span className="font-bold uppercase tracking-wide text-[10px] mr-2">Instructions</span>
          {order.orderInstructions}
        </div>
      )}

      <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-2 border border-slate-100">
        {order.items.map((item, idx) => {
          const variant = getItemVariant(item as unknown as Record<string, unknown>);
          return (
            <div key={idx} className="flex justify-between text-sm items-start gap-2">
              <span className="text-slate-700 flex items-start gap-2 min-w-0 flex-1">
                <span className="font-bold text-slate-900 bg-white border border-slate-200 w-6 h-6 flex items-center justify-center rounded-md">
                  {item.quantity}
                </span>
                <span className="font-medium break-words">{item.name}</span>
                {variant && (
                  <span className="text-[10px] uppercase tracking-wider font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded shrink-0">
                    {variant}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {isUnpaid && (
        <div className="mb-4 pt-3 border-t border-slate-100">
          {settlingOrderId === order.id ? (
            <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex justify-center p-2 bg-white rounded-lg border border-slate-200">
                <img src="/qr.png" alt="UPI QR" className="w-56 h-56 text-slate-800 mb-2" />
              </div>
              <p className="text-center text-xs font-medium text-slate-500">Scan to pay ₹{order.total}</p>
              <p className="text-center text-[11px] text-slate-500">
                Select received method to mark payment as paid
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={async () => {
                    try {
                      await onUpdatePayment(order.id, 'cash');
                      setSettlingOrderId(null);
                    } catch {
                      // Error state is handled by parent mutation state.
                    }
                  }}
                  disabled={isBusy}
                  className="flex-1 min-h-11 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  Cash Received
                </button>
                <button
                  onClick={async () => {
                    try {
                      await onUpdatePayment(order.id, 'upi');
                      setSettlingOrderId(null);
                    } catch {
                      // Error state is handled by parent mutation state.
                    }
                  }}
                  disabled={isBusy}
                  className="flex-1 min-h-11 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  UPI Received
                </button>
              </div>
              <button
                onClick={() => setSettlingOrderId(null)}
                disabled={isBusy}
                className="w-full text-slate-500 hover:text-slate-700 text-sm font-medium py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSettlingOrderId(order.id)}
              className="w-full min-h-11 bg-rose-100 text-rose-700 hover:bg-rose-200 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              Settle Payment (₹{order.total})
            </button>
          )}
        </div>
      )}

      <div className="mb-4 pt-3 border-t border-slate-100">
        {showClearOptions ? (
          <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-amber-800">
              Set due amount before clear
            </label>
            <input
              type="number"
              min="1"
              value={pendingDueAmount}
              onChange={(e) => setPendingDueAmount(e.target.value)}
              disabled={isBusy}
              className="w-full h-10 px-3 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              placeholder="Enter due amount"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => {
                  void handleClearPayment().catch(() => undefined);
                }}
                disabled={isBusy}
                className="w-full min-h-11 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                Clear With Amount
              </button>
              <button
                onClick={() => setShowClearOptions(false)}
                disabled={isBusy}
                className="w-full min-h-11 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowClearOptions(true)}
            className="w-full min-h-11 bg-amber-100 text-amber-800 hover:bg-amber-200 py-2.5 rounded-xl font-bold text-sm transition-colors"
          >
            {isUnpaid ? 'Adjust Due Amount' : 'Clear / Adjust Payment'}
          </button>
        )}
      </div>

      {isPending ? (
        <button
          onClick={() => {
            void onUpdateStatus(order.id, 'completed').catch(() => undefined);
          }}
          disabled={isBusy}
          className="w-full min-h-12 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] shadow-sm"
        >
          <CheckCircle2 className="w-5 h-5" />
          Mark as Done
        </button>
      ) : (
        <button
          onClick={() => {
            void onUpdateStatus(order.id, 'pending').catch(() => undefined);
          }}
          disabled={isBusy}
          className="w-full min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl font-bold text-sm transition-colors"
        >
          Undo (Move to Pending)
        </button>
      )}
      {hasError && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-sm font-medium text-rose-700">{mutationState?.message}</p>
          <button
            type="button"
            onClick={() => onRetryAction(order.id)}
            className="mt-2 text-xs font-bold uppercase tracking-wide text-rose-700 hover:text-rose-800"
          >
            Retry Last Action
          </button>
        </div>
      )}
    </div>
  );
}

export function OrderQueue({
  orders,
  ordersRealtimeConnected,
  ordersPermissionError,
  orderAlertsEnabled,
  onToggleOrderAlerts,
  onUpdateStatus,
  onUpdatePayment,
  onClearPayment,
}: OrderQueueProps) {
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);
  const [mobileSection, setMobileSection] = useState<'pending' | 'completed'>('pending');
  const [pendingRenderLimit, setPendingRenderLimit] = useState(40);
  const [mutationStateByOrder, setMutationStateByOrder] = useState<Record<string, OrderMutationState>>({});

  const pendingOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'pending')
        .sort((a, b) => a.timestamp - b.timestamp),
    [orders],
  );
  const completedOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'completed')
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10),
    [orders],
  );

  const shouldChunkPendingRender = pendingOrders.length > 40;
  const visiblePendingOrders = shouldChunkPendingRender
    ? pendingOrders.slice(0, pendingRenderLimit)
    : pendingOrders;

  useEffect(() => {
    setPendingRenderLimit(40);
  }, [pendingOrders.length]);

  const runOrderAction = async (
    orderId: string,
    action: OrderActionKind,
    retry: RetryDescriptor,
    executor: () => Promise<void>,
  ) => {
    setMutationStateByOrder((prev) => ({
      ...prev,
      [orderId]: { status: 'pending', action, retry },
    }));

    try {
      await executor();
      setMutationStateByOrder((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      setMutationStateByOrder((prev) => ({
        ...prev,
        [orderId]: {
          status: 'error',
          action,
          retry,
          message: error instanceof Error && error.message.trim() ? error.message : 'Action failed. Please retry.',
        },
      }));
      throw error;
    }
  };

  const handleUpdateStatus = (id: string, status: 'pending' | 'completed') =>
    runOrderAction(id, 'status', { kind: 'status', nextStatus: status }, () => Promise.resolve(onUpdateStatus(id, status)));

  const handleUpdatePayment = (id: string, method: 'cash' | 'upi') =>
    runOrderAction(id, 'payment', { kind: 'payment', method }, () => Promise.resolve(onUpdatePayment(id, method)));

  const handleClearPayment = (id: string, updatedTotal?: number) =>
    runOrderAction(id, 'clear', { kind: 'clear', updatedTotal }, () => Promise.resolve(onClearPayment(id, updatedTotal)));

  const handleRetryAction = (orderId: string) => {
    const retry = mutationStateByOrder[orderId]?.retry;
    if (!retry) return;
    if (retry.kind === 'status') {
      void handleUpdateStatus(orderId, retry.nextStatus);
      return;
    }
    if (retry.kind === 'payment') {
      void handleUpdatePayment(orderId, retry.method);
      return;
    }
    void handleClearPayment(orderId, retry.updatedTotal);
  };

  return (
    <div className="mobile-bottom-offset md:pb-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${ordersRealtimeConnected
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${ordersRealtimeConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
          />
          {ordersRealtimeConnected ? 'Live Orders Connected' : 'Reconnecting Live Orders'}
        </span>
        <button
          type="button"
          onClick={() => onToggleOrderAlerts(!orderAlertsEnabled)}
          aria-pressed={orderAlertsEnabled}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${orderAlertsEnabled
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
        >
          <span>Order Alerts</span>
          <span
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${orderAlertsEnabled ? 'bg-indigo-500' : 'bg-slate-300'
              }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${orderAlertsEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
            />
          </span>
          <span className="text-[10px]">{orderAlertsEnabled ? 'On' : 'Off'}</span>
        </button>
      </div>
      {ordersPermissionError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {ordersPermissionError}
        </div>
      )}

      <div className="md:hidden mb-4 bg-white border border-slate-200 rounded-xl p-1 grid grid-cols-2 gap-1">
        <button
          onClick={() => setMobileSection('pending')}
          className={`min-h-11 rounded-lg text-sm font-bold transition-colors ${mobileSection === 'pending'
            ? 'bg-orange-100 text-orange-700'
            : 'text-slate-500'
            }`}
        >
          Preparing ({pendingOrders.length})
        </button>
        <button
          onClick={() => setMobileSection('completed')}
          className={`min-h-11 rounded-lg text-sm font-bold transition-colors ${mobileSection === 'completed'
            ? 'bg-emerald-100 text-emerald-700'
            : 'text-slate-500'
            }`}
        >
          Completed ({completedOrders.length})
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6 h-full items-start">
        {/* Pending Orders */}
        <div className={`flex-1 ${mobileSection === 'pending' ? 'block' : 'hidden'} md:block`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
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
              visiblePendingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isPending={true}
                  settlingOrderId={settlingOrderId}
                  setSettlingOrderId={setSettlingOrderId}
                  mutationState={mutationStateByOrder[order.id]}
                  onRetryAction={handleRetryAction}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdatePayment={handleUpdatePayment}
                  onClearPayment={handleClearPayment}
                />
              ))
            )}
          </div>
          {shouldChunkPendingRender && visiblePendingOrders.length < pendingOrders.length && (
            <button
              type="button"
              onClick={() => setPendingRenderLimit((prev) => Math.min(prev + 20, pendingOrders.length))}
              className="mt-4 w-full min-h-11 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-semibold text-sm"
            >
              Load More Orders ({pendingOrders.length - visiblePendingOrders.length} remaining)
            </button>
          )}
        </div>

        {/* Completed Orders */}
        <div className={`flex-1 md:max-w-md ${mobileSection === 'completed' ? 'block' : 'hidden'} md:block`}>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
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
                  mutationState={mutationStateByOrder[order.id]}
                  onRetryAction={handleRetryAction}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdatePayment={handleUpdatePayment}
                  onClearPayment={handleClearPayment}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
