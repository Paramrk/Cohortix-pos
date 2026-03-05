import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Minus, ShoppingCart, Trash2, ChevronDown, ChevronRight, X, QrCode } from 'lucide-react';
import { MenuItem, CartItem, Order, GolaVariant, PricingRule, OrderCreateResult } from '../types';

interface NewOrderProps {
  menuItems: MenuItem[];
  onPlaceOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>) => Promise<OrderCreateResult | null>;
  pricingRule: PricingRule;
  orderPending: boolean;
  orderError: string | null;
  onClearOrderError: () => void;
}

const GOLA_VARIANTS: GolaVariant[] = ['Ice Cream Only', 'Dry Fruit Only', 'Ice Cream + Dry Fruit', 'Plain'];

const GOLA_VARIANT_COLORS: Record<GolaVariant, string> = {
  'Ice Cream Only': 'bg-pink-100 text-pink-700',
  'Dry Fruit Only': 'bg-amber-100 text-amber-700',
  'Ice Cream + Dry Fruit': 'bg-purple-100 text-purple-700',
  'Plain': 'bg-slate-100 text-slate-600',
};

function isStickRestrictedCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return normalized === 'special' || normalized === 'pyali';
}

function offerGroupSize(offerType: PricingRule['bogoType']) {
  return offerType === 'b1g1' ? 2 : 3;
}

function offerLabel(offerType: PricingRule['bogoType']) {
  return offerType === 'b1g1' ? 'Buy 1 Get 1' : 'Buy 2 Get 1';
}

function calculateOfferTotals(cart: CartItem[], pricingRule: PricingRule) {
  const subtotal = cart.reduce((sum, item) => sum + item.calculatedPrice * item.quantity, 0);
  if (!pricingRule.bogoEnabled) {
    return { subtotal, subtotalAfterOffer: subtotal, offerSavings: 0, freeUnits: 0 };
  }

  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  const freeUnits = Math.floor(totalUnits / offerGroupSize(pricingRule.bogoType));
  if (freeUnits <= 0) {
    return { subtotal, subtotalAfterOffer: subtotal, offerSavings: 0, freeUnits: 0 };
  }

  const unitBuckets = new Map<number, number>();
  for (const item of cart) {
    const existing = unitBuckets.get(item.calculatedPrice) ?? 0;
    unitBuckets.set(item.calculatedPrice, existing + item.quantity);
  }

  let remainingFree = freeUnits;
  let offerSavings = 0;
  const pricesAscending = Array.from(unitBuckets.keys()).sort((a, b) => a - b);
  for (const unitPrice of pricesAscending) {
    if (remainingFree <= 0) break;
    const availableQty = unitBuckets.get(unitPrice) ?? 0;
    if (availableQty <= 0) continue;
    const takeQty = Math.min(availableQty, remainingFree);
    offerSavings += unitPrice * takeQty;
    remainingFree -= takeQty;
  }

  return {
    subtotal,
    subtotalAfterOffer: Math.max(0, subtotal - offerSavings),
    offerSavings,
    freeUnits,
  };
}

interface QtyControlProps {
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

function QuantityControl({ quantity, onAdd, onRemove }: QtyControlProps) {
  return (
    <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm">
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        className="h-11 w-11 flex items-center justify-center text-slate-600 rounded-l-lg active:bg-slate-100 touch-manipulation"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-9 text-center text-base font-bold text-slate-800">{quantity}</span>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(); }}
        className="h-11 w-11 flex items-center justify-center text-slate-600 rounded-r-lg active:bg-slate-100 touch-manipulation"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

export function NewOrder({ menuItems, onPlaceOrder, pricingRule, orderPending, orderError, onClearOrderError }: NewOrderProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderInstructions, setOrderInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'pay_later'>('cash');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [showMobileCart, setShowMobileCart] = useState(false);

  useEffect(() => {
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const prevBodyOverflow = bodyStyle.overflow;
    const prevHtmlOverflow = htmlStyle.overflow;

    if (showMobileCart) {
      bodyStyle.overflow = 'hidden';
      htmlStyle.overflow = 'hidden';
    }

    return () => {
      bodyStyle.overflow = prevBodyOverflow;
      htmlStyle.overflow = prevHtmlOverflow;
    };
  }, [showMobileCart]);

  const discountUnitPrice = (price: number) => {
    if (pricingRule.discountPercent <= 0) return price;
    return Math.max(0, Math.round(price * (100 - pricingRule.discountPercent) / 100));
  };

  const quantityByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(`${item.id}::${item.variant ?? 'default'}`, item.quantity);
    }
    return map;
  }, [cart]);

  const getCartQuantity = (itemId: string, variant?: string) => {
    return quantityByVariant.get(`${itemId}::${variant ?? 'default'}`) ?? 0;
  };

  const handleAdd = useCallback((item: MenuItem, variant?: string) => {
    onClearOrderError();
    setCart((prev) => {
      const safeVariant = variant === 'Stick' && isStickRestrictedCategory(item.category) ? 'Dish' : variant;
      const existing = prev.find((i) => i.id === item.id && i.variant === safeVariant);
      if (existing) {
        return prev.map((i) =>
          i.cartItemId === existing.cartItemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      let calculatedPrice = item.price;
      if (safeVariant === 'Dish' && item.dishPrice) {
        calculatedPrice = item.dishPrice;
      } else if (item.hasGolaVariants && item.golaVariantPrices && safeVariant) {
        calculatedPrice = item.golaVariantPrices[safeVariant as GolaVariant] ?? item.price;
      }
      return [
        ...prev,
        { ...item, cartItemId: crypto.randomUUID(), quantity: 1, variant: safeVariant as any, calculatedPrice },
      ];
    });
  }, [onClearOrderError]);

  const handleRemove = useCallback((item: MenuItem, variant?: string) => {
    onClearOrderError();
    setCart((prev) => {
      const safeVariant = variant === 'Stick' && isStickRestrictedCategory(item.category) ? 'Dish' : variant;
      const existing = prev.find((i) => i.id === item.id && i.variant === safeVariant);
      if (!existing) return prev;
      if (existing.quantity === 1) {
        return prev.filter((i) => i.cartItemId !== existing.cartItemId);
      }
      return prev.map((i) =>
        i.cartItemId === existing.cartItemId ? { ...i, quantity: i.quantity - 1 } : i
      );
    });
  }, [onClearOrderError]);

  const removeFromCart = useCallback((cartItemId: string) => {
    onClearOrderError();
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  }, [onClearOrderError]);

  const updateQuantity = useCallback((cartItemId: string, delta: number) => {
    onClearOrderError();
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartItemId === cartItemId) {
          const newQuantity = i.quantity + delta;
          if (newQuantity < 1) return i;
          return { ...i, quantity: newQuantity };
        }
        return i;
      })
    );
  }, [onClearOrderError]);

  const activeOfferLabel = offerLabel(pricingRule.bogoType);
  const { subtotal, subtotalAfterOffer, offerSavings, freeUnits } = calculateOfferTotals(cart, pricingRule);
  const percentDiscountAmount = Math.round((subtotalAfterOffer * pricingRule.discountPercent) / 100);
  const total = Math.max(0, subtotalAfterOffer - percentDiscountAmount);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0 || orderPending) return;
    const result = await onPlaceOrder({
      customerName: customerName.trim() || 'Guest',
      orderInstructions: orderInstructions.trim() || undefined,
      items: cart,
      total,
      status: 'pending',
      paymentMethod,
      paymentStatus: paymentMethod === 'pay_later' ? 'unpaid' : 'paid',
    });
    if (!result) return;
    setCart([]);
    setCustomerName('');
    setOrderInstructions('');
    setPaymentMethod('cash');
    setShowMobileCart(false);
  };

  const categories = useMemo(() => Array.from(new Set(menuItems.map((i) => i.category))), [menuItems]);
  const categoryItemsMap = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const category of categories) {
      map.set(category, menuItems.filter((item) => item.category === category));
    }
    return map;
  }, [categories, menuItems]);

  const cartItemNames = Array.from(new Set(cart.map((i) => i.name)));
  const summaryText =
    cartItemNames.length <= 2
      ? cartItemNames.join(', ')
      : `${cartItemNames.slice(0, 2).join(', ')} +${cartItemNames.length - 2} more`;

  const CartContent = ({ showHeader = true }: { showHeader?: boolean } = {}) => (
    <>
      {showHeader && (
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            Current Order
          </h2>
          <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded-full">
            {totalItems} items
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 py-12">
            <ShoppingCart className="w-12 h-12 opacity-20" />
            <p>Cart is empty</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.cartItemId} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="flex-1">
                <div className="font-medium text-slate-800 flex items-center gap-2 flex-wrap">
                  {item.name}
                  {item.variant && (
                    <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                      {item.variant}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 mt-0.5">
                  ₹{discountUnitPrice(item.calculatedPrice)} × {item.quantity}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); updateQuantity(item.cartItemId, -1); }}
                    className="h-10 w-10 flex items-center justify-center text-slate-600 rounded-l-lg active:bg-slate-100 touch-manipulation"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); updateQuantity(item.cartItemId, 1); }}
                    className="h-10 w-10 flex items-center justify-center text-slate-600 rounded-r-lg active:bg-slate-100 touch-manipulation"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); removeFromCart(item.cartItemId); }}
                  className="h-10 w-10 flex items-center justify-center text-red-500 active:bg-red-50 rounded-lg touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={`p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0 ${showHeader ? '' : 'sticky bottom-0 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]'}`}>
        {(pricingRule.bogoEnabled || pricingRule.discountPercent > 0) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pricingRule.bogoEnabled && (
              <span className="text-[11px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">
                {activeOfferLabel} Active
              </span>
            )}
            {pricingRule.discountPercent > 0 && (
              <span className="text-[11px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">
                {pricingRule.discountPercent}% OFF Active
              </span>
            )}
          </div>
        )}

        <div className="mb-3">
          <input
            type="text"
            placeholder="Customer Name (Optional)"
            value={customerName}
            onChange={(e) => {
              onClearOrderError();
              setCustomerName(e.target.value);
            }}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
          />
        </div>
        <div className="mb-3">
          <textarea
            placeholder="Custom Instructions (Optional) - e.g. less syrup, no dry fruit"
            value={orderInstructions}
            onChange={(e) => {
              onClearOrderError();
              setOrderInstructions(e.target.value);
            }}
            rows={2}
            maxLength={220}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white resize-none"
          />
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              onClearOrderError();
              setPaymentMethod('cash');
            }}
            className={`flex-1 min-h-11 py-2.5 rounded-xl text-sm font-bold transition-colors touch-manipulation ${paymentMethod === 'cash'
              ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-500'
              : 'bg-white text-slate-600 border-2 border-slate-200 hover:bg-slate-50'
              }`}
          >
            💵 Cash
          </button>
          <button
            type="button"
            onClick={() => {
              onClearOrderError();
              setPaymentMethod('upi');
            }}
            className={`flex-1 min-h-11 py-2.5 rounded-xl text-sm font-bold transition-colors touch-manipulation ${paymentMethod === 'upi'
              ? 'bg-blue-100 text-blue-800 border-2 border-blue-500'
              : 'bg-white text-slate-600 border-2 border-slate-200 hover:bg-slate-50'
              }`}
          >
            📱 UPI
          </button>
          <button
            type="button"
            onClick={() => {
              onClearOrderError();
              setPaymentMethod('pay_later');
            }}
            className={`flex-1 min-h-11 py-2.5 rounded-xl text-sm font-bold transition-colors touch-manipulation ${paymentMethod === 'pay_later'
              ? 'bg-orange-100 text-orange-800 border-2 border-orange-500'
              : 'bg-white text-slate-600 border-2 border-slate-200 hover:bg-slate-50'
              }`}
          >
            🕒 Later
          </button>
        </div>

        {paymentMethod === 'upi' && (
          <div className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl mb-4 shadow-sm">
            <img src="/qr.png" al="UPI QR" className="w-56 h-56 text-slate-800 mb-2" />
            <p className="text-sm text-slate-500 font-medium">Scan QR to pay ₹{total}</p>
          </div>
        )}

        <div className="mb-4 px-1 space-y-1.5">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Subtotal</span>
            <span>₹{subtotal}</span>
          </div>
          {pricingRule.bogoEnabled && (
            <div className="flex justify-between text-sm text-emerald-700 font-semibold">
              <span>{activeOfferLabel} Savings</span>
              <span>-₹{offerSavings}</span>
            </div>
          )}
          {pricingRule.bogoEnabled && freeUnits > 0 && (
            <div className="flex justify-between text-xs text-emerald-700/80 font-semibold">
              <span>Free Items</span>
              <span>{freeUnits}</span>
            </div>
          )}
          {pricingRule.discountPercent > 0 && (
            <div className="flex justify-between text-sm text-indigo-700 font-semibold">
              <span>{pricingRule.discountPercent}% Discount</span>
              <span>-₹{percentDiscountAmount}</span>
            </div>
          )}
          <div className="flex justify-between items-end pt-1">
            <span className="text-slate-600 font-semibold">Total Amount</span>
            <span className="text-3xl font-bold text-slate-800">₹{total}</span>
          </div>
        </div>

        {orderError && (
          <p className="mb-3 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {orderError}
          </p>
        )}

        <button
          type="button"
          onClick={() => { void handleCheckout(); }}
          disabled={cart.length === 0 || orderPending}
          className="w-full min-h-12 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-bold text-lg transition-all shadow-sm active:scale-[0.98] touch-manipulation"
        >
          {orderPending ? 'Placing Order...' : 'Place Order'}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 relative">
      {/* Menu Section */}
      <div className={`flex-1 ${cart.length > 0 && !showMobileCart ? 'pb-36' : 'pb-4'} md:pb-0`}>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Menu</h2>
          {pricingRule.bogoEnabled && (
            <span className="text-[11px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">
              {activeOfferLabel}
            </span>
          )}
          {pricingRule.discountPercent > 0 && (
            <span className="text-[11px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">
              {pricingRule.discountPercent}% Off
            </span>
          )}
        </div>
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-lg font-bold text-slate-400 mb-4 uppercase tracking-wider">
                {category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(categoryItemsMap.get(category) ?? []).map((item) => {
                  const isExpanded = expandedItemId === item.id;

                  // ---- Gola variants (4 options) ----
                  if (item.hasGolaVariants) {
                    const totalQty = GOLA_VARIANTS.reduce((s, v) => s + getCartQuantity(item.id, v), 0);
                    return (
                      <div key={item.id} className={`bg-white rounded-xl shadow-sm border transition-all col-span-1 sm:col-span-2 lg:col-span-3 ${isExpanded ? 'border-indigo-300 ring-1 ring-indigo-300' : 'border-slate-200 hover:border-indigo-200'}`}>
                        <div
                          className="p-4 flex justify-between items-center cursor-pointer"
                          onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                        >
                          <div>
                            <div className="font-bold text-slate-800">{item.name}</div>
                            <div className="text-slate-500 text-xs font-medium mt-0.5 leading-tight break-words pr-2">
                              {GOLA_VARIANTS.map(v => `${v}: ₹${discountUnitPrice(item.golaVariantPrices?.[v] ?? item.price)}`).join(' · ')}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {totalQty > 0 && (
                              <div className="bg-indigo-600 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
                                {totalQty}
                              </div>
                            )}
                            <div className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-indigo-600' : ''}`}>
                              <ChevronDown className="w-5 h-5" />
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="bg-slate-50/80 p-4 border-t border-slate-100 space-y-3 rounded-b-xl">
                            {GOLA_VARIANTS.map((v) => {
                              const qty = getCartQuantity(item.id, v);
                              const price = item.golaVariantPrices?.[v] ?? item.price;
                              return (
                                <div key={v} className="flex justify-between items-center">
                                  <div>
                                    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded mb-0.5 ${GOLA_VARIANT_COLORS[v]}`}>{v}</span>
                                    <span className="block text-xs font-medium text-slate-500">₹{discountUnitPrice(price)}</span>
                                  </div>
                                  <QuantityControl
                                    quantity={qty}
                                    onAdd={() => handleAdd(item, v)}
                                    onRemove={() => handleRemove(item, v)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ---- Stick / Dish variants ----
                  if (item.hasVariants) {
                    const stickAllowed = !isStickRestrictedCategory(item.category);
                    const stickQty = getCartQuantity(item.id, 'Stick');
                    const dishQty = getCartQuantity(item.id, 'Dish');
                    const totalQty = stickAllowed ? stickQty + dishQty : dishQty;
                    const dishOnlyPrice = item.dishPrice ?? item.price;

                    return (
                      <div key={item.id} className={`bg-white rounded-xl shadow-sm border transition-all ${isExpanded ? 'border-indigo-300 ring-1 ring-indigo-300' : 'border-slate-200 hover:border-indigo-200'}`}>
                        <div
                          className="p-4 flex justify-between items-center cursor-pointer"
                          onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                        >
                          <div>
                            <div className="font-bold text-slate-800">{item.name}</div>
                            <div className="text-slate-500 text-sm font-medium mt-0.5">
                              {stickAllowed
                                ? `₹${discountUnitPrice(item.price)} - ₹${item.dishPrice ? discountUnitPrice(item.dishPrice) : '—'}`
                                : `₹${discountUnitPrice(dishOnlyPrice)}`}
                            </div>
                          </div>
                          {totalQty > 0 && !isExpanded ? (
                            <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
                              {totalQty}
                            </div>
                          ) : (
                            <div className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-indigo-600' : ''}`}>
                              <ChevronDown className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="bg-slate-50/80 p-4 border-t border-slate-100 space-y-4 rounded-b-xl">
                            {stickAllowed && (
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="block text-sm font-bold text-slate-700">Stick</span>
                                  <span className="text-xs font-medium text-slate-500">₹{discountUnitPrice(item.price)}</span>
                                </div>
                                <QuantityControl
                                  quantity={stickQty}
                                  onAdd={() => handleAdd(item, 'Stick')}
                                  onRemove={() => handleRemove(item, 'Stick')}
                                />
                              </div>
                            )}
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="block text-sm font-bold text-slate-700">Dish</span>
                                <span className="text-xs font-medium text-slate-500">
                                  ₹{discountUnitPrice(dishOnlyPrice)}
                                </span>
                              </div>
                              <QuantityControl
                                quantity={dishQty}
                                onAdd={() => handleAdd(item, 'Dish')}
                                onRemove={() => handleRemove(item, 'Dish')}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ---- Simple item ----
                  const qty = getCartQuantity(item.id);
                  return (
                    <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center hover:border-indigo-200 transition-colors">
                      <div>
                        <div className="font-bold text-slate-800">{item.name}</div>
                        <div className="text-slate-500 text-sm font-medium mt-0.5">₹{discountUnitPrice(item.price)}</div>
                      </div>
                      <div>
                        {qty === 0 ? (
                          <button
                            type="button"
                            onPointerDown={(e) => { e.preventDefault(); handleAdd(item); }}
                            className="px-5 min-h-11 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 active:scale-95 transition-transform touch-manipulation"
                          >
                            ADD
                          </button>
                        ) : (
                          <QuantityControl
                            quantity={qty}
                            onAdd={() => handleAdd(item)}
                            onRemove={() => handleRemove(item)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Section (Desktop) */}
      <div className="hidden md:flex w-96 bg-white rounded-2xl shadow-sm border border-slate-200 flex-col h-[calc(100vh-8rem)] sticky top-4">
        <CartContent />
      </div>

      {/* Mobile Bottom Cart Bar */}
      {cart.length > 0 && !showMobileCart && (
        <div className="md:hidden fixed left-0 right-0 p-4 mobile-floating-offset z-40">
          <div
            className="bg-indigo-600 rounded-2xl shadow-xl p-4 flex justify-between items-center cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => setShowMobileCart(true)}
          >
            <div className="text-white">
              <div className="font-bold text-lg">{totalItems} item{totalItems > 1 ? 's' : ''}</div>
              <div className="text-indigo-100 text-sm font-medium truncate max-w-[55vw] sm:max-w-[280px]">{summaryText}</div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-white font-bold text-lg">₹{total}</div>
              <div className="flex items-center gap-1 text-indigo-100 text-xs font-bold mt-0.5">
                View Cart <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Cart Modal */}
      {showMobileCart && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px]"
          onClick={() => setShowMobileCart(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl max-h-[92vh] min-h-[65vh] flex flex-col pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-2 pb-1 flex justify-center">
              <div className="h-1.5 w-12 rounded-full bg-slate-300" />
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-white border-b border-slate-200 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">Your Order</h2>
              <button
                type="button"
                onClick={() => setShowMobileCart(false)}
                className="h-10 w-10 flex items-center justify-center bg-slate-100 text-slate-600 rounded-full active:scale-95 transition-transform touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <CartContent showHeader={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
