import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  StickyNote,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import type {
  CartItem,
  MenuItem,
  Order,
  OrderCreateResult,
  PaymentMethod,
  PaymentStatus,
  SelectedOption,
  ServiceMode,
  UpdateOrderDetailsInput,
} from '../types';
import {
  calculateCartLinePrice,
  extractTableNumberFromLabel,
  normalizeDisplayLabel,
} from '../lib/restaurant';
import {
  CATEGORY_OPTION_GROUPS_UPDATED_EVENT,
  loadCategoryOptionGroupMap,
  mergeCategoryOptionGroups,
} from '../lib/categoryOptionGroups';
import {
  MOBILE_QUICK_PICKS_STORAGE_KEY,
  loadQuickPickEntries,
  recordQuickPickUsage,
  resolveQuickPickItems,
  type QuickPickEntry,
} from '../lib/mobileQuickPicks';
import { useLanguage } from '../lib/i18n';

interface NewOrderProps {
  menuItems: MenuItem[];
  onPlaceOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>) => Promise<OrderCreateResult | null>;
  editingOrder: Order | null;
  onUpdateOrder: (id: string, payload: UpdateOrderDetailsInput) => Promise<void>;
  onExitEditMode: () => void;
  orderPending: boolean;
  orderError: string | null;
  onClearOrderError: () => void;
}

const getServiceModes = (t: (key: string) => string): { mode: ServiceMode; label: string; icon: React.ComponentType<{ className?: string }> }[] => [
  { mode: 'dine_in', label: t('newOrder.dineIn') || 'Dine In', icon: Utensils },
  { mode: 'takeaway', label: t('newOrder.takeaway') || 'Parcel', icon: ShoppingBag },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'pay_later', label: 'Pay Later' },
];

const TABLE_PRESETS_STORAGE_KEY = 'pos_table_presets_v1';
const TABLE_PRESETS_UPDATED_EVENT = 'pos-table-presets-updated';

function loadTablePresetsFromStorage() {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(TABLE_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ).sort((left, right) => left - right);
  } catch {
    return [];
  }
}

function generateCartItemId() {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveDefaultOptions(optionGroups: MenuItem['optionGroups']): SelectedOption[] {
  const defaults: SelectedOption[] = [];
  for (const group of optionGroups) {
    if (!group.required || group.selection !== 'single') continue;
    const defaultOption = group.options.find((option) => option.isDefault && option.isActive)
      ?? group.options.find((option) => option.isActive);
    if (!defaultOption) continue;
    defaults.push({
      groupId: group.id,
      groupName: group.name,
      optionId: defaultOption.id,
      optionName: defaultOption.name,
      priceDelta: defaultOption.priceDelta,
    });
  }
  return defaults;
}

export function NewOrder({
  menuItems,
  onPlaceOrder,
  editingOrder,
  onUpdateOrder,
  onExitEditMode,
  orderPending,
  orderError,
  onClearOrderError,
}: NewOrderProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [serviceMode, setServiceMode] = useState<ServiceMode>('dine_in');
  const [displayLabel, setDisplayLabel] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_later');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [itemSearch, setItemSearch] = useState('');
  const [tablePresets, setTablePresets] = useState<number[]>([]);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [categoryOptionGroups, setCategoryOptionGroups] = useState(() => loadCategoryOptionGroupMap());
  const [optionPickerItem, setOptionPickerItem] = useState<MenuItem | null>(null);
  const [optionPickerSelections, setOptionPickerSelections] = useState<SelectedOption[]>([]);
  const [optionPickerQuantity, setOptionPickerQuantity] = useState(1);
  const [showNotes, setShowNotes] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [formError, setFormError] = useState('');
  const [quickPickEntries, setQuickPickEntries] = useState<QuickPickEntry[]>(() => loadQuickPickEntries());
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  ));
  const { t } = useLanguage();
  const SERVICE_MODES = useMemo(() => getServiceModes(t), [t]);

  const categories = useMemo(() => {
    const values = Array.from(new Set(menuItems.filter((item) => item.isActive).map((item) => item.category)));
    return ['All', ...values];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    const activeItems = menuItems.filter((item) => item.isActive);
    const normalizedSearch = itemSearch.trim().toLowerCase();

    return activeItems.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!normalizedSearch) return true;
      const searchableText = [
        item.name,
        item.category,
        item.description ?? '',
        ...(item.tags ?? []),
      ].join(' ').toLowerCase();
      return searchableText.includes(normalizedSearch);
    });
  }, [itemSearch, menuItems, selectedCategory]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.lineTotal, 0), [cart]);
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartQuantityByItemId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of cart) {
      counts.set(item.id, (counts.get(item.id) ?? 0) + item.quantity);
    }
    return counts;
  }, [cart]);
  const quickPickItems = useMemo(
    () => resolveQuickPickItems(menuItems, quickPickEntries, 8),
    [menuItems, quickPickEntries],
  );
  const showMenuDescriptions = isDesktop || itemSearch.trim().length > 0;
  const hasAdditionalDetails = Boolean(notes.trim()) || Boolean(serviceMode === 'dine_in' && displayLabel.trim());

  const getEffectiveOptionGroups = useCallback(
    (item: MenuItem) => mergeCategoryOptionGroups(item.optionGroups, item.category, categoryOptionGroups),
    [categoryOptionGroups],
  );

  const optionPickerMissingRequired = useMemo(() => {
    if (!optionPickerItem) return false;
    return optionPickerItem.optionGroups.some((group) => (
      group.required && !optionPickerSelections.some((entry) => entry.groupId === group.id)
    ));
  }, [optionPickerItem, optionPickerSelections]);

  const trackQuickPickUsage = useCallback((menuItemId: string) => {
    setQuickPickEntries(recordQuickPickUsage(menuItemId));
  }, []);

  useEffect(() => {
    if (!editingOrder) return;
    const nextNotes = (editingOrder.orderInstructions ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('ORDER_META:'))
      .join('\n');
    setCart(editingOrder.items.map((item) => ({ ...item })));
    setServiceMode(editingOrder.serviceMode);
    setDisplayLabel(editingOrder.displayLabel);
    setTableNumber(
      editingOrder.tableNumber
        ? String(editingOrder.tableNumber)
        : extractTableNumberFromLabel(editingOrder.displayLabel)?.toString() ?? '',
    );
    setNotes(nextNotes);
    setPaymentMethod(editingOrder.paymentMethod);
    setFormError('');
    setOrderPlaced(false);
    setShowNotes(Boolean(nextNotes.trim()) || Boolean(editingOrder.serviceMode === 'dine_in' && editingOrder.displayLabel.trim()));
    if (!isDesktop) {
      setShowMobileCart(true);
    }
  }, [editingOrder, isDesktop]);

  useEffect(() => {
    const syncTablePresets = () => {
      setTablePresets(loadTablePresetsFromStorage());
    };

    syncTablePresets();
    window.addEventListener('storage', syncTablePresets);
    window.addEventListener(TABLE_PRESETS_UPDATED_EVENT, syncTablePresets);

    return () => {
      window.removeEventListener('storage', syncTablePresets);
      window.removeEventListener(TABLE_PRESETS_UPDATED_EVENT, syncTablePresets);
    };
  }, []);

  useEffect(() => {
    const syncCategoryGroups = () => {
      setCategoryOptionGroups(loadCategoryOptionGroupMap());
    };

    syncCategoryGroups();
    window.addEventListener('storage', syncCategoryGroups);
    window.addEventListener(CATEGORY_OPTION_GROUPS_UPDATED_EVENT, syncCategoryGroups);

    return () => {
      window.removeEventListener('storage', syncCategoryGroups);
      window.removeEventListener(CATEGORY_OPTION_GROUPS_UPDATED_EVENT, syncCategoryGroups);
    };
  }, []);

  useEffect(() => {
    const syncQuickPicks = (event?: StorageEvent) => {
      if (event && event.key && event.key !== MOBILE_QUICK_PICKS_STORAGE_KEY) return;
      setQuickPickEntries(loadQuickPickEntries());
    };

    syncQuickPicks();
    window.addEventListener('storage', syncQuickPicks);
    return () => window.removeEventListener('storage', syncQuickPicks);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const applyMatch = (matches: boolean) => {
      setIsDesktop(matches);
      if (matches) {
        setShowMobileCart(false);
      }
    };

    applyMatch(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => applyMatch(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const mobileOrderFooterHeight = !isDesktop && cart.length > 0 && !showMobileCart ? '92px' : '0px';
    document.documentElement.style.setProperty('--mobile-order-footer-height', mobileOrderFooterHeight);
    return () => {
      document.documentElement.style.setProperty('--mobile-order-footer-height', '0px');
    };
  }, [cart.length, isDesktop, showMobileCart]);

  const addItemToCart = useCallback((item: MenuItem) => {
    const effectiveOptionGroups = mergeCategoryOptionGroups(item.optionGroups, item.category, categoryOptionGroups);
    if (effectiveOptionGroups.length > 0) {
      setOptionPickerItem({ ...item, optionGroups: effectiveOptionGroups });
      setOptionPickerSelections(resolveDefaultOptions(effectiveOptionGroups));
      setOptionPickerQuantity(1);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((entry) => entry.id === item.id && entry.selectedOptions.length === 0);
      if (existing) {
        return prev.map((entry) =>
          entry.cartItemId === existing.cartItemId
            ? {
              ...entry,
              quantity: entry.quantity + 1,
              lineTotal: entry.calculatedPrice * (entry.quantity + 1),
            }
            : entry,
        );
      }

      return [
        ...prev,
        {
          id: item.id,
          cartItemId: generateCartItemId(),
          name: item.name,
          category: item.category,
          price: item.price,
          quantity: 1,
          calculatedPrice: item.price,
          lineTotal: item.price,
          selectedOptions: [],
        },
      ];
    });
    trackQuickPickUsage(item.id);
  }, [categoryOptionGroups, trackQuickPickUsage]);

  const confirmOptionPicker = useCallback(() => {
    if (!optionPickerItem || optionPickerMissingRequired) return;
    const calculatedPrice = calculateCartLinePrice(optionPickerItem.price, optionPickerSelections);
    setCart((prev) => [
      ...prev,
      {
        id: optionPickerItem.id,
        cartItemId: generateCartItemId(),
        name: optionPickerItem.name,
        category: optionPickerItem.category,
        price: optionPickerItem.price,
        quantity: optionPickerQuantity,
        calculatedPrice,
        lineTotal: calculatedPrice * optionPickerQuantity,
        selectedOptions: [...optionPickerSelections],
      },
    ]);
    trackQuickPickUsage(optionPickerItem.id);
    setOptionPickerItem(null);
    setOptionPickerSelections([]);
    setOptionPickerQuantity(1);
  }, [optionPickerItem, optionPickerMissingRequired, optionPickerQuantity, optionPickerSelections, trackQuickPickUsage]);

  const updateQuantity = useCallback((cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartItemId !== cartItemId) return item;
          const nextQuantity = item.quantity + delta;
          if (nextQuantity <= 0) return null;
          return {
            ...item,
            quantity: nextQuantity,
            lineTotal: item.calculatedPrice * nextQuantity,
          };
        })
        .filter(Boolean) as CartItem[],
    );
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  }, []);

  const handleToggleOption = useCallback(
    (
      groupId: string,
      groupName: string,
      optionId: string,
      optionName: string,
      priceDelta: number,
      selection: 'single' | 'multiple',
    ) => {
      setOptionPickerSelections((prev) => {
        if (selection === 'single') {
          return [
            ...prev.filter((entry) => entry.groupId !== groupId),
            { groupId, groupName, optionId, optionName, priceDelta },
          ];
        }

        const exists = prev.some((entry) => entry.groupId === groupId && entry.optionId === optionId);
        if (exists) {
          return prev.filter((entry) => !(entry.groupId === groupId && entry.optionId === optionId));
        }
        return [...prev, { groupId, groupName, optionId, optionName, priceDelta }];
      });
    },
    [],
  );

  const resetForm = useCallback(() => {
    setCart([]);
    setServiceMode('dine_in');
    setDisplayLabel('');
    setTableNumber('');
    setNotes('');
    setPaymentMethod('pay_later');
    setSelectedCategory('All');
    setItemSearch('');
    setShowNotes(false);
    setShowMobileCart(false);
    setFormError('');
    onClearOrderError();
  }, [onClearOrderError]);

  const handlePlaceOrder = useCallback(async () => {
    if (cart.length === 0 || orderPending) return;

    const parsedTableNumber = serviceMode === 'dine_in' ? Number(tableNumber) : NaN;
    const resolvedTableNumber =
      serviceMode === 'dine_in' && Number.isFinite(parsedTableNumber) && parsedTableNumber > 0
        ? Math.floor(parsedTableNumber)
        : undefined;

    if (serviceMode === 'dine_in' && !resolvedTableNumber) {
      setFormError('Table number is required for dine-in orders.');
      if (!isDesktop) {
        setShowMobileCart(true);
      }
      return;
    }

    setFormError('');
    const labelInput = displayLabel.trim()
      || (serviceMode === 'dine_in' && resolvedTableNumber ? `Table ${resolvedTableNumber}` : '');
    const label = normalizeDisplayLabel(labelInput, serviceMode);
    const paymentStatus: PaymentStatus = paymentMethod === 'pay_later' ? 'unpaid' : 'paid';

    if (editingOrder) {
      const payload: UpdateOrderDetailsInput = {
        customerName: label,
        displayLabel: label,
        serviceMode,
        tableNumber: resolvedTableNumber ?? null,
        orderInstructions: notes.trim() || undefined,
        items: cart,
        total: cartTotal,
        paymentMethod,
        paymentStatus,
      };
      await onUpdateOrder(editingOrder.id, payload);
      onExitEditMode();
      resetForm();
      return;
    }

    const orderData: Omit<Order, 'id' | 'orderNumber' | 'timestamp'> = {
      customerName: label,
      displayLabel: label,
      serviceMode,
      tableNumber: resolvedTableNumber,
      orderInstructions: notes.trim() || undefined,
      items: cart,
      total: cartTotal,
      status: 'pending',
      paymentMethod,
      paymentStatus,
    };

    const result = await onPlaceOrder(orderData);
    if (result) {
      setOrderPlaced(true);
      setShowMobileCart(false);
      setTimeout(() => {
        setOrderPlaced(false);
        resetForm();
      }, 1800);
    }
  }, [
    cart,
    cartTotal,
    displayLabel,
    editingOrder,
    isDesktop,
    notes,
    onExitEditMode,
    onPlaceOrder,
    onUpdateOrder,
    orderPending,
    paymentMethod,
    resetForm,
    serviceMode,
    tableNumber,
  ]);

  const renderCartList = (compact = false) => (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      {cart.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
          {t('newOrder.emptyCart')}
        </div>
      )}
      {cart.map((item) => (
        <div
          key={item.cartItemId}
          className={`rounded-2xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-3.5'}`}
        >
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{t(item.name)}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{t(item.category)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.cartItemId)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {item.selectedOptions.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {item.selectedOptions.map((option) => t(option.optionName)).join(', ')}
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-indigo-600">
                Rs {item.calculatedPrice} x {item.quantity} = Rs {item.lineTotal}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateQuantity(item.cartItemId, 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm font-bold text-slate-700">{item.quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(item.cartItemId, -1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderMobileDetailsPanel = () => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setShowNotes((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-700">More details</p>
            <p className="text-xs text-slate-500">
              {hasAdditionalDetails ? 'Guest label or notes added' : 'Add guest label or special notes'}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showNotes ? 'rotate-180' : ''}`} />
      </button>

      {showNotes && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
          {serviceMode === 'dine_in' && (
            <input
              type="text"
              value={displayLabel}
              onChange={(event) => {
                setDisplayLabel(event.target.value);
                setFormError('');
              }}
              placeholder="Guest name or table note"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Special instructions, parcel note, address, etc."
            className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}
    </div>
  );

  const renderCartActions = (mobile = false) => (
    <div className={`space-y-3 ${mobile ? 'pb-safe' : ''}`}>
      <div className="flex gap-1.5">
        {PAYMENT_METHODS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setPaymentMethod(value)}
            className={`min-h-11 flex-1 rounded-xl text-xs font-semibold transition-all ${
              paymentMethod === value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-sm font-medium text-slate-600">{t('newOrder.total')}</span>
        <span className="text-xl font-bold text-slate-900">Rs {cartTotal}</span>
      </div>

      {(formError || orderError) && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError || orderError}</span>
        </div>
      )}

      {orderPlaced && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <Check className="h-4 w-4" />
          Order placed successfully!
        </div>
      )}

      <button
        type="button"
        onClick={() => { void handlePlaceOrder(); }}
        disabled={orderPending || cart.length === 0}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {orderPending ? 'Processing...' : editingOrder ? t('newOrder.saveChanges') : t('newOrder.placeOrder')}
      </button>

      {editingOrder && (
        <button
          type="button"
          onClick={() => {
            onExitEditMode();
            resetForm();
          }}
          className="min-h-11 w-full rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          {t('newOrder.cancelEdit')}
        </button>
      )}
    </div>
  );

  const renderItemGrid = (mobile = false) => (
    <div className={`grid min-h-0 content-start gap-2 ${mobile ? 'max-[359px]:grid-cols-1 grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3'}`}>
      {filteredItems.map((item) => {
        const effectiveOptionGroups = getEffectiveOptionGroups(item);
        const inCartCount = cartQuantityByItemId.get(item.id) ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => addItemToCart(item)}
            className={`relative rounded-2xl border border-slate-200 bg-white text-left transition-all hover:border-indigo-300 hover:shadow-sm ${mobile ? 'p-3' : 'p-2.5 sm:p-3'}`}
          >
            {inCartCount > 0 && (
              <span className="absolute right-2.5 top-2.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                In cart x{inCartCount}
              </span>
            )}
            <p className={`pr-16 text-sm font-semibold text-slate-800 ${mobile ? 'break-words' : 'truncate'}`}>
              {t(item.name)}
            </p>
            <p className={`mt-0.5 text-[11px] text-slate-400 ${mobile ? 'break-words' : 'truncate'}`}>
              {t(item.category)}
            </p>
            {showMenuDescriptions && item.description && (
              <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{t(item.description)}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-indigo-600">Rs {item.price}</span>
              {effectiveOptionGroups.length > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  Options
                </span>
              )}
            </div>
          </button>
        );
      })}

      {filteredItems.length === 0 && (
        <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-400">
          No items match this category or search.
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-col gap-4 mobile-order-footer-offset lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div
          className="sticky z-20 border-b border-slate-200 bg-slate-50/95 backdrop-blur"
          style={{ top: 'var(--mobile-app-header-offset)' }}
        >
          <div className="space-y-3 px-3 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1">
                {SERVICE_MODES.map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setServiceMode(mode);
                      setFormError('');
                      if (mode !== 'dine_in') {
                        setTableNumber('');
                      }
                    }}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
                      serviceMode === mode
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowMobileCart(true)}
                className="flex min-h-11 min-w-[7.75rem] flex-col justify-center rounded-2xl border border-slate-200 bg-white px-3 text-left shadow-sm relative overflow-hidden"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cart</span>
                  {serviceMode === 'dine_in' && tableNumber && (
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">T{tableNumber}</span>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-800">
                  {cartItemCount > 0 ? `${cartItemCount} item${cartItemCount !== 1 ? 's' : ''}` : 'Add items'}
                </span>
                <span className="text-xs font-semibold text-indigo-600">Rs {cartTotal}</span>
              </button>
            </div>

            {serviceMode === 'dine_in' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={tableNumber}
                    onChange={(event) => {
                      setTableNumber(event.target.value);
                      setFormError('');
                    }}
                    placeholder="Table #"
                    className="h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex items-center rounded-xl bg-slate-50 px-3 text-xs font-medium text-slate-500">
                    Table number is required for dine-in orders.
                  </div>
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {tablePresets.length > 0 ? (
                    tablePresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setTableNumber(String(preset));
                          setFormError('');
                        }}
                        className={`h-9 shrink-0 rounded-full border px-3 text-xs font-bold transition-colors ${
                          Number(tableNumber) === preset
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Table {preset}
                      </button>
                    ))
                  ) : (
                    <span className="inline-flex h-9 items-center rounded-full border border-dashed border-slate-200 px-3 text-xs text-slate-400">
                      Add table presets in Menu Management.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <input
                  type="text"
                  value={displayLabel}
                  onChange={(event) => {
                    setDisplayLabel(event.target.value);
                    setFormError('');
                  }}
                  placeholder="Customer name"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder={t('newOrder.searchMenu')}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {quickPickItems.length > 0 && (
              <div className="space-y-2">
                <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Quick picks</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {quickPickItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItemToCart(item)}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-left shadow-sm"
                    >
                      <span className="block text-xs font-semibold text-slate-700">{t(item.name)}</span>
                      <span className="block text-[11px] text-indigo-600">Rs {item.price}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`h-9 shrink-0 rounded-full px-4 text-xs font-semibold transition-all ${
                    selectedCategory === category
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {t(category)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {renderItemGrid(true)}
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 lg:flex lg:flex-col">
        <div className="mb-3 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2">
            {SERVICE_MODES.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setServiceMode(mode);
                  setFormError('');
                  if (mode !== 'dine_in') {
                    setTableNumber('');
                  }
                }}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
                  serviceMode === mode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {serviceMode === 'dine_in' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[7rem_1fr_auto] gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={tableNumber}
                  onChange={(event) => {
                    setTableNumber(event.target.value);
                    setFormError('');
                  }}
                  placeholder="Table #"
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  value={displayLabel}
                  onChange={(event) => {
                    setDisplayLabel(event.target.value);
                    setFormError('');
                  }}
                  placeholder="Guest name or note"
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNotes((prev) => !prev)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                    showNotes || notes
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  title="Order notes"
                >
                  <StickyNote className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Quick tables</span>
                {tablePresets.length > 0 ? (
                  tablePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setTableNumber(String(preset));
                        setFormError('');
                      }}
                      className={`h-8 rounded-full border px-3 text-xs font-bold transition-colors ${
                        Number(tableNumber) === preset
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Table {preset}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">Add table presets in Menu Management.</span>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                type="text"
                value={displayLabel}
                onChange={(event) => {
                  setDisplayLabel(event.target.value);
                  setFormError('');
                }}
                placeholder="Customer name"
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowNotes((prev) => !prev)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                  showNotes || notes
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                title="Order notes"
              >
                <StickyNote className="h-4 w-4" />
              </button>
            </div>
          )}

          {serviceMode === 'dine_in' && (
            <div className="text-xs text-slate-500">Table number is required for dine-in orders.</div>
          )}

          {showNotes && (
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Special instructions, delivery address, etc."
              className="h-20 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>

        <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder={t('newOrder.searchMenu')}
              className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`h-9 shrink-0 rounded-full px-4 text-xs font-semibold transition-all ${
                selectedCategory === category
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t(category)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {renderItemGrid(false)}
        </div>
      </div>

      <div className="hidden min-h-0 w-full lg:flex lg:w-80 xl:w-96">
        <div className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800">
                {editingOrder ? `${t('common.edit')} #${editingOrder.orderNumber}` : t('newOrder.cartTitle')}
              </h3>
            </div>
            {cartItemCount > 0 && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {cartItemCount} items
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {renderCartList()}
          </div>

          {(cart.length > 0 || editingOrder) && (
            <div className="border-t border-slate-200 p-3">
              {renderCartActions()}
            </div>
          )}
        </div>
      </div>

      {cart.length > 0 && !showMobileCart && (
        <button
          type="button"
          onClick={() => setShowMobileCart(true)}
          className="fixed left-3 right-3 z-30 rounded-2xl bg-indigo-600 px-4 py-3 text-left text-white shadow-[0_-8px_24px_rgba(79,70,229,0.28)] lg:hidden"
          style={{ bottom: 'var(--mobile-fixed-stack-height)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-bold">
                  Review {cartItemCount} item{cartItemCount !== 1 ? 's' : ''}
                  {serviceMode === 'dine_in' && tableNumber && (
                    <span className="ml-1.5 text-indigo-200 text-xs">| Table {tableNumber}</span>
                  )}
                </span>
              </div>
              <div className="mt-1 text-xs text-indigo-100">
                {cart.slice(0, 2).map((item) => `${t(item.name)} x${item.quantity}`).join(' • ')}
                {cart.length > 2 ? ` • +${cart.length - 2} more` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold">Rs {cartTotal}</div>
              <div className="text-[11px] font-semibold text-indigo-100">Checkout</div>
            </div>
          </div>
        </button>
      )}

      {showMobileCart && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/40 lg:hidden" onClick={() => setShowMobileCart(false)}>
          <div
            className="flex max-h-[88dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-4 pb-3 pt-3">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    {editingOrder ? `Edit #${editingOrder.orderNumber}` : 'Review Order'}
                  </h3>
                  <p className="text-sm text-slate-500">{cartItemCount} item(s) | Rs {cartTotal}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileCart(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {renderCartList(true)}
              <div className="mt-4">
                {renderMobileDetailsPanel()}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-4">
              {renderCartActions(true)}
            </div>
          </div>
        </div>
      )}

      {optionPickerItem && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm lg:items-center lg:justify-center lg:p-4">
          <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl lg:max-h-[80vh] lg:max-w-md lg:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <h3 className="font-bold text-slate-800">{optionPickerItem.name}</h3>
                <p className="text-xs text-slate-500">Base price: Rs {optionPickerItem.price}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOptionPickerItem(null);
                  setOptionPickerSelections([]);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {optionPickerItem.optionGroups.map((group) => (
                  <div key={group.id}>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-700">{group.name}</h4>
                      {group.required && (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {group.options.filter((option) => option.isActive).map((option) => {
                        const isSelected = optionPickerSelections.some(
                          (entry) => entry.groupId === group.id && entry.optionId === option.id,
                        );
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => handleToggleOption(
                              group.id,
                              group.name,
                              option.id,
                              option.name,
                              option.priceDelta,
                              group.selection,
                            )}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-all ${
                              isSelected
                                ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`flex h-4 w-4 items-center justify-center border-2 ${
                                  group.selection === 'single' ? 'rounded-full' : 'rounded'
                                } ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}
                              >
                                {isSelected && <div className={`${group.selection === 'single' ? 'h-2 w-2 rounded-full' : 'h-2 w-2 rounded-sm'} bg-white`} />}
                              </div>
                              <span className="font-medium">{option.name}</span>
                            </div>
                            {option.priceDelta !== 0 && (
                              <span className={`text-xs font-semibold ${option.priceDelta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {option.priceDelta > 0 ? '+' : ''}Rs {option.priceDelta}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {optionPickerMissingRequired && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Select all required options to continue.
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-medium text-slate-700">Quantity</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOptionPickerQuantity(Math.max(1, optionPickerQuantity - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-lg font-bold text-slate-800">{optionPickerQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setOptionPickerQuantity(optionPickerQuantity + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-slate-200 bg-white p-4 pb-safe">
              <button
                type="button"
                onClick={confirmOptionPicker}
                disabled={optionPickerMissingRequired}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Add to Cart - Rs {calculateCartLinePrice(optionPickerItem.price, optionPickerSelections) * optionPickerQuantity}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
