import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, User, QrCode, Smartphone, ShoppingBag, Utensils, Monitor, Filter } from 'lucide-react';
import { MenuItem, Order } from '../types';
import type { PushStatus } from '../hooks/usePushNotifications';

export function IceCubeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05" />
      <path d="M12 22.08V12" />
    </svg>
  );
}

interface OrderQueueProps {
  orders: Order[];
  menuItems: MenuItem[];
  ordersRealtimeConnected: boolean;
  ordersPermissionError?: string | null;
  orderAlertsEnabled: boolean;
  onToggleOrderAlerts: (enabled: boolean) => void;
  // Push notification props (optional — gracefully absent when unsupported)
  pushEnabled?: boolean;
  pushStatus?: PushStatus;
  pushLoading?: boolean;
  onTogglePush?: (enabled: boolean) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'completed') => void | Promise<void>;
  onUpdatePayment: (id: string, method: 'cash' | 'upi', note?: string) => void | Promise<void>;
  onClearPayment: (id: string, updatedTotal?: number) => void | Promise<void>;
  onCancelOrder: (id: string, reason?: string) => void | Promise<void>;
  onRequestModifyOrder: (order: Order) => void;
}

interface OrderCardProps {
  key?: React.Key;
  order: Order;
  menuItemsById: Map<string, string>;
  isPending: boolean;
  settlingOrderId: string | null;
  setSettlingOrderId: (id: string | null) => void;
  mutationState?: OrderMutationState;
  onRetryAction: (orderId: string) => void;
  onCancelOrder: (id: string, reason?: string) => Promise<void>;
  onRequestModifyOrder: (order: Order) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'completed') => Promise<void>;
  onUpdatePayment: (id: string, method: 'cash' | 'upi', note?: string) => Promise<void>;
  onClearPayment: (id: string, updatedTotal?: number) => Promise<void>;
}

type OrderActionKind = 'status' | 'payment' | 'clear' | 'cancel';

type RetryDescriptor =
  | { kind: 'status'; nextStatus: 'pending' | 'completed' }
  | { kind: 'payment'; method: 'cash' | 'upi'; note?: string }
  | { kind: 'clear'; updatedTotal?: number }
  | { kind: 'cancel'; reason?: string };

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

function getItemCategory(item: Record<string, unknown>, menuItemsById: Map<string, string>) {
  if (typeof item.category === 'string' && item.category.trim()) return item.category;
  const itemId = typeof item.id === 'string' ? item.id : null;
  return itemId ? menuItemsById.get(itemId) ?? null : null;
}

function getOrderItemsSubtotal(order: Order) {
  return order.items.reduce((sum, item) => {
    const rawItem = item as unknown as Record<string, unknown>;
    const unitPrice = Number(
      rawItem.calculatedPrice ?? rawItem.price ?? 0,
    );
    const quantity = Number(rawItem.quantity ?? 0);

    return sum + (Number.isFinite(unitPrice) ? unitPrice : 0) * (Number.isFinite(quantity) ? quantity : 0);
  }, 0);
}

function parseInstructionLines(instructions?: string) {
  return (instructions ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractParcelNote(instructions?: string) {
  return parseInstructionLines(instructions).find((line) => /\b(parcel|take\s*away|takeaway)\b/i.test(line)) ?? null;
}

function buildVisibleInstructions(instructions?: string) {
  const parcelNote = extractParcelNote(instructions);
  const remainingLines = parseInstructionLines(instructions).filter((line) => line !== parcelNote);
  return remainingLines.length > 0 ? remainingLines.join('\n') : null;
}

function OrderCard({
  order,
  menuItemsById,
  isPending,
  settlingOrderId,
  setSettlingOrderId,
  mutationState,
  onRetryAction,
  onCancelOrder,
  onRequestModifyOrder,
  onUpdateStatus,
  onUpdatePayment,
  onClearPayment,
}: OrderCardProps) {
  const [showClearOptions, setShowClearOptions] = useState(false);
  const [showCancelOptions, setShowCancelOptions] = useState(false);
  const [pendingDueAmount, setPendingDueAmount] = useState(String(order.total));
  const [paymentNote, setPaymentNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const itemsSubtotal = getOrderItemsSubtotal(order);
  const explicitParcelNote = extractParcelNote(order.orderInstructions);
  const inferredParcelNote =
    !explicitParcelNote &&
      order.source === 'customer' &&
      Math.round(order.total - itemsSubtotal) === 5
      ? 'Parcel order (+Rs 5 parcel charge)'
      : null;
  const parcelNote = explicitParcelNote ?? inferredParcelNote;
  const visibleInstructions = buildVisibleInstructions(order.orderInstructions);

  useEffect(() => {
    setPendingDueAmount(String(order.total));
  }, [order.total]);

  useEffect(() => {
    if (settlingOrderId !== order.id) {
      setPaymentNote('');
    }
  }, [order.id, settlingOrderId]);

  useEffect(() => {
    if (!showCancelOptions) {
      setCancelReason('');
    }
  }, [showCancelOptions]);

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

  const handleCancelOrder = async () => {
    await onCancelOrder(order.id, cancelReason);
    setShowCancelOptions(false);
  };

  const isCustomerOrder = order.source === 'customer';
  const cardBorderClass = isPending
    ? isCustomerOrder
      ? 'border-indigo-300 bg-indigo-500/[0.015]'
      : 'border-outline-variant'
    : 'border-outline-variant opacity-75';

  const SourceBadge = isCustomerOrder ? (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
      <QrCode className="w-3 h-3 text-indigo-500" /> QR Order
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant">
      <Monitor className="w-3 h-3 text-on-surface-variant/75" /> POS Order
    </span>
  );

  const DeliveryBadge = parcelNote ? (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
      <ShoppingBag className="w-3 h-3 text-amber-500" /> Parcel
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
      <Utensils className="w-3 h-3 text-emerald-500" /> Dine In
    </span>
  );

  const getCategoryBadgeClass = (cat: string) => {
    switch (cat) {
      case 'Regular':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Special Dish':
      case 'Special':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Pyali':
      case 'Pyaali':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      default:
        return 'bg-surface-container text-on-surface-variant border-outline-variant';
    }
  };

  return (
    <div className={`bg-surface-container-lowest rounded-xl shadow-sm border p-4 scale-98 active:scale-[0.99] transition-transform duration-150 relative overflow-hidden ${cardBorderClass}`}>
      {isCustomerOrder && isPending && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
      )}
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold font-headline ${isPending ? 'text-on-surface' : 'text-on-surface-variant/70'}`}>
              #{order.orderNumber}
            </span>
            <span className="text-xs text-on-surface-variant/60 flex items-center gap-1 shrink-0 font-mono">
              <Clock className="w-3 h-3" /> {formatTime(order.timestamp)}
            </span>
          </div>
          <div className="text-on-surface-variant font-semibold flex items-center gap-1 mt-1 break-words text-sm">
            <User className="w-3.5 h-3.5 text-on-surface-variant/60" />
            {order.customerName}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SourceBadge}
            {DeliveryBadge}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-on-surface font-headline">₹{order.total}</div>
          <div className="flex flex-col items-end gap-1.5 mt-1">
            <div
              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block border ${
                isUnpaid
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-secondary-container text-on-secondary-container border-transparent'
              }`}
            >
              {isUnpaid ? 'UNPAID' : order.paymentMethod.toUpperCase()}
            </div>
            <div
              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block border ${
                isPending
                  ? 'bg-error-container text-on-error-container border-transparent'
                  : 'bg-secondary-container text-on-secondary-container border-transparent'
              }`}
            >
              {isPending ? 'Preparing' : 'Done'}
            </div>
          </div>
        </div>
      </div>

      {parcelNote && (
        <div className="mb-3 p-2.5 rounded-lg border border-secondary/20 bg-secondary-container/10 text-xs text-on-secondary-container font-semibold">
          <span className="font-bold uppercase tracking-wide text-[9px] mr-2">Special Note</span>
          {parcelNote}
        </div>
      )}

      {visibleInstructions && (
        <div className="mb-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 font-medium">
          <span className="font-bold uppercase tracking-wide text-[9px] mr-2">Instructions</span>
          {visibleInstructions}
        </div>
      )}

      <div className="bg-surface rounded-xl p-3 mb-4 space-y-2 border border-outline-variant/50">
        {order.items.map((item, idx) => {
          const rawItem = item as unknown as Record<string, unknown>;
          const variant = getItemVariant(rawItem);
          const category = getItemCategory(rawItem, menuItemsById);
          return (
            <div key={idx} className="flex justify-between text-xs items-start gap-2">
              <span className="text-on-surface-variant flex items-start gap-2 min-w-0 flex-1">
                <span className="font-bold text-on-surface bg-surface-container border border-outline-variant w-5.5 h-5.5 flex items-center justify-center rounded font-mono text-[10px]">
                  {item.quantity}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold break-words block text-xs text-on-surface">{item.name}</span>
                  {(category || variant) && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {category && (
                        <span className={`text-[9px] uppercase tracking-wider font-bold border px-1.5 py-0.5 rounded shrink-0 ${getCategoryBadgeClass(category)}`}>
                          {category}
                        </span>
                      )}
                      {variant && (
                        <span className="text-[9px] uppercase tracking-wider font-bold bg-surface-variant text-on-surface px-1.5 py-0.5 rounded border border-outline-variant shrink-0">
                          {variant}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {isUnpaid && (
        <div className="mb-4 pt-3 border-t border-outline-variant/40">
          {settlingOrderId === order.id ? (
            <div className="space-y-3 bg-surface p-3 rounded-xl border border-outline-variant">
              <p className="text-center text-xs font-semibold text-on-surface-variant">Scan to pay ₹{order.total}</p>
              <p className="text-center text-[10px] text-on-surface-variant/75">
                Select received method to mark payment as paid
              </p>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/75">
                  Special Note (Optional)
                </label>
                <textarea
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  disabled={isBusy}
                  rows={2}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
                  placeholder="Add payment note, reference, or special remark"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={async () => {
                    try {
                      await onUpdatePayment(order.id, 'cash', paymentNote);
                      setPaymentNote('');
                      setSettlingOrderId(null);
                    } catch {
                      // Error state is handled by parent mutation state.
                    }
                  }}
                  disabled={isBusy}
                  className="flex-1 h-[38px] bg-secondary hover:opacity-90 text-on-secondary py-1.5 rounded-lg text-xs font-bold transition-all scale-98 active:scale-95 duration-150"
                >
                  Cash Received
                </button>
                <button
                  onClick={async () => {
                    try {
                      await onUpdatePayment(order.id, 'upi', paymentNote);
                      setPaymentNote('');
                      setSettlingOrderId(null);
                    } catch {
                      // Error state is handled by parent mutation state.
                    }
                  }}
                  disabled={isBusy}
                  className="flex-1 h-[38px] bg-blue-600 hover:opacity-90 text-white py-1.5 rounded-lg text-xs font-bold transition-all scale-98 active:scale-95 duration-150"
                >
                  UPI Received
                </button>
              </div>
              <button
                onClick={() => {
                  setPaymentNote('');
                  setSettlingOrderId(null);
                }}
                disabled={isBusy}
                className="w-full text-on-surface-variant/70 hover:text-on-surface text-xs font-bold py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSettlingOrderId(order.id)}
              className="w-full h-11 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 py-2 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              Settle Payment (₹{order.total})
            </button>
          )}
        </div>
      )}

      <div className="mb-4 pt-3 border-t border-outline-variant/40">
        {showClearOptions ? (
          <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Set due amount before clear
            </label>
            <input
              type="number"
              min="1"
              value={pendingDueAmount}
              onChange={(e) => setPendingDueAmount(e.target.value)}
              disabled={isBusy}
              className="w-full h-10 px-3 rounded-lg border border-amber-300 bg-surface focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-mono text-on-surface"
              placeholder="Enter due amount"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => {
                  void handleClearPayment().catch(() => undefined);
                }}
                disabled={isBusy}
                className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white py-1.5 rounded-lg font-bold text-xs transition-colors"
              >
                Clear With Amount
              </button>
              <button
                onClick={() => setShowClearOptions(false)}
                disabled={isBusy}
                className="w-full h-10 bg-surface border border-amber-300 text-amber-700 hover:bg-amber-100 py-1.5 rounded-lg font-bold text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowClearOptions(true)}
            className="w-full h-10 bg-surface-container text-on-surface-variant border border-outline-variant/50 hover:bg-surface-container-high py-2 rounded-xl font-bold text-xs transition-colors active:scale-[0.98]"
          >
            {isUnpaid ? 'Adjust Due Amount' : 'Clear / Adjust Payment'}
          </button>
        )}
      </div>

      {isPending && (
        <div className="mb-4 pt-3 border-t border-outline-variant/40 space-y-2">
          <button
            type="button"
            onClick={() => onRequestModifyOrder(order)}
            disabled={isBusy}
            className="w-full h-10 bg-surface-container-high text-primary hover:bg-surface-container-highest py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-60 active:scale-[0.98]"
          >
            Modify Order
          </button>
          {showCancelOptions ? (
            <div className="space-y-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">
                Cancel Reason (Optional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                disabled={isBusy}
                className="w-full rounded-lg border border-rose-200 bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="Reason for cancellation"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleCancelOrder().catch(() => undefined);
                  }}
                  disabled={isBusy}
                  className="w-full h-10 bg-rose-500 hover:bg-rose-600 text-white py-1.5 rounded-lg font-bold text-xs transition-colors"
                >
                  Confirm Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelOptions(false)}
                  disabled={isBusy}
                  className="w-full h-10 bg-surface border border-rose-300 text-rose-700 hover:bg-rose-100 py-1.5 rounded-lg font-bold text-xs transition-colors"
                >
                  Keep Order
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCancelOptions(true)}
              disabled={isBusy}
              className="w-full h-10 bg-rose-50 text-rose-700 hover:bg-rose-100 py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-60 active:scale-[0.98]"
            >
              Cancel Order
            </button>
          )}
        </div>
      )}

      {isPending ? (
        <button
          onClick={() => {
            void onUpdateStatus(order.id, 'completed').catch(() => undefined);
          }}
          disabled={isBusy}
          className="w-full h-11 bg-secondary text-on-secondary rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all scale-98 active:scale-95 duration-150 btn-checkout shadow-sm text-sm"
        >
          <CheckCircle2 className="w-4 h-4" />
          Mark as Done
        </button>
      ) : (
        <button
          onClick={() => {
            void onUpdateStatus(order.id, 'pending').catch(() => undefined);
          }}
          disabled={isBusy}
          className="w-full h-10 bg-surface-container text-on-surface-variant/80 border border-outline-variant/40 hover:bg-surface-container-high py-2 rounded-xl font-bold text-xs transition-colors"
        >
          Undo (Move to Pending)
        </button>
      )}
      {hasError && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-xs font-semibold text-rose-700">{mutationState?.message}</p>
          <button
            type="button"
            onClick={() => onRetryAction(order.id)}
            className="mt-2 text-[10px] font-bold uppercase tracking-wider text-rose-700 hover:underline"
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
  menuItems,
  ordersRealtimeConnected,
  ordersPermissionError,
  orderAlertsEnabled,
  onToggleOrderAlerts,
  pushEnabled = false,
  pushStatus = 'unsupported',
  pushLoading = false,
  onTogglePush,
  onUpdateStatus,
  onUpdatePayment,
  onClearPayment,
  onCancelOrder,
  onRequestModifyOrder,
}: OrderQueueProps) {
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);
  const [mobileSection, setMobileSection] = useState<'pending' | 'payment-pending' | 'completed'>('pending');
  const [pendingRenderLimit, setPendingRenderLimit] = useState(40);
  const [mutationStateByOrder, setMutationStateByOrder] = useState<Record<string, OrderMutationState>>({});
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'customer'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'dine_in' | 'parcel'>('all');

  const menuItemsById = useMemo(
    () => new Map(menuItems.map((item) => [item.id, item.category])),
    [menuItems],
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Source filter
      if (sourceFilter !== 'all') {
        const orderSource = order.source || 'pos';
        if (orderSource !== sourceFilter) return false;
      }
      
      // Delivery type filter
      if (typeFilter !== 'all') {
        const explicitParcelNote = extractParcelNote(order.orderInstructions);
        const itemsSubtotal = getOrderItemsSubtotal(order);
        const inferredParcelNote =
          !explicitParcelNote &&
          order.source === 'customer' &&
          Math.round(order.total - itemsSubtotal) === 5
            ? 'Parcel order (+Rs 5 parcel charge)'
            : null;
        const hasParcel = Boolean(explicitParcelNote ?? inferredParcelNote);
        
        if (typeFilter === 'parcel' && !hasParcel) return false;
        if (typeFilter === 'dine_in' && hasParcel) return false;
      }
      
      return true;
    });
  }, [orders, sourceFilter, typeFilter]);

  const pendingOrders = useMemo(
    () =>
      filteredOrders
        .filter((order) => order.status === 'pending')
        .sort((a, b) => a.timestamp - b.timestamp),
    [filteredOrders],
  );
  const completedOrders = useMemo(
    () =>
      filteredOrders
        .filter((order) => order.status === 'completed')
        .sort((a, b) => b.timestamp - a.timestamp),
    [filteredOrders],
  );
  const paymentPendingOrders = useMemo(
    () => completedOrders.filter((order) => order.paymentStatus !== 'paid'),
    [completedOrders],
  );
  const paidCompletedOrders = useMemo(
    () => completedOrders.filter((order) => order.paymentStatus === 'paid'),
    [completedOrders],
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

  const handleUpdatePayment = (id: string, method: 'cash' | 'upi', note?: string) =>
    runOrderAction(
      id,
      'payment',
      { kind: 'payment', method, note },
      () => Promise.resolve(onUpdatePayment(id, method, note)),
    );

  const handleClearPayment = (id: string, updatedTotal?: number) =>
    runOrderAction(id, 'clear', { kind: 'clear', updatedTotal }, () => Promise.resolve(onClearPayment(id, updatedTotal)));

  const handleCancelOrder = (id: string, reason?: string) =>
    runOrderAction(id, 'cancel', { kind: 'cancel', reason }, () => Promise.resolve(onCancelOrder(id, reason)));

  const handleRetryAction = (orderId: string) => {
    const retry = mutationStateByOrder[orderId]?.retry;
    if (!retry) return;
    if (retry.kind === 'status') {
      void handleUpdateStatus(orderId, retry.nextStatus);
      return;
    }
    if (retry.kind === 'payment') {
      void handleUpdatePayment(orderId, retry.method, retry.note);
      return;
    }
    if (retry.kind === 'cancel') {
      void handleCancelOrder(orderId, retry.reason);
      return;
    }
    void handleClearPayment(orderId, retry.updatedTotal);
  };

  return (
    <div className="mobile-bottom-offset md:pb-0">
      <div className="mb-4 flex items-center justify-between gap-2 flex-nowrap">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${ordersRealtimeConnected
            ? 'bg-secondary-container text-on-secondary-container border-transparent'
            : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${ordersRealtimeConnected ? 'bg-secondary' : 'bg-amber-500 animate-pulse'
              }`}
          />
          <span className="truncate">
            {ordersRealtimeConnected ? 'Live Connection' : 'Reconnecting'}
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {/* In-app chime toggle */}
          <button
            type="button"
            onClick={() => onToggleOrderAlerts(!orderAlertsEnabled)}
            aria-pressed={orderAlertsEnabled}
            title={orderAlertsEnabled ? 'Disable order alerts' : 'Enable order alerts'}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 ${orderAlertsEnabled
              ? 'bg-secondary-container text-on-secondary-container border-transparent'
              : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
              }`}
          >
            <span className="hidden sm:inline">Order Alerts</span>
            <span
              className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${orderAlertsEnabled ? 'bg-secondary' : 'bg-outline-variant/60'
                }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${orderAlertsEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
              />
            </span>
            <span className="text-[9px]">{orderAlertsEnabled ? 'On' : 'Off'}</span>
          </button>

          {/* Push notification toggle — only shown when the browser supports it */}
          {pushStatus !== 'unsupported' && onTogglePush && (
            <button
              type="button"
              onClick={() => {
                if (!pushLoading) onTogglePush(!pushEnabled);
              }}
              aria-pressed={pushEnabled}
              disabled={pushLoading || pushStatus === 'denied'}
              title={
                pushStatus === 'denied'
                  ? 'Notifications blocked in browser settings'
                  : pushEnabled
                  ? 'Disable mobile push notifications'
                  : 'Enable mobile push notifications'
              }
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${pushEnabled
                ? 'bg-secondary-container text-on-secondary-container border-transparent'
                : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
                }`}
            >
              {pushLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Smartphone className="w-3 h-3 shrink-0" />
              )}
              <span className="hidden sm:inline">Push</span>
              <span
                className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${pushEnabled ? 'bg-secondary' : 'bg-outline-variant/60'
                  }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${pushEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                />
              </span>
              <span className="text-[9px]">
                {pushStatus === 'denied' ? 'Off' : pushEnabled ? 'On' : 'Off'}
              </span>
            </button>
          )}
        </div>
      </div>
      {ordersPermissionError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {ordersPermissionError}
        </div>
      )}

      {/* Desktop & Mobile Filter Bar */}
      <div className="mb-6 bg-surface-container-lowest p-3 sm:p-4 rounded-xl border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-on-surface-variant/70" />
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-headline">Filter Orders</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* Order Source Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant/80 font-bold uppercase tracking-wider text-[10px]">Source:</span>
            <div className="flex rounded-lg border border-outline-variant overflow-hidden bg-surface">
              {(['all', 'pos', 'customer'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                    sourceFilter === src
                      ? 'bg-secondary text-on-secondary'
                      : 'hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {src === 'all' ? 'All' : src === 'pos' ? 'POS' : 'QR / Web'}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Mode Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant/80 font-bold uppercase tracking-wider text-[10px]">Type:</span>
            <div className="flex rounded-lg border border-outline-variant overflow-hidden bg-surface">
              {(['all', 'dine_in', 'parcel'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                    typeFilter === t
                      ? 'bg-secondary text-on-secondary'
                      : 'hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {t === 'all' ? 'All' : t === 'dine_in' ? 'Dine In' : 'Parcel'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chip filters carousel on mobile */}
      <div className="md:hidden flex overflow-x-auto gap-2 mb-6 no-scrollbar pb-1">
        <button
          onClick={() => setMobileSection('pending')}
          className={`h-[36px] px-4 rounded-full font-label-md text-xs whitespace-nowrap active:scale-95 transition-transform font-bold border ${
            mobileSection === 'pending'
              ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low'
          }`}
        >
          Preparing ({pendingOrders.length})
        </button>
        <button
          onClick={() => setMobileSection('payment-pending')}
          className={`h-[36px] px-4 rounded-full font-label-md text-xs whitespace-nowrap active:scale-95 transition-transform font-bold border ${
            mobileSection === 'payment-pending'
              ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low'
          }`}
        >
          Payment Due ({paymentPendingOrders.length})
        </button>
        <button
          onClick={() => setMobileSection('completed')}
          className={`h-[36px] px-4 rounded-full font-label-md text-xs whitespace-nowrap active:scale-95 transition-transform font-bold border ${
            mobileSection === 'completed'
              ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low'
          }`}
        >
          Completed ({paidCompletedOrders.length})
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6 h-full items-start">
        {/* Pending Orders */}
        <div className={`flex-1 ${mobileSection === 'pending' ? 'block' : 'hidden'} md:block`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-on-surface flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></span>
              Preparing ({pendingOrders.length})
            </h2>
          </div>
          <div className="space-y-4">
            {pendingOrders.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant/70 bg-surface-container-lowest rounded-2xl border-2 border-dashed border-outline-variant">
                <IceCubeIcon className="w-12 h-12 text-secondary opacity-35 mx-auto mb-2" />
                <p className="font-medium">No pending orders. Time to relax!</p>
              </div>
            ) : (
              visiblePendingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  menuItemsById={menuItemsById}
                  isPending={true}
                  settlingOrderId={settlingOrderId}
                  setSettlingOrderId={setSettlingOrderId}
                  mutationState={mutationStateByOrder[order.id]}
                  onRetryAction={handleRetryAction}
                  onCancelOrder={handleCancelOrder}
                  onRequestModifyOrder={onRequestModifyOrder}
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
              className="mt-4 w-full min-h-11 rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high font-semibold text-sm"
            >
              Load More Orders ({pendingOrders.length - visiblePendingOrders.length} remaining)
            </button>
          )}
        </div>

        {/* Payment Pending Orders (Mobile) */}
        <div className={`md:hidden ${mobileSection === 'payment-pending' ? 'block' : 'hidden'}`}>
          <h2 className="text-xl sm:text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            Payment Pending ({paymentPendingOrders.length})
          </h2>
          <div className="space-y-4">
            {paymentPendingOrders.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant/70 bg-surface-container-lowest rounded-2xl border-2 border-dashed border-outline-variant">
                <p className="font-medium">No unpaid completed orders.</p>
              </div>
            ) : (
              paymentPendingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  menuItemsById={menuItemsById}
                  isPending={false}
                  settlingOrderId={settlingOrderId}
                  setSettlingOrderId={setSettlingOrderId}
                  mutationState={mutationStateByOrder[order.id]}
                  onRetryAction={handleRetryAction}
                  onCancelOrder={handleCancelOrder}
                  onRequestModifyOrder={onRequestModifyOrder}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdatePayment={handleUpdatePayment}
                  onClearPayment={handleClearPayment}
                />
              ))
            )}
          </div>
        </div>

        {/* Completed Orders (Mobile) */}
        <div className={`md:hidden ${mobileSection === 'completed' ? 'block' : 'hidden'}`}>
          <h2 className="text-xl sm:text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            Completed ({paidCompletedOrders.length})
          </h2>
          <div className="space-y-4">
            {paidCompletedOrders.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant/70 bg-surface-container-lowest rounded-2xl border-2 border-dashed border-outline-variant">
                <p className="font-medium">No completed orders yet.</p>
              </div>
            ) : (
              paidCompletedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  menuItemsById={menuItemsById}
                  isPending={false}
                  settlingOrderId={settlingOrderId}
                  setSettlingOrderId={setSettlingOrderId}
                  mutationState={mutationStateByOrder[order.id]}
                  onRetryAction={handleRetryAction}
                  onCancelOrder={handleCancelOrder}
                  onRequestModifyOrder={onRequestModifyOrder}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdatePayment={handleUpdatePayment}
                  onClearPayment={handleClearPayment}
                />
              ))
            )}
          </div>
        </div>

        {/* Completed Orders (Desktop) */}
        <div className="hidden flex-1 md:block md:max-w-md">
          <h2 className="text-xl sm:text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            Completed ({completedOrders.length})
          </h2>
          <div className="space-y-4">
            {completedOrders.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant/70 bg-surface-container-lowest rounded-2xl border-2 border-dashed border-outline-variant">
                <p className="font-medium">No completed orders yet.</p>
              </div>
            ) : (
              completedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  menuItemsById={menuItemsById}
                  isPending={false}
                  settlingOrderId={settlingOrderId}
                  setSettlingOrderId={setSettlingOrderId}
                  mutationState={mutationStateByOrder[order.id]}
                  onRetryAction={handleRetryAction}
                  onCancelOrder={handleCancelOrder}
                  onRequestModifyOrder={onRequestModifyOrder}
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
