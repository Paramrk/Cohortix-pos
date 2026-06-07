import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Plus, Minus, ShoppingCart, Trash2, ChevronDown, ChevronRight, X, QrCode, Search, Sparkles, CupSoda, Layers, Flame, Banknote, Smartphone, Clock, Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  CartItem,
  GolaVariant,
  MenuItem,
  Order,
  OrderCreateResult,
  PricingRule,
  UpdateOrderDetailsInput,
} from '../types';
import { isStickRestrictedCategory } from '../utils/category';

interface NewOrderProps {
  menuItems: MenuItem[];
  onPlaceOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>) => Promise<OrderCreateResult | null>;
  editingOrder?: Order | null;
  onUpdateOrder?: (id: string, payload: UpdateOrderDetailsInput) => Promise<void>;
  onExitEditMode?: () => void;
  pricingRule: PricingRule;
  orderPending: boolean;
  orderError: string | null;
  onClearOrderError: () => void;
}

interface PosDraftOrderV1 {
  version: 1;
  cart: CartItem[];
  customerName: string;
  orderInstructions: string;
  paymentMethod: 'cash' | 'upi' | 'pay_later';
}

const GOLA_VARIANTS: GolaVariant[] = ['Ice Cream Only', 'Dry Fruit Only', 'Ice Cream + Dry Fruit', 'Plain', 'Stick'];
const POS_DRAFT_STORAGE_KEY = 'pos_draft_order_v1';

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const GOLA_VARIANT_COLORS: Record<GolaVariant, string> = {
  'Ice Cream Only': 'bg-pink-100 text-pink-700',
  'Dry Fruit Only': 'bg-amber-100 text-amber-700',
  'Ice Cream + Dry Fruit': 'bg-purple-100 text-purple-700',
  'Plain': 'bg-surface-container text-on-surface',
  'Stick': 'bg-teal-100 text-teal-700',
};

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

export function CategoryIcon({ category, className = "w-5 h-5" }: { category: string; className?: string }) {
  const norm = (category || '').toLowerCase();
  if (norm.includes('premium') || norm.includes('special dish')) {
    return <Sparkles className={`${className} text-purple-500`} />;
  }
  if (norm.includes('special')) {
    return <Flame className={`${className} text-orange-500`} />;
  }
  if (norm.includes('pyali') || norm.includes('pyaali')) {
    return <CupSoda className={`${className} text-pink-500`} />;
  }
  return <Layers className={`${className} text-blue-500`} />;
}

interface QtyControlProps {
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

function QuantityControl({ quantity, onAdd, onRemove }: QtyControlProps) {
  return (
    <div className="flex items-center gap-2 bg-surface-container rounded-full px-1 py-1 border border-outline-variant">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-7 h-7 rounded-full text-on-surface-variant flex items-center justify-center hover:bg-surface-container-highest active:scale-90 transition-transform touch-manipulation"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="w-6 text-center text-xs font-bold text-primary font-mono">{quantity}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className="w-7 h-7 rounded-full text-on-surface-variant flex items-center justify-center hover:bg-surface-container-highest active:scale-90 transition-transform touch-manipulation"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface CartContentProps {
  showHeader?: boolean;
  cart: CartItem[];
  totalItems: number;
  customerName: string;
  orderInstructions: string;
  paymentMethod: 'cash' | 'upi' | 'pay_later';
  pricingRule: PricingRule;
  activeOfferLabel: string;
  subtotal: number;
  offerSavings: number;
  freeUnits: number;
  percentDiscountAmount: number;
  total: number;
  isEditing: boolean;
  editError: string | null;
  orderError: string | null;
  orderPending: boolean;
  updatePending: boolean;
  editingOrderNumber?: number;
  discountUnitPrice: (price: number) => number;
  updateQuantity: (cartItemId: string, delta: number) => void;
  removeFromCart: (cartItemId: string) => void;
  onCustomerNameChange: (value: string) => void;
  onOrderInstructionsChange: (value: string) => void;
  onPaymentMethodChange: (method: 'cash' | 'upi' | 'pay_later') => void;
  onCheckout: () => void;
}

function CartContent({
  showHeader = true,
  cart,
  totalItems,
  customerName,
  orderInstructions,
  paymentMethod,
  pricingRule,
  activeOfferLabel,
  subtotal,
  offerSavings,
  freeUnits,
  percentDiscountAmount,
  total,
  isEditing,
  editError,
  orderError,
  orderPending,
  updatePending,
  editingOrderNumber,
  discountUnitPrice,
  updateQuantity,
  removeFromCart,
  onCustomerNameChange,
  onOrderInstructionsChange,
  onPaymentMethodChange,
  onCheckout,
}: CartContentProps) {
  return (
    <>
      {showHeader && (
        <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-2xl shrink-0">
          <h2 className="text-base font-bold text-primary flex items-center gap-2 font-headline">
            <ShoppingCart className="w-5 h-5 text-secondary" />
            Current Order
          </h2>
          <span className="bg-secondary text-on-secondary text-xs font-bold px-2 py-0.5 rounded-full font-mono">
            {totalItems} items
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-0 border border-outline-variant rounded-xl bg-surface-container-lowest m-4">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-on-surface-variant/60 space-y-2 py-12">
            <ShoppingCart className="w-12 h-12 opacity-20 text-secondary" />
            <p className="font-medium text-sm">Cart is empty</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.cartItemId} className="flex items-center justify-between p-3 border-b border-outline-variant last:border-0 bg-surface-container-lowest">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                  <CategoryIcon category={item.category} className="w-5 h-5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-body-md text-sm font-semibold text-on-surface truncate pr-1">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider mt-0.5">
                    {item.variant ?? 'Standard'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end ml-2 shrink-0">
                <span className="font-headline text-sm font-bold text-primary">₹{discountUnitPrice(item.calculatedPrice) * item.quantity}</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex items-center border border-outline-variant rounded-lg h-[30px] bg-surface-container-lowest">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartItemId, -1)}
                      className="w-[30px] h-full flex items-center justify-center text-on-surface-variant active:bg-surface-container-highest rounded-l-lg transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-[24px] text-center font-mono text-xs font-bold text-on-surface">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartItemId, 1)}
                      className="w-[30px] h-full flex items-center justify-center text-on-surface-variant active:bg-surface-container-highest rounded-r-lg transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.cartItemId)}
                    className="h-[30px] w-[30px] flex items-center justify-center text-rose-500 active:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={`p-4 border-t border-outline-variant bg-surface-container-lowest shrink-0 ${showHeader ? '' : 'sticky bottom-0 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]'}`}>
        {(pricingRule.bogoEnabled || pricingRule.discountPercent > 0) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pricingRule.bogoEnabled && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full">
                {activeOfferLabel} Active
              </span>
            )}
            {pricingRule.discountPercent > 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-surface-variant text-on-surface px-2 py-0.5 rounded-full border border-outline-variant">
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
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="w-full h-11 px-3 border border-outline-variant rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/60"
          />
        </div>
        <div className="mb-3">
          <textarea
            placeholder="Custom Instructions (Optional) - e.g. less syrup, no dry fruit"
            value={orderInstructions}
            onChange={(e) => onOrderInstructionsChange(e.target.value)}
            rows={2}
            maxLength={220}
            className="w-full px-3 py-2 border border-outline-variant rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/60 resize-none"
          />
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => onPaymentMethodChange('cash')}
            className={`flex-1 flex flex-col items-center justify-center p-2 rounded-xl border-2 h-[80px] relative transition-transform active:scale-95 ${
              paymentMethod === 'cash'
                ? 'border-secondary bg-surface-container-lowest text-secondary font-bold shadow-sm'
                : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <Banknote className="w-5.5 h-5.5 mb-1.5" />
            <span className="font-label-md text-xs">Cash</span>
            {paymentMethod === 'cash' && (
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-secondary text-on-secondary rounded-full flex items-center justify-center shadow-sm">
                <span className="text-[10px] font-bold">✓</span>
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onPaymentMethodChange('upi')}
            className={`flex-1 flex flex-col items-center justify-center p-2 rounded-xl border-2 h-[80px] relative transition-transform active:scale-95 ${
              paymentMethod === 'upi'
                ? 'border-secondary bg-surface-container-lowest text-secondary font-bold shadow-sm'
                : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <Smartphone className="w-5.5 h-5.5 mb-1.5" />
            <span className="font-label-md text-xs">UPI</span>
            {paymentMethod === 'upi' && (
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-secondary text-on-secondary rounded-full flex items-center justify-center shadow-sm">
                <span className="text-[10px] font-bold">✓</span>
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onPaymentMethodChange('pay_later')}
            className={`flex-1 flex flex-col items-center justify-center p-2 rounded-xl border-2 h-[80px] relative transition-transform active:scale-95 ${
              paymentMethod === 'pay_later'
                ? 'border-secondary bg-surface-container-lowest text-secondary font-bold shadow-sm'
                : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <Clock className="w-5.5 h-5.5 mb-1.5" />
            <span className="font-label-md text-xs">Later</span>
            {paymentMethod === 'pay_later' && (
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-secondary text-on-secondary rounded-full flex items-center justify-center shadow-sm">
                <span className="text-[10px] font-bold">✓</span>
              </div>
            )}
          </button>
        </div>

        {paymentMethod === 'upi' && (
          <div className="flex flex-col items-center justify-center p-4 bg-surface border border-outline-variant rounded-xl mb-4 shadow-sm">
            <p className="text-sm text-on-surface-variant font-medium">Scan QR to pay ₹{total}</p>
          </div>
        )}

        <div className="mb-4 px-1 space-y-1.5">
          <div className="flex justify-between text-sm text-on-surface-variant">
            <span>Subtotal</span>
            <span className="font-mono">₹{subtotal}</span>
          </div>
          {pricingRule.bogoEnabled && (
            <div className="flex justify-between text-sm text-emerald-700 font-semibold">
              <span>{activeOfferLabel} Savings</span>
              <span className="font-mono">-₹{offerSavings}</span>
            </div>
          )}
          {pricingRule.bogoEnabled && freeUnits > 0 && (
            <div className="flex justify-between text-xs text-emerald-700/80 font-semibold">
              <span>Free Items</span>
              <span className="font-mono">{freeUnits}</span>
            </div>
          )}
          {pricingRule.discountPercent > 0 && (
            <div className="flex justify-between text-sm text-secondary font-semibold">
              <span>{pricingRule.discountPercent}% Discount</span>
              <span className="font-mono">-₹{percentDiscountAmount}</span>
            </div>
          )}
          <div className="flex justify-between items-end pt-1">
            <span className="text-on-surface-variant font-semibold">Total Amount</span>
            <span className="text-3xl font-bold text-on-surface font-headline">₹{total}</span>
          </div>
        </div>

        {(isEditing ? editError : orderError) && (
          <p className="mb-3 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {isEditing ? editError : orderError}
          </p>
        )}

        <button
          type="button"
          onClick={onCheckout}
          disabled={cart.length === 0 || orderPending || updatePending}
          className="w-full h-[52px] bg-secondary hover:opacity-90 disabled:bg-surface-container-highest disabled:text-on-surface-variant/30 disabled:cursor-not-allowed text-on-secondary py-3 rounded-xl font-bold text-base uppercase tracking-wider transition-all shadow-sm active:scale-[0.98] btn-checkout flex items-center justify-center gap-2"
        >
          {isEditing
            ? (updatePending ? 'Updating Order...' : `Update Order #${editingOrderNumber ?? ''}`)
            : (orderPending ? 'Placing Order...' : 'Place Order')}
        </button>
      </div>
    </>
  );
}

function toEditableCartItems(items: Order['items']): CartItem[] {
  return items.map((item, index) => {
    const rawItem = item as unknown as Record<string, unknown>;
    const rawVariant = rawItem.variant ?? rawItem.variantName ?? rawItem.variant_name;
    const variant = typeof rawVariant === 'string' ? rawVariant : undefined;
    const calculatedPrice = Number(rawItem.calculatedPrice ?? rawItem.price ?? 0);
    const quantity = Number(rawItem.quantity ?? 1);
    const basePrice = Number(rawItem.price ?? calculatedPrice);
    const itemId = String(rawItem.id ?? `unknown-${index}`);

    return {
      ...item,
      id: itemId,
      name: String(rawItem.name ?? item.name ?? `Item ${index + 1}`),
      category: String(rawItem.category ?? item.category ?? 'Regular'),
      price: Number.isFinite(basePrice) ? basePrice : 0,
      cartItemId:
        typeof rawItem.cartItemId === 'string'
          ? rawItem.cartItemId
          : `${itemId}-${index}-${generateId()}`,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      variant: variant as CartItem['variant'],
      calculatedPrice: Number.isFinite(calculatedPrice) ? calculatedPrice : 0,
    };
  });
}

export function NewOrder({
  menuItems,
  onPlaceOrder,
  editingOrder,
  onUpdateOrder,
  onExitEditMode,
  pricingRule,
  orderPending,
  orderError,
  onClearOrderError,
}: NewOrderProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderInstructions, setOrderInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'pay_later'>('cash');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Voice Assistant State
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const showVoiceAssistantRef = useRef(showVoiceAssistant);
  useEffect(() => {
    showVoiceAssistantRef.current = showVoiceAssistant;
  }, [showVoiceAssistant]);
  const [isListening, setIsListening] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<'en' | 'gu' | 'hi'>(() => {
    try {
      const stored = localStorage.getItem('pos_voice_language');
      if (stored === 'en' || stored === 'gu' || stored === 'hi') {
        return stored;
      }
    } catch {
      // Ignore storage error
    }
    return 'gu';
  });

  const selectLanguage = (lang: 'en' | 'gu' | 'hi') => {
    setVoiceLanguage(lang);
    try {
      localStorage.setItem('pos_voice_language', lang);
    } catch {
      // Ignore storage error
    }
  };
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceReply, setVoiceReply] = useState('');
  const [voiceHistory, setVoiceHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const handleProcessVoiceCommandRef = useRef<(transcript: string) => Promise<void>>(null as any);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = voiceLanguage === 'gu' ? 'gu-IN' : (voiceLanguage === 'hi' ? 'hi-IN' : 'en-IN');

    rec.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
      transcriptRef.current = '';
    };

    rec.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const currentTranscript = finalTranscript || interimTranscript;
      transcriptRef.current = currentTranscript;
      setVoiceTranscript(currentTranscript);
    };

    rec.onerror = (event: any) => {
      console.error('Speech recognition error', event);
      if (event.error !== 'no-speech') {
        setVoiceError(`Speech error: ${event.error}`);
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      const textToProcess = transcriptRef.current.trim();
      if (textToProcess) {
        void handleProcessVoiceCommandRef.current(textToProcess);
      }
    };

    recognitionRef.current = rec;

    return () => {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
    };
  }, [voiceLanguage]);

  const startListening = () => {
    setVoiceTranscript('');
    setVoiceError(null);
    try {
      if (recognitionRef.current) {
        recognitionRef.current.start();
      } else {
        setVoiceError('Speech recognition is not supported in this browser.');
      }
    } catch (err) {
      console.error('Failed to start speech recognition', err);
    }
  };

  const stopListening = () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } catch (err) {
      console.error('Failed to stop speech recognition', err);
    }
  };

  const speakText = (text: string, lang: 'en' | 'gu', onEndCallback?: () => void) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'gu' ? 'gu-IN' : 'en-US';
      const voices = window.speechSynthesis.getVoices();
      const matchVoice = voices.find(v => v.lang.startsWith(lang));
      if (matchVoice) {
        utterance.voice = matchVoice;
      }
      if (onEndCallback) {
        utterance.onend = () => {
          onEndCallback();
        };
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const placeVoiceOrder = async (
    finalCart: CartItem[],
    finalName: string,
    finalInstructions: string,
    finalPayment: 'cash' | 'upi' | 'pay_later'
  ) => {
    if (finalCart.length === 0) return;
    const nextPaymentStatus: 'paid' | 'unpaid' = finalPayment === 'pay_later' ? 'unpaid' : 'paid';
    const { subtotal: s, subtotalAfterOffer: sa } = calculateOfferTotals(finalCart, pricingRule);
    const percentDiscountAmount = Math.round((sa * pricingRule.discountPercent) / 100);
    const finalTotal = Math.max(0, sa - percentDiscountAmount);

    const payload = {
      customerName: finalName.trim() || 'Guest',
      orderInstructions: finalInstructions.trim() || undefined,
      items: finalCart,
      total: finalTotal,
      status: 'pending' as const,
      paymentMethod: finalPayment,
      paymentStatus: nextPaymentStatus,
    };

    if (isEditing && editingOrder) {
      if (!onUpdateOrder) return;
      setUpdatePending(true);
      try {
        await onUpdateOrder(editingOrder.id, {
          customerName: payload.customerName,
          orderInstructions: payload.orderInstructions,
          items: payload.items,
          total: payload.total,
          paymentMethod: payload.paymentMethod,
          paymentStatus: payload.paymentStatus,
        });
        handleExitEditMode();
      } catch (err) {
        setEditError(err instanceof Error ? err.message : 'Failed to update order');
      } finally {
        setUpdatePending(false);
      }
    } else {
      const result = await onPlaceOrder(payload);
      if (result) {
        resetOrderForm();
      }
    }
  };

  const handleProcessVoiceCommand = async (transcript: string) => {
    if (!transcript.trim()) return;
    setVoiceLoading(true);
    setVoiceError(null);

    const userMessage = { role: 'user' as const, content: transcript };
    setVoiceHistory(prev => [...prev, userMessage]);

    try {
      const { data, error } = await supabase.functions.invoke('pos-ai-assistant', {
        body: {
          shopId: 'main',
          language: voiceLanguage === 'gu' ? 'gu' : 'en',
          customerName: customerName,
          paymentMethod: paymentMethod,
          message: transcript,
          cart: cart.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            variant: item.variant,
            calculatedPrice: item.calculatedPrice
          })),
          conversation: voiceHistory
        }
      });

      if (error) throw error;

      if (data) {
        const { reply, intent, paymentMethod: nextPayment, customerName: nextName, orderInstructions: nextInstructions, orderDraft } = data;

        setVoiceReply(reply);
        setVoiceHistory(prev => [...prev, { role: 'assistant', content: reply }]);

        if (ttsEnabled) {
          speakText(reply, voiceLanguage === 'gu' ? 'gu' : 'en', () => {
            if (intent !== 'order_confirm' && showVoiceAssistantRef.current) {
              startListening();
            }
          });
        } else {
          if (intent !== 'order_confirm' && showVoiceAssistantRef.current) {
            setTimeout(() => {
              if (showVoiceAssistantRef.current) {
                startListening();
              }
            }, 800);
          }
        }

        if (nextPayment && nextPayment !== paymentMethod) {
          setPaymentMethod(nextPayment);
        }
        if (nextName !== undefined && nextName !== customerName) {
          setCustomerName(nextName);
        }
        if (nextInstructions !== undefined && nextInstructions !== orderInstructions) {
          setOrderInstructions(nextInstructions);
        }

        let finalCart = cart;
        if (orderDraft?.items) {
          const updatedCart = orderDraft.items.map((draftItem: any) => {
            const menuItem = menuItems.find(m => m.id === draftItem.menuItemId);
            const existingCartItem = cart.find(
              c => c.id === draftItem.menuItemId && c.variant === draftItem.variant
            );
            const baseItem = menuItem || {
              id: draftItem.menuItemId,
              name: draftItem.name,
              category: draftItem.category || 'Regular',
              price: draftItem.price || draftItem.calculatedPrice,
              hasVariants: false,
              hasGolaVariants: false,
            };
            return {
              ...baseItem,
              cartItemId: existingCartItem?.cartItemId || `${draftItem.menuItemId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              quantity: draftItem.quantity,
              variant: draftItem.variant,
              calculatedPrice: draftItem.calculatedPrice,
            } as CartItem;
          });
          setCart(updatedCart);
          finalCart = updatedCart;
        } else if (intent === 'clear_order') {
          setCart([]);
          setCustomerName('');
          setOrderInstructions('');
          setPaymentMethod('cash');
          finalCart = [];
        }

        if (intent === 'order_confirm') {
          const confirmMsg = voiceLanguage === 'gu' 
            ? 'ઓર્ડર મોકલવામાં આવી રહ્યો છે.' 
            : 'Placing order now.';
          if (ttsEnabled) {
            speakText(confirmMsg, voiceLanguage === 'gu' ? 'gu' : 'en');
          }
          await placeVoiceOrder(finalCart, nextName || customerName, nextInstructions || orderInstructions, nextPayment || paymentMethod);
          setShowVoiceAssistant(false);
        }
      }
    } catch (err) {
      console.error('Failed to process voice command', err);
      setVoiceError(err instanceof Error ? err.message : 'Voice assistant service failed.');
    } finally {
      setVoiceLoading(false);
    }
  };
  handleProcessVoiceCommandRef.current = handleProcessVoiceCommand;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(POS_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PosDraftOrderV1>;
      if (parsed.version !== 1) return;
      if (Array.isArray(parsed.cart)) {
        setCart(parsed.cart as CartItem[]);
      }
      if (typeof parsed.customerName === 'string') {
        setCustomerName(parsed.customerName);
      }
      if (typeof parsed.orderInstructions === 'string') {
        setOrderInstructions(parsed.orderInstructions);
      }
      if (parsed.paymentMethod === 'cash' || parsed.paymentMethod === 'upi' || parsed.paymentMethod === 'pay_later') {
        setPaymentMethod(parsed.paymentMethod);
      }
    } catch {
      sessionStorage.removeItem(POS_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!editingOrder) return;
    setCart(toEditableCartItems(editingOrder.items));
    setCustomerName(editingOrder.customerName ?? '');
    setOrderInstructions(editingOrder.orderInstructions ?? '');
    setPaymentMethod(editingOrder.paymentMethod);
    setShowMobileCart(false);
    setExpandedItemId(null);
    setEditError(null);
    onClearOrderError();
  }, [editingOrder, onClearOrderError]);

  useEffect(() => {
    if (editingOrder) return;

    const nextDraft: PosDraftOrderV1 = {
      version: 1,
      cart,
      customerName,
      orderInstructions,
      paymentMethod,
    };

    const shouldClearDraft =
      cart.length === 0 &&
      customerName.trim() === '' &&
      orderInstructions.trim() === '' &&
      paymentMethod === 'cash';

    try {
      if (shouldClearDraft) {
        sessionStorage.removeItem(POS_DRAFT_STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(POS_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
    } catch {
      // Ignore storage failures; in-memory checkout remains usable.
    }
  }, [cart, customerName, editingOrder, orderInstructions, paymentMethod]);

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
      // Coerce Stick → Dish if the category or variantMode disallows stick
      const stickDisallowed =
        (variant === 'Stick' && isStickRestrictedCategory(item.category)) ||
        (variant === 'Stick' && item.variantMode === 'dish_only');
      const safeVariant = stickDisallowed ? 'Dish' : variant;
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
        { ...item, cartItemId: generateId(), quantity: 1, variant: safeVariant as any, calculatedPrice },
      ];
    });
  }, [onClearOrderError]);

  const handleRemove = useCallback((item: MenuItem, variant?: string) => {
    onClearOrderError();
    setCart((prev) => {
      const stickDisallowed =
        (variant === 'Stick' && isStickRestrictedCategory(item.category)) ||
        (variant === 'Stick' && item.variantMode === 'dish_only');
      const safeVariant = stickDisallowed ? 'Dish' : variant;
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
  const isEditing = Boolean(editingOrder);

  const resetOrderForm = () => {
    setCart([]);
    setCustomerName('');
    setOrderInstructions('');
    setPaymentMethod('cash');
    setShowMobileCart(false);
    setEditError(null);
    sessionStorage.removeItem(POS_DRAFT_STORAGE_KEY);
  };

  const handleExitEditMode = () => {
    resetOrderForm();
    onClearOrderError();
    onExitEditMode?.();
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || orderPending || updatePending) return;

    const nextPaymentStatus: Order['paymentStatus'] = paymentMethod === 'pay_later' ? 'unpaid' : 'paid';
    const payload: Omit<Order, 'id' | 'orderNumber' | 'timestamp'> = {
      customerName: customerName.trim() || 'Guest',
      orderInstructions: orderInstructions.trim() || undefined,
      items: cart,
      total,
      status: 'pending' as const,
      paymentMethod,
      paymentStatus: nextPaymentStatus,
    };

    if (isEditing && editingOrder) {
      if (!onUpdateOrder) {
        setEditError('Order update action is not available.');
        return;
      }

      setUpdatePending(true);
      setEditError(null);
      onClearOrderError();

      try {
        await onUpdateOrder(editingOrder.id, {
          customerName: payload.customerName,
          orderInstructions: payload.orderInstructions,
          items: payload.items,
          total: payload.total,
          paymentMethod: payload.paymentMethod,
          paymentStatus: payload.paymentStatus,
        });
        handleExitEditMode();
      } catch (error) {
        setEditError(error instanceof Error ? error.message : 'Failed to update order. Please retry.');
      } finally {
        setUpdatePending(false);
      }
      return;
    }

    const result = await onPlaceOrder(payload);
    if (!result) return;
    resetOrderForm();
  };

  const categories = useMemo(() => Array.from(new Set(menuItems.map((i) => i.category))), [menuItems]);
  const categoryItemsMap = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const category of categories) {
      let items = menuItems.filter((item) => item.category === category);
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        items = items.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        );
      }
      map.set(category, items);
    }
    return map;
  }, [categories, menuItems, searchQuery]);

  const cartItemNames = Array.from(new Set(cart.map((i) => i.name)));
  const summaryText =
    cartItemNames.length <= 2
      ? cartItemNames.join(', ')
      : `${cartItemNames.slice(0, 2).join(', ')} +${cartItemNames.length - 2} more`;

  const cartContentCommonProps: Omit<CartContentProps, 'showHeader'> = {
    cart,
    totalItems,
    customerName,
    orderInstructions,
    paymentMethod,
    pricingRule,
    activeOfferLabel,
    subtotal,
    offerSavings,
    freeUnits,
    percentDiscountAmount,
    total,
    isEditing,
    editError,
    orderError,
    orderPending,
    updatePending,
    editingOrderNumber: editingOrder?.orderNumber,
    discountUnitPrice,
    updateQuantity,
    removeFromCart,
    onCustomerNameChange: (value) => { onClearOrderError(); setCustomerName(value); },
    onOrderInstructionsChange: (value) => { onClearOrderError(); setOrderInstructions(value); },
    onPaymentMethodChange: (method) => { onClearOrderError(); setPaymentMethod(method); },
    onCheckout: () => { void handleCheckout(); },
  };


  const visibleCategories = selectedCategory === 'All' ? categories : [selectedCategory];

  const totalVisibleItemsCount = useMemo(() => {
    let count = 0;
    for (const category of visibleCategories) {
      count += (categoryItemsMap.get(category) ?? []).length;
    }
    return count;
  }, [visibleCategories, categoryItemsMap]);

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 relative">
      {/* Menu Section */}
      <div className={`flex-1 ${cart.length > 0 && !showMobileCart ? 'pb-36' : 'pb-4'} md:pb-0`}>
        {isEditing && editingOrder && (
          <div className="mb-4 rounded-xl border border-secondary bg-secondary-container/10 px-3 py-2.5 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-secondary">Editing Order #{editingOrder.orderNumber}</p>
            <button
              type="button"
              onClick={handleExitEditMode}
              className="text-xs font-bold uppercase tracking-wider text-secondary hover:underline"
            >
              Exit Edit
            </button>
          </div>
        )}
        
        {/* Search & Category Filter Section */}
        <div className="sticky top-[56px] md:top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-outline-variant/50 w-full py-3 px-4 mb-5 -mx-4 sm:-mx-6 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search items by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-11 pr-10 border border-outline-variant rounded-full focus:outline-none focus:ring-2 focus:ring-secondary text-sm bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/60 shadow-sm"
              />
              <Search className="w-4 h-4 text-on-surface-variant/60 absolute left-4 top-3.5" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-3 h-5 w-5 rounded-full flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant/60"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setShowVoiceAssistant(true);
                startListening();
              }}
              className="h-11 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-full flex items-center gap-2 shadow-sm font-bold text-xs active:scale-95 transition-all shrink-0 border border-violet-500/20"
            >
              <Sparkles className="w-4 h-4 text-violet-200 animate-pulse" />
              <span>Voice Order</span>
            </button>
          </div>
          <div className="flex gap-2 items-center overflow-x-auto no-scrollbar w-full">
            <button
              onClick={() => setSelectedCategory('All')}
              className={`px-4 py-2 rounded-full font-label-md text-xs font-bold whitespace-nowrap active:scale-95 transition-all duration-150 border ${
                selectedCategory === 'All'
                  ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-highest border-outline-variant'
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full font-label-md text-xs font-bold whitespace-nowrap active:scale-95 transition-all duration-150 border ${
                  selectedCategory === cat
                    ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-highest border-outline-variant'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {totalVisibleItemsCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3 bg-surface-container-lowest border border-outline-variant rounded-2xl">
            <Search className="w-10 h-10 opacity-30 text-secondary" />
            <p className="font-semibold text-sm">No items found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="space-y-8">
            {visibleCategories.map((category) => {
              const items = categoryItemsMap.get(category) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={category}>
                  <h3 className="text-sm font-bold text-on-surface-variant/80 mb-4 uppercase tracking-wider font-headline">
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map((item) => {
                      const isExpanded = expandedItemId === item.id;
                      const hasPhoto = Boolean((item as any).imageUrl || (item as any).image);

                      // ---- Gola variants (4 options) ----
                      if (item.hasGolaVariants) {
                        const isStickRestricted = isStickRestrictedCategory(item.category);
                        const itemGolaVariants = isStickRestricted
                          ? GOLA_VARIANTS.filter(v => v !== 'Stick')
                          : GOLA_VARIANTS;
                        const totalQty = itemGolaVariants.reduce((s, v) => s + getCartQuantity(item.id, v), 0);
                        return (
                          <div
                            key={item.id}
                            className={`bg-surface-container-lowest border rounded-xl overflow-hidden flex flex-col relative scale-98 active:scale-[0.99] transition-all duration-150 ${isExpanded ? 'border-secondary shadow-md' : 'border-outline-variant'}`}
                          >
                            {hasPhoto && (
                              <div className="aspect-video w-full bg-surface-container-low relative overflow-hidden flex flex-col items-center justify-center gap-1 border-b border-outline-variant/30">
                                <img src={(item as any).imageUrl || (item as any).image} alt={item.name} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div
                              className="p-3 flex justify-between items-center cursor-pointer"
                              onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {!hasPhoto && (
                                  <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                                    <CategoryIcon category={item.category} className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-on-surface text-sm truncate">{item.name}</div>
                                  <div className="text-on-surface-variant text-[10px] font-medium mt-0.5 leading-tight break-words pr-2 truncate">
                                    {itemGolaVariants.map(v => `${v}: ₹${discountUnitPrice(item.golaVariantPrices?.[v] ?? item.price)}`).join(' · ')}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {totalQty > 0 && (
                                  <div className="bg-secondary text-on-secondary w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs font-mono shadow-sm">
                                    {totalQty}
                                  </div>
                                )}
                                <div className={`text-on-surface-variant/60 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-secondary' : ''}`}>
                                  <ChevronDown className="w-4 h-4" />
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="bg-surface-container-low p-3 border-t border-outline-variant space-y-2.5 rounded-b-xl">
                                {itemGolaVariants.map((v) => {
                                  const qty = getCartQuantity(item.id, v);
                                  const price = item.golaVariantPrices?.[v] ?? item.price;
                                  return (
                                    <div key={v} className="flex justify-between items-center bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/40">
                                      <div className="min-w-0 flex-1">
                                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${GOLA_VARIANT_COLORS[v]}`}>{v}</span>
                                        <span className="block text-[11px] font-bold text-on-surface-variant mt-0.5">₹{discountUnitPrice(price)}</span>
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
                        const categoryRestrictsStick = isStickRestrictedCategory(item.category);
                        const mode = item.variantMode ?? 'both';
                        const showStick = !categoryRestrictsStick && mode !== 'dish_only';
                        const showDish = mode !== 'stick_only';

                        const stickQty = getCartQuantity(item.id, 'Stick');
                        const dishQty = getCartQuantity(item.id, 'Dish');
                        const totalQty = (showStick ? stickQty : 0) + (showDish ? dishQty : 0);
                        const dishOnlyPrice = item.dishPrice ?? item.price;

                        if (showStick && !showDish) {
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (stickQty === 0) {
                                  handleAdd(item, 'Stick');
                                }
                              }}
                              className={`bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col relative scale-98 active:scale-95 transition-all duration-150 ${stickQty === 0 ? 'cursor-pointer' : ''}`}
                            >
                              {hasPhoto && (
                                <div className="aspect-square w-full bg-surface-container-low relative overflow-hidden flex flex-col items-center justify-center gap-1 border-b border-outline-variant/30">
                                  <img src={(item as any).imageUrl || (item as any).image} alt={item.name} className="w-full h-full object-cover" />
                                </div>
                              )}
                              {hasPhoto ? (
                                <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                                  <div className="font-bold text-on-surface text-xs line-clamp-2">{item.name}</div>
                                  <div className="flex justify-between items-end gap-1.5 mt-auto">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] text-on-surface-variant/80 font-bold uppercase">Stick</span>
                                      <span className="font-headline text-sm font-bold text-primary">₹{discountUnitPrice(item.price)}</span>
                                    </div>
                                    <QuantityControl
                                      quantity={stickQty}
                                      onAdd={() => handleAdd(item, 'Stick')}
                                      onRemove={() => handleRemove(item, 'Stick')}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 w-full flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                                      <CategoryIcon category={item.category} className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-on-surface text-sm truncate">{item.name}</div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-on-surface-variant/80 font-bold uppercase">Stick</span>
                                        <span className="font-headline text-sm font-bold text-primary">₹{discountUnitPrice(item.price)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="shrink-0">
                                    <QuantityControl
                                      quantity={stickQty}
                                      onAdd={() => handleAdd(item, 'Stick')}
                                      onRemove={() => handleRemove(item, 'Stick')}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (!showStick && showDish) {
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (dishQty === 0) {
                                  handleAdd(item, 'Dish');
                                }
                              }}
                              className={`bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col relative scale-98 active:scale-95 transition-all duration-150 ${dishQty === 0 ? 'cursor-pointer' : ''}`}
                            >
                              {hasPhoto && (
                                <div className="aspect-square w-full bg-surface-container-low relative overflow-hidden flex flex-col items-center justify-center gap-1 border-b border-outline-variant/30">
                                  <img src={(item as any).imageUrl || (item as any).image} alt={item.name} className="w-full h-full object-cover" />
                                </div>
                              )}
                              {hasPhoto ? (
                                <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                                  <div className="font-bold text-on-surface text-xs line-clamp-2">{item.name}</div>
                                  <div className="flex justify-between items-end gap-1.5 mt-auto">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] text-on-surface-variant/80 font-bold uppercase">Dish</span>
                                      <span className="font-headline text-sm font-bold text-primary">₹{discountUnitPrice(dishOnlyPrice)}</span>
                                    </div>
                                    <QuantityControl
                                      quantity={dishQty}
                                      onAdd={() => handleAdd(item, 'Dish')}
                                      onRemove={() => handleRemove(item, 'Dish')}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 w-full flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                                      <CategoryIcon category={item.category} className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-on-surface text-sm truncate">{item.name}</div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-on-surface-variant/80 font-bold uppercase">Dish</span>
                                        <span className="font-headline text-sm font-bold text-primary">₹{discountUnitPrice(dishOnlyPrice)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="shrink-0">
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

                        // Both variants available — expandable card
                        return (
                          <div
                            key={item.id}
                            className={`bg-surface-container-lowest border rounded-xl overflow-hidden flex flex-col relative scale-98 active:scale-[0.99] transition-all duration-150 ${isExpanded ? 'border-secondary shadow-md' : 'border-outline-variant'}`}
                          >
                            {hasPhoto && (
                              <div className="aspect-video w-full bg-surface-container-low relative overflow-hidden flex flex-col items-center justify-center gap-1 border-b border-outline-variant/30">
                                <img src={(item as any).imageUrl || (item as any).image} alt={item.name} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div
                              className="p-3 flex justify-between items-center cursor-pointer"
                              onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {!hasPhoto && (
                                  <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                                    <CategoryIcon category={item.category} className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-on-surface text-sm truncate">{item.name}</div>
                                  <div className="text-on-surface-variant text-[10px] font-medium mt-0.5">
                                    Stick: ₹{discountUnitPrice(item.price)} · Dish: ₹{discountUnitPrice(dishOnlyPrice)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {totalQty > 0 && !isExpanded && (
                                  <div className="bg-secondary text-on-secondary w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs font-mono shadow-sm">
                                    {totalQty}
                                  </div>
                                )}
                                <div className={`text-on-surface-variant/60 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-secondary' : ''}`}>
                                  <ChevronDown className="w-4 h-4" />
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="bg-surface-container-low p-3 border-t border-outline-variant space-y-2.5 rounded-b-xl">
                                <div className="flex justify-between items-center bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/40">
                                  <div>
                                    <span className="block text-[10px] font-bold text-on-surface-variant/80 uppercase">Stick</span>
                                    <span className="text-xs font-bold text-on-surface">₹{discountUnitPrice(item.price)}</span>
                                  </div>
                                  <QuantityControl
                                    quantity={stickQty}
                                    onAdd={() => handleAdd(item, 'Stick')}
                                    onRemove={() => handleRemove(item, 'Stick')}
                                  />
                                </div>
                                <div className="flex justify-between items-center bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/40">
                                  <div>
                                    <span className="block text-[10px] font-bold text-on-surface-variant/80 uppercase">Dish</span>
                                    <span className="text-xs font-bold text-on-surface">₹{discountUnitPrice(dishOnlyPrice)}</span>
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
                        <div
                          key={item.id}
                          onClick={() => {
                            if (qty === 0) {
                              handleAdd(item);
                            }
                          }}
                          className={`bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col relative scale-98 active:scale-95 transition-all duration-150 ${qty === 0 ? 'cursor-pointer' : ''}`}
                        >
                          {hasPhoto && (
                            <div className="aspect-square w-full bg-surface-container-low relative overflow-hidden flex flex-col items-center justify-center gap-1 border-b border-outline-variant/30">
                              <img src={(item as any).imageUrl || (item as any).image} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          {hasPhoto ? (
                            <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                              <div className="font-bold text-on-surface text-xs line-clamp-2">{item.name}</div>
                              <div className="flex justify-between items-end gap-1.5 mt-auto">
                                <span className="font-headline text-sm font-bold text-primary">₹{discountUnitPrice(item.price)}</span>
                                {qty === 0 ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                                    className="w-7 h-7 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center hover:bg-surface-container-highest hover:text-primary transition-colors border border-outline-variant shadow-sm focus:outline-none"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
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
                          ) : (
                            <div className="p-3 w-full flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                                  <CategoryIcon category={item.category} className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-on-surface text-sm truncate">{item.name}</div>
                                  <span className="font-headline text-sm font-bold text-primary block mt-0.5">₹{discountUnitPrice(item.price)}</span>
                                </div>
                              </div>
                              <div className="shrink-0">
                                {qty === 0 ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                                    className="w-8 h-8 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center hover:bg-surface-container-highest hover:text-primary transition-colors border border-outline-variant shadow-sm focus:outline-none"
                                    aria-label="Add item"
                                  >
                                    <Plus className="w-4 h-4" />
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Cart Section (Desktop) */}
      <div className="hidden md:flex w-96 bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant flex-col h-[calc(100vh-8rem)] sticky top-4">
        <CartContent {...cartContentCommonProps} />
      </div>

      {/* Mobile Bottom Cart Bar */}
      {cart.length > 0 && !showMobileCart && (
        <div className="md:hidden fixed left-0 right-0 p-4 mobile-floating-offset z-40">
          <button
            className="w-full bg-secondary text-on-secondary shadow-[0_8px_16px_rgba(0,108,73,0.25),inset_0_2px_4px_rgba(255,255,255,0.2)] rounded-full h-14 flex items-center justify-between px-6 active:scale-98 transition-transform duration-150 pointer-events-auto"
            onClick={() => setShowMobileCart(true)}
          >
            <div className="flex items-center gap-3">
              <div className="bg-on-secondary text-secondary rounded-full h-8 w-8 flex items-center justify-center font-bold shadow-sm text-sm">
                {totalItems}
              </div>
              <span className="font-bold uppercase tracking-wider text-xs">View Cart</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-secondary/80">Subtotal</span>
              <span className="font-headline text-lg font-bold text-on-secondary tracking-tight">₹{total}</span>
            </div>
          </button>
        </div>
      )}

      {/* Mobile Cart Modal */}
      {showMobileCart && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px]"
          onClick={() => setShowMobileCart(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-surface-container-lowest rounded-t-3xl shadow-2xl max-h-[92vh] min-h-[65vh] flex flex-col pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-2 pb-1 flex justify-center">
              <div className="h-1.5 w-12 rounded-full bg-outline-variant" />
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-surface-container-lowest border-b border-outline-variant shrink-0">
              <h2 className="text-base font-bold text-primary font-headline">Your Order</h2>
              <button
                type="button"
                onClick={() => setShowMobileCart(false)}
                className="h-10 w-10 flex items-center justify-center bg-surface-container-high text-on-surface-variant rounded-full active:scale-95 transition-transform touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <CartContent {...cartContentCommonProps} showHeader={false} />
            </div>
          </div>
        </div>
      )}
      {showVoiceAssistant && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-4xl px-4 pointer-events-none">
          <style>{`
            @keyframes pulse-ring {
              0% { transform: scale(0.95); opacity: 0.5; }
              50% { transform: scale(1.1); opacity: 0.8; }
              100% { transform: scale(0.95); opacity: 0.5; }
            }
            @keyframes soundwave-bar {
              0%, 100% { height: 8px; }
              50% { height: 28px; }
            }
            .animate-pulse-ring {
              animation: pulse-ring 2s infinite ease-in-out;
            }
            .soundwave-bar-1 { animation: soundwave-bar 0.6s infinite ease-in-out; }
            .soundwave-bar-2 { animation: soundwave-bar 0.8s infinite ease-in-out 0.1s; }
            .soundwave-bar-3 { animation: soundwave-bar 0.5s infinite ease-in-out 0.2s; }
            .soundwave-bar-4 { animation: soundwave-bar 0.7s infinite ease-in-out 0.15s; }
            .soundwave-bar-5 { animation: soundwave-bar 0.9s infinite ease-in-out 0.05s; }
          `}</style>
          
          <div className="bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/60 shadow-2xl rounded-full px-5 py-3.5 flex items-center justify-between gap-4 pointer-events-auto w-full transition-all duration-300">
            
            {/* Left: Pulse Mic & Status */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md relative z-10 transition-all ${
                  isListening
                    ? 'bg-rose-500 hover:bg-rose-600 ring-4 ring-rose-500/30 font-bold'
                    : 'bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 active:scale-95'
                }`}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4 text-white" />
                ) : (
                  <Mic className="w-4 h-4 text-white animate-pulse" />
                )}
                {isListening && (
                  <span className="absolute inset-0 rounded-full border-4 border-rose-500/40 animate-pulse-ring" />
                )}
              </button>
              
              {isListening && (
                <div className="flex items-end gap-1 h-6 shrink-0">
                  <span className="w-1 bg-violet-400 rounded-full soundwave-bar-1" style={{ height: '6px' }} />
                  <span className="w-1 bg-indigo-400 rounded-full soundwave-bar-2" style={{ height: '6px' }} />
                  <span className="w-1 bg-fuchsia-400 rounded-full soundwave-bar-3" style={{ height: '6px' }} />
                </div>
              )}

              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isListening ? 'Listening' : voiceLoading ? 'Processing' : 'Voice Assistant'}
              </span>
            </div>

            {/* Center: Live Ticker / Transcript Preview */}
            <div className="flex-1 min-w-0 bg-slate-950/40 rounded-full py-1.5 px-4 border border-slate-800/60 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <div className="flex-1 min-w-0 text-xs">
                {voiceTranscript ? (
                  <span className="text-slate-300 font-medium truncate block">
                    <strong className="text-indigo-400 font-bold mr-1">You:</strong>
                    "{voiceTranscript}"
                  </span>
                ) : voiceReply ? (
                  <span className="text-slate-200 font-semibold truncate block">
                    <strong className="text-violet-400 font-bold mr-1">AI:</strong>
                    {voiceReply}
                  </span>
                ) : voiceLoading ? (
                  <span className="text-slate-400 italic animate-pulse block">Analyzing your command...</span>
                ) : voiceError ? (
                  <span className="text-rose-400 font-semibold truncate block">{voiceError}</span>
                ) : (
                  <span className="text-slate-400 block font-medium">Say "Add 2 Plain Golas" or "Pay with UPI"</span>
                )}
              </div>
            </div>

            {/* Right: Cart Status, Language Switcher, Controls & Close */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Mini Cart summary preview */}
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700/50 text-[11px] font-bold font-mono">
                <span>🛒 {totalItems} items</span>
                <span className="text-indigo-300">₹{total}</span>
              </div>

              {/* Language buttons */}
              <div className="flex gap-0.5 bg-slate-800/60 p-0.5 rounded-lg text-[10px]">
                {(['en', 'gu', 'hi'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => selectLanguage(lang)}
                    className={`px-1.5 py-0.5 rounded font-bold transition-all uppercase ${
                      voiceLanguage === lang
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {lang === 'en' ? 'EN' : lang === 'gu' ? 'GU' : 'HI'}
                  </button>
                ))}
              </div>

              {/* TTS toggler */}
              <button
                type="button"
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className="rounded-full p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title={ttsEnabled ? 'Mute synthesis' : 'Unmute synthesis'}
              >
                {ttsEnabled ? (
                  <Volume2 className="w-4 h-4 text-indigo-400" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>

              {/* Close */}
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  setShowVoiceAssistant(false);
                }}
                className="rounded-full p-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
