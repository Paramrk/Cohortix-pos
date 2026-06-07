import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Save, Tag, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { MenuItem, GolaVariant, PricingRule, Order, VariantMode } from '../types';
import { isStickRestrictedCategory } from '../utils/category';
import { CategoryIcon } from './NewOrder';

export function StickIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 0 1 12 0v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9z" />
      <path d="M12 17v4" />
      <path d="M10 9v4" />
      <path d="M14 9v4" />
    </svg>
  );
}

export function DishIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12a7 7 0 0 1 14 0z" />
      <path d="M3 12h18a1 1 0 0 1 1 1 8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function IceCubeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05" />
      <path d="M12 22.08V12" />
    </svg>
  );
}


interface MenuManagerProps {
  menuItems: MenuItem[];
  orders: Order[];
  onAdd: (item: Omit<MenuItem, 'id'>) => Promise<void>;
  onUpdate: (id: string, item: Omit<MenuItem, 'id'>) => Promise<void>;
  onRenameCategory: (currentName: string, nextName: string) => Promise<void>;
  onDelete: (id: string) => void;
  pricingRule: PricingRule;
  onUpdatePricingRule: (next: Partial<PricingRule>) => Promise<void>;
  theme?: string;
  onChangeTheme?: (theme: string) => void;
  customPrimary?: string;
  onChangeCustomPrimary?: (color: string) => void;
  customSecondary?: string;
  onChangeCustomSecondary?: (color: string) => void;
  customBackground?: string;
  onChangeCustomBackground?: (color: string) => void;
  customSurface?: string;
  onChangeCustomSurface?: (color: string) => void;
  customText?: string;
  onChangeCustomText?: (color: string) => void;
}

const GOLA_VARIANTS: GolaVariant[] = ['Ice Cream Only', 'Dry Fruit Only', 'Ice Cream + Dry Fruit', 'Plain', 'Stick'];
const DEFAULT_CATEGORIES = ['Regular', 'Special Dish', 'Pyali'] as const;
const CUSTOM_CATEGORIES_STORAGE_KEY = 'pos_custom_categories_v1';

interface FormState {
  name: string;
  category: string;
  stickPrice: number;
  dishPrice: number;
  golaVariantPrices: Record<GolaVariant, number>;
  defaultGolaVariant: GolaVariant;
  variantMode: VariantMode;
}

const defaultForm = (): FormState => ({
  name: '',
  category: DEFAULT_CATEGORIES[0],
  stickPrice: 0,
  dishPrice: 0,
  golaVariantPrices: {
    'Ice Cream Only': 0,
    'Dry Fruit Only': 0,
    'Ice Cream + Dry Fruit': 0,
    'Plain': 0,
    'Stick': 0,
  },
  defaultGolaVariant: 'Plain',
  variantMode: 'both',
});

function formToMenuItem(f: FormState): Omit<MenuItem, 'id'> {
  const stickAllowed = !isStickRestrictedCategory(f.category);
  // Stick-restricted categories are always dish-only regardless of draft toggle.
  const effectiveVariantMode: VariantMode = !stickAllowed
    ? 'dish_only'
    : (f.variantMode ?? 'both');

  const hasGola = GOLA_VARIANTS.some((v) => f.golaVariantPrices[v] > 0);
  const normalizedStickPrice = stickAllowed && effectiveVariantMode !== 'dish_only' ? f.stickPrice : 0;
  const normalizedDishPrice = hasGola || effectiveVariantMode === 'stick_only'
    ? undefined
    : (f.dishPrice > 0 ? f.dishPrice : undefined);
  const hasStickDish = normalizedStickPrice > 0 || (normalizedDishPrice ?? 0) > 0;
  const basePrice = normalizedStickPrice > 0
    ? normalizedStickPrice
    : hasGola
      ? f.golaVariantPrices['Plain']
      : (normalizedDishPrice ?? 0);

  return {
    name: f.name.trim(),
    price: basePrice,
    dishPrice: normalizedDishPrice,
    category: f.category,
    hasVariants: hasStickDish || hasGola,
    hasGolaVariants: hasGola,
    golaVariantPrices: hasGola ? { ...f.golaVariantPrices } : undefined,
    defaultGolaVariant: hasGola ? f.defaultGolaVariant : undefined,
    variantMode: effectiveVariantMode,
  };
}

function menuItemToForm(item: MenuItem): FormState {
  const stickAllowed = !isStickRestrictedCategory(item.category);
  const fallbackDishPrice = item.hasGolaVariants ? 0 : (!stickAllowed ? item.price : 0);
  return {
    name: item.name,
    category: item.category,
    stickPrice: stickAllowed ? item.price : 0,
    dishPrice: item.hasGolaVariants ? 0 : (item.dishPrice || fallbackDishPrice),
    golaVariantPrices: item.hasGolaVariants && item.golaVariantPrices ? item.golaVariantPrices : {
      'Ice Cream Only': 0,
      'Dry Fruit Only': 0,
      'Ice Cream + Dry Fruit': 0,
      'Plain': 0,
      'Stick': 0,
    },
    defaultGolaVariant: item.defaultGolaVariant || 'Plain',
    variantMode: item.variantMode ?? 'both',
  };
}

function formatOrderTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getOrderItemVariant(item: Record<string, unknown>) {
  if (typeof item.variant === 'string' && item.variant.trim()) return item.variant;
  if (typeof item.variantName === 'string' && item.variantName.trim()) return item.variantName;
  if (typeof item.variant_name === 'string' && item.variant_name.trim()) return item.variant_name;
  return null;
}

export function MenuManager({
  menuItems,
  orders,
  onAdd,
  onUpdate,
  onRenameCategory,
  onDelete,
  pricingRule,
  onUpdatePricingRule,
  theme = 'theme-default',
  onChangeTheme,
  customPrimary = '#000000',
  onChangeCustomPrimary,
  customSecondary = '#006c49',
  onChangeCustomSecondary,
  customBackground = '#f8f9ff',
  onChangeCustomBackground,
  customSurface = '#ffffff',
  onChangeCustomSurface,
  customText = '#0b1c30',
  onChangeCustomText,
}: MenuManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [savingOffers, setSavingOffers] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [pricingDraft, setPricingDraft] = useState<PricingRule>(pricingRule);
  const [showOrdersPanel, setShowOrdersPanel] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | Order['status']>('all');
  const [orderSourceFilter, setOrderSourceFilter] = useState<'all' | 'pos' | 'customer'>('all');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | Order['paymentStatus']>('all');

  const [draftPrimary, setDraftPrimary] = useState(customPrimary);
  const [draftSecondary, setDraftSecondary] = useState(customSecondary);
  const [draftBackground, setDraftBackground] = useState(customBackground);
  const [draftSurface, setDraftSurface] = useState(customSurface);
  const [draftText, setDraftText] = useState(customText);

  useEffect(() => {
    setDraftPrimary(customPrimary);
  }, [customPrimary]);

  useEffect(() => {
    setDraftSecondary(customSecondary);
  }, [customSecondary]);

  useEffect(() => {
    setDraftBackground(customBackground);
  }, [customBackground]);

  useEffect(() => {
    setDraftSurface(customSurface);
  }, [customSurface]);

  useEffect(() => {
    setDraftText(customText);
  }, [customText]);

  const hasUnsavedThemeChanges =
    draftPrimary !== customPrimary ||
    draftSecondary !== customSecondary ||
    draftBackground !== customBackground ||
    draftSurface !== customSurface ||
    draftText !== customText;

  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, Partial<FormState>>>({});
  const [savingBulk, setSavingBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');

  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [mockAvailable, setMockAvailable] = useState<Record<string, boolean>>({});

  const handleToggleAvailable = (itemId: string) => {
    setMockAvailable((prev) => ({ ...prev, [itemId]: prev[itemId] === false }));
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
      if (stored) setCustomCategories(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setPricingDraft(pricingRule);
  }, [pricingRule]);

  const allCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...customCategories])
  );

  const hasGolaPrices = GOLA_VARIANTS.some((v) => form.golaVariantPrices[v] > 0);
  const hasDishPrice = form.dishPrice > 0;
  const stickAllowed = !isStickRestrictedCategory(form.category);

  const atLeastOnePrice =
    (stickAllowed && form.stickPrice > 0) ||
    form.dishPrice > 0 ||
    GOLA_VARIANTS.some((v) => form.golaVariantPrices[v] > 0);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = orderSearch.trim().toLowerCase();

    return [...orders]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((order) => {
        if (orderStatusFilter !== 'all' && order.status !== orderStatusFilter) return false;
        if (orderSourceFilter !== 'all' && (order.source ?? 'pos') !== orderSourceFilter) return false;
        if (orderPaymentFilter !== 'all' && order.paymentStatus !== orderPaymentFilter) return false;

        if (!normalizedSearch) return true;

        const itemText = order.items
          .map((item) => `${item.name} ${getOrderItemVariant(item as unknown as Record<string, unknown>) ?? ''}`)
          .join(' ')
          .toLowerCase();

        return (
          order.customerName.toLowerCase().includes(normalizedSearch) ||
          String(order.orderNumber).includes(normalizedSearch) ||
          itemText.includes(normalizedSearch)
        );
      });
  }, [orderPaymentFilter, orderSearch, orderSourceFilter, orderStatusFilter, orders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!atLeastOnePrice) {
      setSaveError('Please enter at least one price.');
      return;
    }
    setSaveError('');
    setSaving(true);
    try {
      const menuItem = formToMenuItem(form);
      if (editingId) {
        await onUpdate(editingId, menuItem);
        setEditingId(null);
      } else {
        await onAdd(menuItem);
      }
      setForm(defaultForm());
    } catch (error) {
      if (error instanceof Error && error.message.trim()) {
        setSaveError(error.message);
      } else {
        setSaveError('Failed to save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setForm(menuItemToForm(item));
    setSaveError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(defaultForm());
    setSaveError('');
  };

  const setGola = (v: GolaVariant, val: number) =>
    setForm((f) => ({ ...f, golaVariantPrices: { ...f.golaVariantPrices, [v]: val } }));

  const hasPricingChanges =
    pricingDraft.discountPercent !== pricingRule.discountPercent ||
    pricingDraft.bogoEnabled !== pricingRule.bogoEnabled ||
    pricingDraft.bogoType !== pricingRule.bogoType;

  const handleApplyOffers = async () => {
    if (!hasPricingChanges || savingOffers) return;
    setSaveError('');
    setSavingOffers(true);
    try {
      await onUpdatePricingRule(pricingDraft);
    } catch (error) {
      if (error instanceof Error && error.message.trim()) {
        setSaveError(error.message);
      } else {
        setSaveError('Failed to apply offers. Please try again.');
      }
    } finally {
      setSavingOffers(false);
    }
  };

  const handleToggleBulkEdit = () => {
    if (isBulkEdit) {
      if (Object.keys(bulkDrafts).length > 0) {
        if (!window.confirm('Discard unsaved changes?')) return;
      }
      setIsBulkEdit(false);
      setBulkDrafts({});
      setBulkError('');
    } else {
      setIsBulkEdit(true);
      setBulkDrafts({});
      setBulkError('');
      setEditingId(null);
      setSaveError('');
      setForm(defaultForm());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const updateBulkDraft = (id: string, field: keyof FormState, value: any) => {
    setBulkDrafts((prev) => {
      const currentItem = menuItems.find((i) => i.id === id);
      if (!currentItem) return prev;
      const baseForm = prev[id] || menuItemToForm(currentItem);
      return { ...prev, [id]: { ...baseForm, [field]: value } };
    });
  };

  const updateBulkGolaDraft = (id: string, variant: GolaVariant, value: number) => {
    setBulkDrafts((prev) => {
      const currentItem = menuItems.find((i) => i.id === id);
      if (!currentItem) return prev;
      const baseForm = prev[id] || menuItemToForm(currentItem);
      const golas = baseForm.golaVariantPrices || { ...defaultForm().golaVariantPrices };
      return {
        ...prev,
        [id]: {
          ...baseForm,
          golaVariantPrices: { ...golas, [variant]: value },
        },
      };
    });
  };

  const handleSaveBulk = async () => {
    const ids = Object.keys(bulkDrafts);
    if (ids.length === 0) {
      setIsBulkEdit(false);
      return;
    }
    setSavingBulk(true);
    setBulkError('');
    try {
      const promises = ids.map((id) => {
        const formUpdate = bulkDrafts[id];
        const currentItem = menuItems.find((i) => i.id === id);
        if (!currentItem) return Promise.resolve();
        const fullForm = { ...menuItemToForm(currentItem), ...formUpdate } as FormState;

        const stickAllowed = !isStickRestrictedCategory(fullForm.category);
        const atLeastOnePrice =
          (stickAllowed && fullForm.stickPrice > 0) ||
          fullForm.dishPrice > 0 ||
          GOLA_VARIANTS.some((v) => fullForm.golaVariantPrices[v] > 0);

        if (!atLeastOnePrice) {
          throw new Error(`Item "${fullForm.name}" must have at least one price.`);
        }

        const updatedMenuItem = formToMenuItem(fullForm);
        return onUpdate(id, updatedMenuItem);
      });
      await Promise.all(promises);
      setIsBulkEdit(false);
      setBulkDrafts({});
    } catch (error) {
      setBulkError(error instanceof Error && error.message.trim() ? error.message : 'Failed to save some items');
    } finally {
      setSavingBulk(false);
    }
  };

  const handleRenameCategory = async (currentCategory: string) => {
    if (saving || savingBulk || savingOffers || renamingCategory) return;
    const currentCategoryCount = menuItems.filter((item) => item.category === currentCategory).length;

    const nextCategory = window.prompt(`Rename "${currentCategory}" to:`, currentCategory);
    if (nextCategory == null) return;

    const trimmedNextCategory = nextCategory.trim();
    if (!trimmedNextCategory) {
      alert('Category name cannot be empty.');
      return;
    }

    if (trimmedNextCategory === currentCategory) {
      return;
    }

    const existingCategory = allCategories.find(
      (category) => category.toLowerCase() === trimmedNextCategory.toLowerCase() && category !== currentCategory,
    );

    const targetCategory = existingCategory ?? trimmedNextCategory;
    const mergeTargetCount = existingCategory
      ? menuItems.filter((item) => item.category.toLowerCase() === existingCategory.toLowerCase()).length
      : 0;
    const confirmed = existingCategory
      ? window.confirm(
        `Category "${existingCategory}" already has ${mergeTargetCount} item(s). Merge ${currentCategoryCount} item(s) from "${currentCategory}" into it?`,
      )
      : window.confirm(`Rename category "${currentCategory}" (${currentCategoryCount} item(s)) to "${trimmedNextCategory}"?`);

    if (!confirmed) return;

    setRenamingCategory(currentCategory);
    setSaveError('');
    try {
      await onRenameCategory(currentCategory, targetCategory);
      setForm((prev) => (prev.category === currentCategory ? { ...prev, category: targetCategory } : prev));
    } catch (error) {
      alert(error instanceof Error && error.message.trim() ? error.message : 'Failed to rename category.');
    } finally {
      setRenamingCategory(null);
    }
  };

  const handleDeleteCategory = (categoryToRemove: string) => {
    const count = menuItems.filter((i) => i.category === categoryToRemove).length;
    if (count > 0) {
      alert(`Cannot delete "${categoryToRemove}" — it still has ${count} item(s). Move or delete them first.`);
      return;
    }
    if (!window.confirm(`Delete empty category "${categoryToRemove}"?`)) return;
    setCustomCategories((prev) => {
      const next = prev.filter((c) => c !== categoryToRemove);
      localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    if (form.category === categoryToRemove) {
      setForm((prev) => ({ ...prev, category: DEFAULT_CATEGORIES[0] }));
    }
  };

  const handleAddNewCategory = () => {
    const input = window.prompt('Enter new category name:');
    if (!input) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const existing = allCategories.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      alert('This category already exists.');
      setForm((prev) => ({ ...prev, category: existing }));
      return;
    }
    setCustomCategories((prev) => {
      const next = [...prev, trimmed];
      localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setForm((prev) => ({ ...prev, category: trimmed }));
  };

  return (
    <div className="mobile-bottom-offset md:pb-0 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-bold text-on-surface font-headline">Menu Management</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-secondary-container text-on-secondary-container px-2.5 py-1 rounded-full border border-transparent">
            Live Service
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => setShowOrdersPanel((prev) => !prev)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all scale-98 active:scale-95 border ${showOrdersPanel
              ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
              }`}
          >
            {showOrdersPanel ? 'Hide Orders' : 'Show Orders'}
          </button>
          <button
            onClick={handleToggleBulkEdit}
            disabled={savingBulk}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all scale-98 active:scale-95 border ${isBulkEdit
              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'
              : 'bg-secondary-container text-on-secondary-container hover:opacity-90 border-transparent shadow-sm'
              }`}
          >
            {isBulkEdit ? 'Cancel Bulk Edit' : 'Bulk Edit'}
          </button>
        </div>
      </div>

      {showOrdersPanel && (
        <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider">Whole Order List</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Search and filter all live orders without leaving menu management.
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-surface-container text-on-surface px-3 py-1 rounded-full border border-outline-variant/30">
              {filteredOrders.length} order(s)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
            <input
              type="text"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search by order #, customer, or item"
              className="xl:col-span-2 h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            />
            <select
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value as 'all' | Order['status'])}
              className="h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <select
              value={orderSourceFilter}
              onChange={(e) => setOrderSourceFilter(e.target.value as 'all' | 'pos' | 'customer')}
              className="h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            >
              <option value="all">All Sources</option>
              <option value="pos">POS</option>
              <option value="customer">Customer</option>
            </select>
            <select
              value={orderPaymentFilter}
              onChange={(e) => setOrderPaymentFilter(e.target.value as 'all' | Order['paymentStatus'])}
              className="h-10 px-3 rounded-xl border border-outline-variant bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            >
              <option value="all">All Payment</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          <div className="max-h-[500px] overflow-y-auto space-y-3 pr-1 no-scrollbar">
            {filteredOrders.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-outline-variant bg-surface p-8 text-center text-xs text-on-surface-variant font-medium">
                No orders match the selected filters.
              </div>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-outline-variant bg-surface/30 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-on-surface font-headline">#{order.orderNumber}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-transparent ${order.status === 'pending'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container'
                          }`}>
                          {order.status}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-transparent ${order.paymentStatus === 'paid'
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-error-container text-on-error-container'
                          }`}>
                          {order.paymentStatus}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant border border-outline-variant/40">
                          {(order.source ?? 'pos').toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-on-surface font-bold">{order.customerName}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{formatOrderTimestamp(order.timestamp)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-on-surface font-headline">₹{order.total}</div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.items.map((item, index) => {
                      const variant = getOrderItemVariant(item as unknown as Record<string, unknown>);
                      return (
                        <span key={`${order.id}-${index}`} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/60 px-2.5 py-1 text-xs text-on-surface">
                          <span className="font-bold text-on-secondary-container bg-secondary-container px-1 py-0.2 rounded text-[10px] font-mono">{item.quantity}x</span>
                          <span className="font-medium">{item.name}</span>
                          {variant && <span className="font-bold text-secondary text-[10px] uppercase font-headline">| {variant}</span>}
                        </span>
                      );
                    })}
                  </div>

                  {order.orderInstructions && (
                    <div className="mt-3 rounded-xl border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface whitespace-pre-line">
                      <span className="font-bold uppercase tracking-wide text-[9px] text-slate-500 mr-2">Instructions:</span>
                      {order.orderInstructions}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {isBulkEdit && Object.keys(bulkDrafts).length > 0 && (
        <div className="sticky top-4 z-20 bg-surface-container-lowest p-4 border border-outline-variant shadow-xl rounded-2xl flex flex-wrap gap-4 justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <span className="font-bold text-on-secondary-container bg-secondary-container px-3 py-1.5 rounded-lg text-xs border border-transparent shadow-sm font-headline">
              {Object.keys(bulkDrafts).length} item(s) changed
            </span>
            {bulkError && <span className="text-xs text-rose-600 font-semibold flex-1">{bulkError}</span>}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                if (window.confirm('Discard all unsaved changes?')) {
                  setBulkDrafts({});
                  setBulkError('');
                }
              }}
              disabled={savingBulk}
              className="flex-1 sm:flex-none h-10 px-4 border border-outline-variant rounded-xl text-xs font-bold bg-surface hover:bg-surface-container transition-colors text-on-surface scale-98 active:scale-95"
            >
              Discard
            </button>
            <button
              onClick={handleSaveBulk}
              disabled={savingBulk}
              className="flex-1 sm:flex-none bg-secondary hover:opacity-90 disabled:bg-outline-variant text-on-secondary font-bold h-10 px-6 rounded-xl transition-all scale-98 active:scale-95 flex items-center justify-center gap-2"
            >
              {savingBulk ? (
                <div className="w-4 h-4 border-2 border-on-secondary border-t-transparent rounded-full animate-spin" />
              ) : <Save className="w-4 h-4" />}
              Save All changes
            </button>
          </div>
        </div>
      )}
      {/* App Theme / Color Schema Panel */}
      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider font-headline">App Theme (Color Schema)</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Choose a color schema to personalize the POS interface.
            </p>
          </div>

          <div className="relative min-w-[260px]">
            {(() => {
              const lights = [
                { id: 'theme-default', name: 'Default Emerald', color: 'bg-[#006c49]' },
                { id: 'theme-ocean', name: 'Ocean Splash', color: 'bg-[#0284c7]' },
                { id: 'theme-sunset', name: 'Sunset Glow', color: 'bg-[#ea580c]' },
                { id: 'theme-lavender', name: 'Lavender Breeze', color: 'bg-[#7c3aed]' },
                { id: 'theme-forest', name: 'Forest Moss', color: 'bg-[#15803d]' },
                { id: 'theme-nordic', name: 'Nordic Frost', color: 'bg-[#1e40af]' },
                { id: 'theme-rose', name: 'Rose Blossom', color: 'bg-[#be123c]' },
                { id: 'theme-amber', name: 'Warm Amber', color: 'bg-[#b45309]' },
                { id: 'theme-plum', name: 'Royal Plum', color: 'bg-[#581c87]' },
                { id: 'theme-charcoal', name: 'Charcoal Minimal', color: 'bg-[#1e293b]' },
                { id: 'theme-crimson', name: 'Crimson Wine', color: 'bg-[#991b1b]' },
                { id: 'theme-sage', name: 'Sage Mint', color: 'bg-[#14532d]' },
                { id: 'theme-steel', name: 'Steel Blue', color: 'bg-[#1e3a8a]' },
                { id: 'theme-terracotta', name: 'Warm Terracotta', color: 'bg-[#7c2d12]' },
                { id: 'theme-sakura', name: 'Sakura Cherry', color: 'bg-[#db2777]' },
                { id: 'theme-citrus', name: 'Citrus Zest', color: 'bg-[#4d7c0f]' },
                { id: 'theme-midnight', name: 'Midnight Navy', color: 'bg-[#1e1b4b]' },
              ];
              const darks = [
                { id: 'theme-dark', name: 'Classic Dark', color: 'bg-[#10b981]' },
                { id: 'theme-eclipse', name: 'Midnight Eclipse', color: 'bg-[#a78bfa]' },
                { id: 'theme-abyss', name: 'Abyss Blue', color: 'bg-[#38bdf8]' },
                { id: 'theme-carbon', name: 'Carbon Gold', color: 'bg-[#fbbf24]' },
                { id: 'theme-emerald-night', name: 'Emerald Night', color: 'bg-[#34d399]' },
                { id: 'theme-rose-noir', name: 'Rose Noir', color: 'bg-[#fda4af]' },
              ];
              const customs = [
                { id: 'theme-custom', name: 'Create Custom Theme', color: 'bg-gradient-to-r from-rose-500 via-emerald-500 to-sky-500' },
              ];
              const current = [...lights, ...darks, ...customs].find(t => t.id === theme) || lights[0];

              return (
                <>
                  <button
                    type="button"
                    onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                    className="w-full h-11 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm font-bold text-on-surface flex items-center justify-between gap-2 shadow-sm transition-all hover:bg-surface-container-low"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${current.color}`} />
                      <span>{current.name}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isThemeDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isThemeDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsThemeDropdownOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-full sm:w-[320px] max-h-[350px] overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl z-40 p-2 space-y-3">
                        <div>
                          <div className="px-3 py-1 text-[9px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Light Themes</div>
                          <div className="grid grid-cols-1 gap-0.5 mt-1">
                            {lights.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  onChangeTheme?.(t.id);
                                  setIsThemeDropdownOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left hover:bg-surface-container transition-colors ${
                                  theme === t.id ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface'
                                }`}
                              >
                                <span className={`w-3 h-3 rounded-full shrink-0 ${t.color}`} />
                                <span className="truncate">{t.name}</span>
                                {theme === t.id && <span className="ml-auto text-secondary text-xs">✓</span>}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-outline-variant/50 pt-2">
                          <div className="px-3 py-1 text-[9px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Dark Themes</div>
                          <div className="grid grid-cols-1 gap-0.5 mt-1">
                            {darks.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  onChangeTheme?.(t.id);
                                  setIsThemeDropdownOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left hover:bg-surface-container transition-colors ${
                                  theme === t.id ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface'
                                }`}
                              >
                                <span className={`w-3 h-3 rounded-full shrink-0 ${t.color}`} />
                                <span className="truncate">{t.name}</span>
                                {theme === t.id && <span className="ml-auto text-secondary text-xs">✓</span>}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-outline-variant/50 pt-2">
                          <div className="px-3 py-1 text-[9px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Customization</div>
                          <div className="grid grid-cols-1 mt-1">
                            {customs.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  onChangeTheme?.(t.id);
                                  setIsThemeDropdownOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left hover:bg-surface-container transition-colors ${
                                  theme === t.id ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface'
                                }`}
                              >
                                <span className={`w-3 h-3 rounded-full shrink-0 ${t.color}`} />
                                <span className="truncate">{t.name}</span>
                                {theme === t.id && <span className="ml-auto text-secondary text-xs">✓</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        {theme === 'theme-custom' && (
          <div className="pt-4 border-t border-outline-variant space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Color Controls (Left Column) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Custom Primary Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draftPrimary}
                        onChange={(e) => setDraftPrimary(e.target.value)}
                        className="w-10 h-10 border border-outline-variant rounded-lg cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={draftPrimary}
                        onChange={(e) => setDraftPrimary(e.target.value)}
                        className="h-10 px-3 border border-outline-variant bg-surface rounded-xl text-xs font-mono text-on-surface uppercase w-32 focus:outline-none focus:ring-2 focus:ring-secondary"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Custom Secondary Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draftSecondary}
                        onChange={(e) => setDraftSecondary(e.target.value)}
                        className="w-10 h-10 border border-outline-variant rounded-lg cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={draftSecondary}
                        onChange={(e) => setDraftSecondary(e.target.value)}
                        className="h-10 px-3 border border-outline-variant bg-surface rounded-xl text-xs font-mono text-on-surface uppercase w-32 focus:outline-none focus:ring-2 focus:ring-secondary"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Custom Background Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draftBackground}
                        onChange={(e) => setDraftBackground(e.target.value)}
                        className="w-10 h-10 border border-outline-variant rounded-lg cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={draftBackground}
                        onChange={(e) => setDraftBackground(e.target.value)}
                        className="h-10 px-3 border border-outline-variant bg-surface rounded-xl text-xs font-mono text-on-surface uppercase w-32 focus:outline-none focus:ring-2 focus:ring-secondary"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Custom Surface Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draftSurface}
                        onChange={(e) => setDraftSurface(e.target.value)}
                        className="w-10 h-10 border border-outline-variant rounded-lg cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={draftSurface}
                        onChange={(e) => setDraftSurface(e.target.value)}
                        className="h-10 px-3 border border-outline-variant bg-surface rounded-xl text-xs font-mono text-on-surface uppercase w-32 focus:outline-none focus:ring-2 focus:ring-secondary"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">Custom Text Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="w-10 h-10 border border-outline-variant rounded-lg cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="h-10 px-3 border border-outline-variant bg-surface rounded-xl text-xs font-mono text-on-surface uppercase w-32 focus:outline-none focus:ring-2 focus:ring-secondary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview Card (Right Column) */}
              <div className="lg:col-span-5 flex flex-col gap-3 border border-outline-variant/60 rounded-xl p-4 shadow-sm"
                style={{ backgroundColor: draftBackground }}
              >
                <div className="flex justify-between items-center pb-2 border-b border-dashed" style={{ borderColor: `${draftText}26` }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider font-mono" style={{ color: `${draftText}b3` }}>Live Theme Preview</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${draftSecondary}33`, color: draftSecondary }}>Active Category</span>
                </div>
                
                {/* Sample Header */}
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg border" style={{ backgroundColor: draftSurface, borderColor: `${draftText}1f` }}>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: draftPrimary }} />
                  <span className="text-xs font-bold" style={{ color: draftText }}>Cohortix POS Preview</span>
                </div>

                {/* Sample Order Card */}
                <div className="p-3.5 rounded-xl border space-y-2.5" style={{ backgroundColor: draftSurface, borderColor: `${draftText}1f` }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold font-headline" style={{ color: draftText }}>#1024 - John Doe</h4>
                      <p className="text-[9px]" style={{ color: `${draftText}99` }}>Ordered 3 mins ago</p>
                    </div>
                    <span className="text-xs font-black font-mono" style={{ color: draftText }}>₹150</span>
                  </div>
                  
                  {/* Item tag */}
                  <div className="flex items-center justify-between text-[10px] py-1 border-t" style={{ borderColor: `${draftText}15` }}>
                    <span style={{ color: draftText }}>1x Special Pyali Gola</span>
                    <span className="font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wide" style={{ backgroundColor: `${draftPrimary}1a`, color: draftPrimary }}>
                      Special
                    </span>
                  </div>

                  <div className="pt-1 flex gap-2">
                    <button type="button" className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center text-white cursor-default" style={{ backgroundColor: draftPrimary }}>
                      Done
                    </button>
                    <button type="button" className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-center border cursor-default bg-transparent" style={{ borderColor: draftSecondary, color: draftSecondary }}>
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-4 border-t border-outline-variant flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {hasUnsavedThemeChanges ? (
                  <span className="text-xs text-amber-600 font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Unsaved changes in custom colors (Previewing locally)
                  </span>
                ) : (
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Custom theme synced
                  </span>
                )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setDraftPrimary(customPrimary);
                    setDraftSecondary(customSecondary);
                    setDraftBackground(customBackground);
                    setDraftSurface(customSurface);
                    setDraftText(customText);
                  }}
                  disabled={!hasUnsavedThemeChanges}
                  className="px-4 h-10 border border-outline-variant bg-surface text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-xl text-xs transition-colors"
                >
                  Reset Draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeCustomPrimary?.(draftPrimary);
                    onChangeCustomSecondary?.(draftSecondary);
                    onChangeCustomBackground?.(draftBackground);
                    onChangeCustomSurface?.(draftSurface);
                    onChangeCustomText?.(draftText);
                  }}
                  disabled={!hasUnsavedThemeChanges}
                  className="flex-1 sm:flex-none bg-secondary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-on-secondary font-bold h-10 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-xs shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  Save & Apply Theme
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Offers & Discount Panel */}
      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider font-headline">POC Offers (Admin)</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Offers go live only after pressing Apply Offers.
            </p>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() =>
                setPricingDraft((prev) => ({
                  ...prev,
                  bogoEnabled: false,
                }))
              }
              className={`px-3 h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-colors scale-98 active:scale-95 ${!pricingDraft.bogoEnabled
                ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
                : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
                }`}
            >
              Offer Off
            </button>
            <button
              type="button"
              onClick={() =>
                setPricingDraft((prev) => ({
                  ...prev,
                  bogoEnabled: true,
                  bogoType: 'b1g1',
                }))
              }
              className={`px-3 h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-colors scale-98 active:scale-95 ${pricingDraft.bogoEnabled && pricingDraft.bogoType === 'b1g1'
                ? 'bg-secondary-container text-on-secondary-container border-transparent shadow-sm'
                : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
                }`}
            >
              Buy 1 Get 1
            </button>
            <button
              type="button"
              onClick={() =>
                setPricingDraft((prev) => ({
                  ...prev,
                  bogoEnabled: true,
                  bogoType: 'b2g1',
                }))
              }
              className={`px-3 h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-colors scale-98 active:scale-95 ${pricingDraft.bogoEnabled && pricingDraft.bogoType === 'b2g1'
                ? 'bg-secondary-container text-on-secondary-container border-transparent shadow-sm'
                : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
                }`}
            >
              Buy 2 Get 1
            </button>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <button
              type="button"
              onClick={() => setPricingDraft({ discountPercent: 0, bogoEnabled: false, bogoType: 'b2g1' })}
              className="px-3 h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container transition-colors scale-98 active:scale-95"
            >
              Reset Offers
            </button>
            <button
              type="button"
              disabled={!hasPricingChanges || savingOffers}
              onClick={() => { void handleApplyOffers(); }}
              className="px-3 h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-transparent bg-secondary text-on-secondary hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed scale-98 active:scale-95 shadow-sm"
            >
              {savingOffers ? 'Applying...' : 'Apply Offers'}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
            Whole Menu Discount (%)
          </label>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-[1fr_auto] gap-3">
            <input
              type="number"
              min="0"
              max="100"
              value={pricingDraft.discountPercent}
              onChange={(e) => {
                const next = Number(e.target.value);
                const safeValue = Number.isFinite(next) ? Math.min(100, Math.max(0, Math.round(next))) : 0;
                setPricingDraft((prev) => ({ ...prev, discountPercent: safeValue }));
              }}
              className="h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            />
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 15].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPricingDraft((prev) => ({ ...prev, discountPercent: pct }))}
                  className="h-10 px-3 rounded-xl text-xs font-bold border border-outline-variant bg-surface-container hover:bg-surface-container-high transition-colors scale-98 active:scale-95 text-on-surface"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between flex-wrap gap-2 text-[10px] text-slate-500 mt-2 font-medium">
            <p>
              Live: <span className="font-bold text-secondary">{pricingRule.discountPercent}% off</span> {pricingRule.bogoEnabled ? `+ ${pricingRule.bogoType === 'b1g1' ? 'Buy 1 Get 1' : 'Buy 2 Get 1'} enabled` : ''}
            </p>
            <p>
              Draft: <span className="font-bold text-secondary">{pricingDraft.discountPercent}% off</span> {pricingDraft.bogoEnabled ? `+ ${pricingDraft.bogoType === 'b1g1' ? 'Buy 1 Get 1' : 'Buy 2 Get 1'} enabled` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Add / Edit Form */}
      {!isBulkEdit && (
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider mb-4 flex items-center gap-2">
            {editingId ? <Edit2 className="w-4.5 h-4.5 text-secondary" /> : <Plus className="w-4.5 h-4.5 text-secondary" />}
            {editingId ? 'Edit Menu Item' : 'Add New Item'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">Item Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-10 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                placeholder="e.g. Kala Khatta"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-2">Category</label>
              <div className="flex gap-2 flex-wrap">
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() =>
                      setForm((prev) => {
                        if (isStickRestrictedCategory(cat)) {
                          const migratedDishPrice = prev.dishPrice > 0 ? prev.dishPrice : prev.stickPrice;
                          return { ...prev, category: cat, dishPrice: migratedDishPrice, stickPrice: 0 };
                        }
                        return { ...prev, category: cat };
                      })
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all scale-98 active:scale-95 ${form.category === cat
                      ? 'bg-secondary-container text-on-secondary-container border-transparent shadow-sm'
                      : 'bg-surface text-on-surface-variant border-outline-variant hover:bg-surface-container'
                      }`}
                  >
                    <span className="flex items-center gap-1.5 justify-center">
                      <CategoryIcon category={cat} className="w-3.5 h-3.5" />
                      <span>{cat}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddNewCategory}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-dashed border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors flex items-center gap-1 scale-98 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New
                </button>
              </div>
            </div>

            {/* Prices section */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                Prices <span className="text-slate-400 font-normal normal-case">(fill at least one)</span>
              </label>

              <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface/25">
                {/* Stick / Dish row */}
                <div className="bg-surface-container px-4 py-2 border-b border-outline-variant flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <StickIcon className="w-4 h-4 text-secondary" />
                    <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-headline">
                      {stickAllowed ? 'Stick / Dish Option' : 'Dish Only'}
                    </span>
                  </div>
                  {/* Variant mode selector */}
                  {stickAllowed && !hasGolaPrices && (
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { value: 'both', label: 'Both' },
                          { value: 'stick_only', label: 'Stick Only' },
                          { value: 'dish_only', label: 'Dish Only' },
                        ] as { value: VariantMode; label: string }[]
                      ).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, variantMode: value }))}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                            form.variantMode === value
                              ? 'bg-secondary-container text-on-secondary-container border-transparent shadow-sm'
                              : 'bg-surface text-on-surface-variant border-outline-variant hover:bg-surface-container'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={`grid gap-px bg-outline-variant/40 ${stickAllowed && form.variantMode !== 'dish_only' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {stickAllowed && form.variantMode !== 'dish_only' && (
                    <div className="bg-surface-container-lowest p-4">
                      <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider mb-1">Stick Price (₹)</label>
                      <input
                        type="number"
                        value={form.stickPrice || ''}
                        onChange={(e) => setForm({ ...form, stickPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full h-10 px-3 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                        min="0"
                        placeholder="₹0"
                      />
                    </div>
                  )}
                  {form.variantMode !== 'stick_only' && (
                    <div className={`bg-surface-container-lowest p-4 transition-opacity ${hasGolaPrices ? 'opacity-30 pointer-events-none' : ''}`}>
                      <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                        Dish Price (₹) {hasGolaPrices && <span className="text-[9px] text-rose-600 ml-1 font-normal normal-case">(Overridden by Gola Variants)</span>}
                      </label>
                      <input
                        type="number"
                        value={form.dishPrice || ''}
                        disabled={hasGolaPrices}
                        onChange={(e) => setForm({ ...form, dishPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full h-10 px-3 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface disabled:bg-surface-container disabled:text-outline"
                        min="0"
                        placeholder="₹0"
                      />
                    </div>
                  )}
                </div>

                {/* Gola variants */}
                <div className={`transition-opacity ${hasDishPrice ? 'opacity-30 pointer-events-none bg-surface-container/20' : ''}`}>
                  <div className="bg-surface-container px-4 py-2 border-y border-outline-variant flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <IceCubeIcon className="w-4 h-4 text-secondary" />
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-headline">Dish Gola Variants</span>
                    </div>
                    {hasDishPrice && <span className="text-[9px] text-rose-600 font-bold uppercase tracking-wider">Clear "Dish Price" to edit variants</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-outline-variant/40">
                    {GOLA_VARIANTS.filter((v) => v !== 'Stick' || !isStickRestrictedCategory(form.category)).map((v) => (
                      <div key={v} className="bg-surface-container-lowest p-4">
                        <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider mb-1">{v} (₹)</label>
                        <input
                          type="number"
                          value={form.golaVariantPrices[v] || ''}
                          disabled={hasDishPrice}
                          onChange={(e) => setGola(v, parseFloat(e.target.value) || 0)}
                          className="w-full h-10 px-3 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface disabled:bg-surface-container/20 disabled:text-outline"
                          min="0"
                          placeholder="₹0"
                        />
                      </div>
                    ))}
                  </div>
                  {hasGolaPrices && (
                    <div className="bg-surface-container-lowest px-4 py-3 border-t border-outline-variant">
                      <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                        Default Variant <span className="text-slate-400 font-normal normal-case">(Shown as default when selecting Dish)</span>
                      </label>
                      <select
                        value={form.defaultGolaVariant}
                        onChange={(e) => setForm({ ...form, defaultGolaVariant: e.target.value as GolaVariant })}
                        className="w-full h-10 px-3 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                      >
                        {GOLA_VARIANTS.filter((v) => v !== 'Stick' || !isStickRestrictedCategory(form.category)).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {!atLeastOnePrice && saveError && (
                <p className="flex items-center gap-1.5 text-rose-600 text-xs mt-2 font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {saveError}
                </p>
              )}
            </div>

            {saveError && atLeastOnePrice && (
              <p className="flex items-center gap-1.5 text-rose-600 text-xs font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                {saveError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-11 bg-secondary text-on-secondary font-bold rounded-xl transition-all scale-98 active:scale-95 hover:opacity-90 flex items-center justify-center gap-2 shadow-sm text-sm"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-on-secondary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? 'Saving…' : editingId ? 'Update Item' : 'Save Item'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 h-11 bg-surface-container hover:bg-surface-container-high text-on-surface font-bold rounded-xl transition-colors scale-98 active:scale-95 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Categories & Items List */}
      <div className="space-y-6">
        {allCategories.map((category) => {
          const items = menuItems.filter((item) => item.category === category);
          return (
            <div key={category} className={`bg-surface-container-lowest rounded-xl shadow-sm border ${items.length === 0 ? 'border-dashed border-outline-variant/60 opacity-70' : 'border-outline-variant'} overflow-hidden`}>
              <div className="bg-surface-container px-4 py-3 border-b border-outline-variant flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-on-surface font-headline uppercase tracking-wider text-xs flex items-center gap-1.5">
                    <CategoryIcon category={category} className="w-4 h-4 text-secondary" />
                    <span>{category}</span>
                    {items.length === 0 && <span className="text-[9px] bg-outline-variant text-on-surface-variant px-2 py-0.5 rounded-full font-bold font-mono">EMPTY</span>}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { void handleRenameCategory(category); }}
                    disabled={isBulkEdit || renamingCategory !== null}
                    className="border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-bold bg-surface text-on-surface-variant hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed scale-98 active:scale-95 transition-all"
                  >
                    {renamingCategory === category ? 'Renaming...' : 'Rename Category'}
                  </button>
                  {items.length === 0 && !DEFAULT_CATEGORIES.includes(category) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      className="border border-rose-200 text-rose-600 rounded-lg px-3 py-1.5 text-xs font-bold bg-surface hover:bg-rose-50 transition-colors flex items-center gap-1 scale-98 active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Empty Category
                    </button>
                  )}
                  {category === 'Regular' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Default Variant:</span>
                      <select
                        value=""
                        onChange={async (e) => {
                          const newVariant = e.target.value as GolaVariant;
                          if (!newVariant) return;

                          const itemsToUpdate = items.filter(
                            (i) => i.hasGolaVariants && i.defaultGolaVariant !== newVariant
                          );
                          if (itemsToUpdate.length === 0) {
                            alert(`All items with variants in ${category} are already set to ${newVariant}.`);
                            return;
                          }

                          if (
                            !window.confirm(
                              `Set default variant to "${newVariant}" for ${itemsToUpdate.length} dish items?`
                            )
                          ) {
                            return;
                          }

                          try {
                            await Promise.all(
                              itemsToUpdate.map(async (item) => {
                                const { id: itemId, ...rest } = item;
                                return onUpdate(itemId, { ...rest, defaultGolaVariant: newVariant });
                              })
                            );
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Failed to save some items');
                          }
                        }}
                        className="border border-outline-variant rounded-lg px-2 py-1 focus:ring-1 focus:ring-secondary outline-none text-xs font-bold text-on-surface bg-surface"
                      >
                        <option value="" disabled>-- Select Variant --</option>
                        {GOLA_VARIANTS.filter((v) => v !== 'Stick' || !isStickRestrictedCategory(category)).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              {items.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-400 text-xs font-medium">
                  No items in this category yet. Add a menu item above.
                </div>
              ) : (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface/20">
                {items.map((item) => {
                  const draftForm = bulkDrafts[item.id];
                  const isEdited = !!draftForm;
                  const form = draftForm ? (draftForm as FormState) : menuItemToForm(item);
                  const stickAllowed = !isStickRestrictedCategory(form.category);
                  const hasGolaPrices = GOLA_VARIANTS.some((v) => form.golaVariantPrices && form.golaVariantPrices[v] > 0);
                  const isAvailable = mockAvailable[item.id] !== false;

                  if (isBulkEdit) {
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-xl border flex flex-col gap-3 transition-colors ${
                          isEdited
                            ? 'bg-secondary-container/10 border-secondary'
                            : 'bg-surface-container-lowest border-outline-variant hover:border-outline'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-on-surface text-xs font-headline">{item.name}</div>
                          {isEdited && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-on-secondary-container bg-secondary-container px-2 py-0.5 rounded shadow-sm">
                              Changed
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {stickAllowed && (
                            <div>
                              <label className="block text-[9px] font-mono font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Stick (₹)</label>
                              <input
                                type="number"
                                min="0"
                                value={form.stickPrice || ''}
                                onChange={(e) => updateBulkDraft(item.id, 'stickPrice', parseFloat(e.target.value) || 0)}
                                className="w-full h-8 px-2 border border-outline-variant bg-surface rounded-lg text-xs focus:ring-1 focus:ring-secondary text-on-surface"
                              />
                            </div>
                          )}
                          <div className={hasGolaPrices ? 'opacity-50' : ''}>
                            <label className="block text-[9px] font-mono font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Dish (₹)</label>
                            <input
                              type="number"
                              min="0"
                              disabled={hasGolaPrices}
                              value={form.dishPrice || ''}
                              onChange={(e) => updateBulkDraft(item.id, 'dishPrice', parseFloat(e.target.value) || 0)}
                              className="w-full h-8 px-2 border border-outline-variant bg-surface rounded-lg text-xs focus:ring-1 focus:ring-secondary disabled:bg-surface-container text-on-surface"
                            />
                          </div>
                          {item.hasGolaVariants && form.golaVariantPrices &&
                            GOLA_VARIANTS.filter((v) => v !== 'Stick' || !isStickRestrictedCategory(form.category)).map((v) => (
                              <div key={v} className="col-span-2">
                                <label className="block text-[9px] font-mono font-bold text-on-surface-variant mb-1 uppercase tracking-wider truncate" title={v}>
                                  {v} (₹)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={form.golaVariantPrices![v] || ''}
                                  onChange={(e) => updateBulkGolaDraft(item.id, v, parseFloat(e.target.value) || 0)}
                                  className="w-full h-8 px-2 border border-outline-variant bg-surface rounded-lg text-xs focus:ring-1 focus:ring-secondary text-on-surface"
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className={`bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex items-center justify-between gap-4 transition-all duration-150 hover:scale-[1.01] ${
                        isAvailable ? 'opacity-100' : 'opacity-60 bg-surface/10'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-on-surface font-headline text-sm truncate">{item.name}</h3>
                          {!isAvailable && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-on-error-container bg-error-container px-2 py-0.5 rounded">
                              OOS
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-2 flex flex-wrap gap-x-2.5 gap-y-1 font-medium">
                          {item.hasVariants && (
                            <>
                              {!isStickRestrictedCategory(item.category) && item.price > 0 && (
                                <span className="bg-surface px-1.5 py-0.5 rounded border border-outline-variant/60 inline-flex items-center gap-1">
                                  <StickIcon className="w-3.5 h-3.5 text-secondary" />
                                  <span>Stick: ₹{item.price}</span>
                                </span>
                              )}
                              {((item.dishPrice && item.dishPrice > 0) || isStickRestrictedCategory(item.category)) && (
                                <span className="bg-surface px-1.5 py-0.5 rounded border border-outline-variant/60 inline-flex items-center gap-1">
                                  <DishIcon className="w-3.5 h-3.5 text-secondary" />
                                  <span>Dish: ₹{item.dishPrice && item.dishPrice > 0 ? item.dishPrice : item.price}</span>
                                </span>
                              )}
                            </>
                          )}
                           {item.hasGolaVariants && item.golaVariantPrices &&
                            GOLA_VARIANTS.filter((v) => item.golaVariantPrices![v] > 0 && (v !== 'Stick' || !isStickRestrictedCategory(item.category))).map((v) => (
                              <span key={v} className="bg-surface px-1.5 py-0.5 rounded border border-outline-variant/60 inline-flex items-center gap-1">
                                <IceCubeIcon className="w-3.5 h-3.5 text-secondary" />
                                <span>{v}: ₹{item.golaVariantPrices![v]}</span>
                              </span>
                            ))
                          }
                          {!item.hasVariants && !item.hasGolaVariants && (
                            <span className="bg-surface px-1.5 py-0.5 rounded border border-outline-variant/60">₹{item.price}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3.5 shrink-0">
                        {/* Styled Availability Toggle Switch */}
                        <div className="relative inline-block w-[50px] align-middle select-none">
                          <input
                            type="checkbox"
                            checked={isAvailable}
                            onChange={() => handleToggleAvailable(item.id)}
                            className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 border-outline-variant appearance-none cursor-pointer z-10 opacity-0"
                            id={`toggle-${item.id}`}
                          />
                          <label
                            className="toggle-label block overflow-hidden h-7 rounded-full bg-outline-variant cursor-pointer"
                            htmlFor={`toggle-${item.id}`}
                          ></label>
                        </div>

                        {/* Actions group */}
                        <div className="flex items-center gap-1 border-l border-outline-variant/50 pl-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1.5 text-secondary hover:bg-secondary-container/20 rounded-lg transition-colors scale-98 active:scale-95"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete "${item.name}" permanently?`)) onDelete(item.id);
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors scale-98 active:scale-95"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
