import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Save, Tag, AlertCircle } from 'lucide-react';
import { MenuItem, GolaVariant, PricingRule } from '../types';
import { isStickRestrictedCategory } from '../utils/category';

interface MenuManagerProps {
  menuItems: MenuItem[];
  onAdd: (item: Omit<MenuItem, 'id'>) => Promise<void>;
  onUpdate: (id: string, item: Omit<MenuItem, 'id'>) => Promise<void>;
  onDelete: (id: string) => void;
  pricingRule: PricingRule;
  onUpdatePricingRule: (next: Partial<PricingRule>) => Promise<void>;
}

const GOLA_VARIANTS: GolaVariant[] = ['Ice Cream Only', 'Dry Fruit Only', 'Ice Cream + Dry Fruit', 'Plain'];

const CATEGORIES = ['Regular', 'Special', 'Pyali'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_ICONS: Record<Category, string> = {
  Regular: '🍡',
  Special: '⭐',
  Pyali: '🍧',
};

interface FormState {
  name: string;
  category: string;
  stickPrice: number;
  dishPrice: number;
  golaVariantPrices: Record<GolaVariant, number>;
  defaultGolaVariant: GolaVariant;
}

const defaultForm = (): FormState => ({
  name: '',
  category: 'Regular',
  stickPrice: 0,
  dishPrice: 0,
  golaVariantPrices: {
    'Ice Cream Only': 0,
    'Dry Fruit Only': 0,
    'Ice Cream + Dry Fruit': 0,
    'Plain': 0,
  },
  defaultGolaVariant: 'Plain',
});

function formToMenuItem(f: FormState): Omit<MenuItem, 'id'> {
  const stickAllowed = !isStickRestrictedCategory(f.category);
  const hasGola = GOLA_VARIANTS.some((v) => f.golaVariantPrices[v] > 0);
  const normalizedStickPrice = stickAllowed ? f.stickPrice : 0;
  const normalizedDishPrice = hasGola ? undefined : (f.dishPrice > 0 ? f.dishPrice : undefined);
  const hasStickDish = normalizedStickPrice > 0 || (normalizedDishPrice ?? 0) > 0;
  const basePrice = normalizedStickPrice > 0
    ? normalizedStickPrice
    : hasGola
      ? f.golaVariantPrices['Plain']
      : (normalizedDishPrice ?? 0);

  // If it has Gola Variants, dishPrice should be undefined to avoid mapping issues.
  const clearDishPrice = normalizedDishPrice;

  return {
    name: f.name.trim(),
    price: basePrice,
    dishPrice: clearDishPrice,
    category: f.category,
    hasVariants: hasStickDish || hasGola,
    hasGolaVariants: hasGola,
    golaVariantPrices: hasGola ? { ...f.golaVariantPrices } : undefined,
    defaultGolaVariant: hasGola ? f.defaultGolaVariant : undefined,
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
    },
    defaultGolaVariant: item.defaultGolaVariant || 'Plain',
  };
}

export function MenuManager({
  menuItems,
  onAdd,
  onUpdate,
  onDelete,
  pricingRule,
  onUpdatePricingRule,
}: MenuManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [savingOffers, setSavingOffers] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pricingDraft, setPricingDraft] = useState<PricingRule>(pricingRule);

  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, Partial<FormState>>>({});
  const [savingBulk, setSavingBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    setPricingDraft(pricingRule);
  }, [pricingRule]);

  const allCategories = Array.from(
    new Set([...CATEGORIES, ...menuItems.map((i) => i.category)])
  );

  const hasGolaPrices = GOLA_VARIANTS.some((v) => form.golaVariantPrices[v] > 0);
  const hasDishPrice = form.dishPrice > 0;
  const stickAllowed = !isStickRestrictedCategory(form.category);

  const atLeastOnePrice =
    (stickAllowed && form.stickPrice > 0) ||
    form.dishPrice > 0 ||
    GOLA_VARIANTS.some((v) => form.golaVariantPrices[v] > 0);

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

  return (
    <div className="mobile-bottom-offset md:pb-0 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Menu Management</h2>
        <button
          onClick={handleToggleBulkEdit}
          disabled={savingBulk}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${isBulkEdit
            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200'
            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200'
            }`}
        >
          {isBulkEdit ? 'Cancel Bulk Edit' : 'Bulk Edit'}
        </button>
      </div>

      {isBulkEdit && Object.keys(bulkDrafts).length > 0 && (
        <div className="sticky top-4 z-10 bg-white p-4 border border-slate-200 shadow-xl rounded-2xl flex flex-wrap gap-4 justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <span className="font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg text-sm border border-indigo-100">
              {Object.keys(bulkDrafts).length} item(s) changed
            </span>
            {bulkError && <span className="text-sm text-rose-500 font-medium flex-1">{bulkError}</span>}
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
              className="flex-1 sm:flex-none px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSaveBulk}
              disabled={savingBulk}
              className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {savingBulk ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : <Save className="w-4 h-4" />}
              Save All changes
            </button>
          </div>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-slate-800">POC Offers (Admin)</h3>
            <p className="text-sm text-slate-500 mt-1">
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
              className={`px-3 min-h-11 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors ${!pricingDraft.bogoEnabled
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-slate-100 text-slate-600 border-slate-200'
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
              className={`px-3 min-h-11 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors ${pricingDraft.bogoEnabled && pricingDraft.bogoType === 'b1g1'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-200'
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
              className={`px-3 min-h-11 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors ${pricingDraft.bogoEnabled && pricingDraft.bogoType === 'b2g1'
                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
            >
              Buy 2 Get 1
            </button>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <button
              type="button"
              onClick={() => setPricingDraft({ discountPercent: 0, bogoEnabled: false, bogoType: 'b2g1' })}
              className="px-3 min-h-11 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Reset Offers
            </button>
            <button
              type="button"
              disabled={!hasPricingChanges || savingOffers}
              onClick={() => { void handleApplyOffers(); }}
              className="px-3 min-h-11 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingOffers ? 'Applying...' : 'Apply Offers'}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Whole Menu Discount (%)
          </label>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-[1fr_auto] gap-2">
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
              className="h-11 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 15].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPricingDraft((prev) => ({ ...prev, discountPercent: pct }))}
                  className="h-11 px-3 rounded-xl text-sm font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Live: {pricingRule.discountPercent}% off {pricingRule.bogoEnabled ? `+ ${pricingRule.bogoType === 'b1g1' ? 'Buy 1 Get 1' : 'Buy 2 Get 1'} enabled` : ''}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Draft: {pricingDraft.discountPercent}% off {pricingDraft.bogoEnabled ? `+ ${pricingDraft.bogoType === 'b1g1' ? 'Buy 1 Get 1' : 'Buy 2 Get 1'} enabled` : ''}
          </p>
        </div>
      </div>

      {/* Form */}
      {!isBulkEdit && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            {editingId ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <Plus className="w-5 h-5 text-indigo-500" />}
            {editingId ? 'Edit Menu Item' : 'Add New Item'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Kala Khatta"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map((cat) => (
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
                    className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${form.category === cat
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {CATEGORY_ICONS[cat as Category] ?? '🍡'} {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Prices — all in one section */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Prices{' '}
                <span className="text-slate-400 font-normal">(fill at least one)</span>
              </label>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                {/* Stick / Dish row */}
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                  <span className="text-base">🍡</span>
                  <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                    {stickAllowed ? 'Stick / Dish' : 'Dish Only'}
                  </span>
                </div>
                <div className={`grid gap-px bg-slate-200 ${stickAllowed ? 'grid-cols-1 min-[375px]:grid-cols-2' : 'grid-cols-1'}`}>
                  {stickAllowed && (
                    <div className="bg-white p-4">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Stick Price (₹)</label>
                      <input
                        type="number"
                        value={form.stickPrice || ''}
                        onChange={(e) => setForm({ ...form, stickPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        min="0"
                        placeholder="₹0"
                      />
                    </div>
                  )}
                  <div className={`bg-white p-4 transition-opacity ${hasGolaPrices ? 'opacity-30 pointer-events-none' : ''}`}>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      Dish Price (₹) {hasGolaPrices && <span className="text-[10px] text-rose-500 ml-1 font-normal">(Hidden by Gola Variants)</span>}
                    </label>
                    <input
                      type="number"
                      value={form.dishPrice || ''}
                      disabled={hasGolaPrices}
                      onChange={(e) => setForm({ ...form, dishPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                      min="0"
                      placeholder="₹0"
                    />
                  </div>
                </div>

                {/* Gola variants */}
                <div className={`transition-opacity ${hasDishPrice ? 'opacity-30 pointer-events-none bg-slate-100' : ''}`}>
                  <div className="bg-slate-50 px-4 py-2 border-y border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🧊</span>
                      <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">Dish Gola Variants</span>
                    </div>
                    {hasDishPrice && <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider">Clear "Dish Price" to use variants</span>}
                  </div>
                  <div className="grid grid-cols-1 min-[375px]:grid-cols-2 gap-px bg-slate-200">
                    {GOLA_VARIANTS.map((v) => (
                      <div key={v} className="bg-white p-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1">{v}</label>
                        <input
                          type="number"
                          value={form.golaVariantPrices[v] || ''}
                          disabled={hasDishPrice}
                          onChange={(e) => setGola(v, parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:bg-transparent disabled:text-slate-400"
                          min="0"
                          placeholder="₹0"
                        />
                      </div>
                    ))}
                  </div>
                  {hasGolaPrices && (
                    <div className="bg-white px-4 py-3 border-t border-slate-200">
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        Default Variant <span className="text-slate-400 font-normal">(Shown as default when selecting Dish)</span>
                      </label>
                      <select
                        value={form.defaultGolaVariant}
                        onChange={(e) => setForm({ ...form, defaultGolaVariant: e.target.value as GolaVariant })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                      >
                        {GOLA_VARIANTS.map((v) => (
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
                <p className="flex items-center gap-1.5 text-rose-500 text-sm mt-2 font-medium">
                  <AlertCircle className="w-4 h-4" />
                  {saveError}
                </p>
              )}
            </div>

            {saveError && atLeastOnePrice && (
              <p className="flex items-center gap-1.5 text-rose-500 text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                {saveError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-11 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 touch-manipulation"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {saving ? 'Saving…' : editingId ? 'Update Item' : 'Save Item'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors touch-manipulation"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="space-y-8">
        {allCategories.map((category) => {
          const items = menuItems.filter((item) => item.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-slate-400" />
                  <h3 className="font-bold text-slate-700 uppercase tracking-wider text-sm">
                    {(CATEGORY_ICONS as Record<string, string>)[category] ?? '🍡'} {category}
                  </h3>
                </div>
                {category === 'Regular' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Set Default Variant:</span>
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
                      className="border border-slate-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-medium text-slate-700 bg-white"
                    >
                      <option value="" disabled>-- Select Variant --</option>
                      {GOLA_VARIANTS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => {
                  const draftForm = bulkDrafts[item.id];
                  const isEdited = !!draftForm;
                  const form = draftForm ? (draftForm as FormState) : menuItemToForm(item);
                  const stickAllowed = !isStickRestrictedCategory(form.category);
                  const hasGolaPrices = GOLA_VARIANTS.some((v) => form.golaVariantPrices && form.golaVariantPrices[v] > 0);

                  if (isBulkEdit) {
                    return (
                      <div
                        key={item.id}
                        className={`p-4 sm:px-6 flex flex-col gap-3 transition-colors ${isEdited ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                          {isEdited && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
                              Edited
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 min-[480px]:grid-cols-4 lg:grid-cols-6 gap-3">
                          {stickAllowed && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Stick ₹</label>
                              <input
                                type="number"
                                min="0"
                                value={form.stickPrice || ''}
                                onChange={(e) => updateBulkDraft(item.id, 'stickPrice', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                            </div>
                          )}
                          <div className={hasGolaPrices ? 'opacity-50' : ''}>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Dish ₹</label>
                            <input
                              type="number"
                              min="0"
                              disabled={hasGolaPrices}
                              value={form.dishPrice || ''}
                              onChange={(e) => updateBulkDraft(item.id, 'dishPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 bg-white"
                            />
                          </div>
                          {item.hasGolaVariants && form.golaVariantPrices &&
                            GOLA_VARIANTS.map((v) => (
                              <div key={v}>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1 truncate" title={v}>
                                  {v} ₹
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={form.golaVariantPrices![v] || ''}
                                  onChange={(e) => updateBulkGolaDraft(item.id, v, parseFloat(e.target.value) || 0)}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
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
                      className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{item.name}</div>
                        <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {item.hasVariants && (
                            <>
                              {!isStickRestrictedCategory(item.category) && item.price > 0 && <span>🍡 Stick: ₹{item.price}</span>}
                              {((item.dishPrice && item.dishPrice > 0) || isStickRestrictedCategory(item.category)) && (
                                <span>🥣 Dish: ₹{item.dishPrice && item.dishPrice > 0 ? item.dishPrice : item.price}</span>
                              )}
                            </>
                          )}
                          {item.hasGolaVariants && item.golaVariantPrices &&
                            GOLA_VARIANTS.filter((v) => item.golaVariantPrices![v] > 0).map((v) => (
                              <span key={v}>🧊 {v}: ₹{item.golaVariantPrices![v]}</span>
                            ))
                          }
                          {!item.hasVariants && !item.hasGolaVariants && (
                            <span>₹{item.price}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete ${item.name}?`)) onDelete(item.id);
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
