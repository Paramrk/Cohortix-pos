import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Save, Tag } from 'lucide-react';
import { MenuItem, GolaVariant } from '../types';

interface MenuManagerProps {
  menuItems: MenuItem[];
  onAdd: (item: Omit<MenuItem, 'id'>) => void;
  onUpdate: (id: string, item: Omit<MenuItem, 'id'>) => void;
  onDelete: (id: string) => void;
}

const GOLA_VARIANTS: GolaVariant[] = ['Ice Cream Only', 'Dry Fruit Only', 'Ice Cream + Dry Fruit', 'Plain'];

const defaultForm = (): Omit<MenuItem, 'id'> => ({
  name: '',
  price: 0,
  category: 'Regular',
  hasVariants: false,
  hasGolaVariants: false,
  dishPrice: 0,
  golaVariantPrices: {
    'Ice Cream Only': 0,
    'Dry Fruit Only': 0,
    'Ice Cream + Dry Fruit': 0,
    'Plain': 0,
  },
});

export function MenuManager({ menuItems, onAdd, onUpdate, onDelete }: MenuManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<MenuItem, 'id'>>(defaultForm());

  const categories = Array.from(new Set(menuItems.map((i) => i.category)));

  const setVariantType = (type: 'none' | 'stickDish' | 'gola') => {
    setFormData((f) => ({
      ...f,
      hasVariants: type === 'stickDish',
      hasGolaVariants: type === 'gola',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || formData.price <= 0) return;
    if (editingId) {
      onUpdate(editingId, formData);
      setEditingId(null);
    } else {
      onAdd(formData);
    }
    setFormData(defaultForm());
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setFormData({
      name: item.name,
      price: item.price,
      category: item.category,
      hasVariants: item.hasVariants || false,
      hasGolaVariants: item.hasGolaVariants || false,
      dishPrice: item.dishPrice || 0,
      golaVariantPrices: item.golaVariantPrices ?? {
        'Ice Cream Only': 0,
        'Dry Fruit Only': 0,
        'Ice Cream + Dry Fruit': 0,
        'Plain': 0,
      },
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData(defaultForm());
  };

  const currentVariantType = formData.hasGolaVariants ? 'gola' : formData.hasVariants ? 'stickDish' : 'none';

  return (
    <div className="pb-20 md:pb-0 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Menu Management</h2>
      </div>

      {/* Form Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          {editingId ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <Plus className="w-5 h-5 text-indigo-500" />}
          {editingId ? 'Edit Menu Item' : 'Add New Item'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <input
                type="text"
                list="categories"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <datalist id="categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {/* Variant Type Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Item Type</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'none', label: '🍦 Simple' },
                { value: 'stickDish', label: '🍡 Stick / Dish' },
                { value: 'gola', label: '🧊 Gola (4 variants)' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVariantType(value as any)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${currentVariantType === value
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Simple / Stick price */}
          {!formData.hasGolaVariants && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {formData.hasVariants ? 'Stick Price (₹)' : 'Price (₹)'}
                </label>
                <input
                  type="number"
                  value={formData.price || ''}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                  min="1"
                />
              </div>
              {formData.hasVariants && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dish Price (₹)</label>
                  <input
                    type="number"
                    value={formData.dishPrice || ''}
                    onChange={(e) => setFormData({ ...formData, dishPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required={formData.hasVariants}
                    min="1"
                  />
                </div>
              )}
            </div>
          )}

          {/* Gola Variant Prices */}
          {formData.hasGolaVariants && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Gola Variant Prices (₹)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {GOLA_VARIANTS.map((v) => (
                  <div key={v}>
                    <label className="block text-xs font-bold text-slate-600 mb-1">{v}</label>
                    <input
                      type="number"
                      value={formData.golaVariantPrices?.[v] || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          price: formData.golaVariantPrices?.['Plain'] || 0,
                          golaVariantPrices: {
                            ...formData.golaVariantPrices,
                            [v]: parseFloat(e.target.value) || 0,
                          } as Record<GolaVariant, number>,
                        })
                      }
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min="0"
                      placeholder={`₹ ${v}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {editingId ? 'Update Item' : 'Save Item'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List Section */}
      <div className="space-y-8">
        {categories.map((category) => (
          <div key={category} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center gap-2">
              <Tag className="w-4 h-4 text-slate-400" />
              <h3 className="font-bold text-slate-700 uppercase tracking-wider text-sm">{category}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {menuItems.filter((item) => item.category === category).map((item) => (
                <div key={item.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <div className="font-bold text-slate-800">{item.name}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      {item.hasGolaVariants && item.golaVariantPrices
                        ? GOLA_VARIANTS.map((v) => `${v}: ₹${item.golaVariantPrices![v]}`).join(' · ')
                        : item.hasVariants
                          ? `Stick: ₹${item.price} | Dish: ₹${item.dishPrice}`
                          : `Price: ₹${item.price}`}
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
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
