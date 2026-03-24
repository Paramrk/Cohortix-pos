import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, Save, Tag, AlertCircle, ChevronDown, ChevronUp, X, Upload, Download } from 'lucide-react';
import type { MenuItem, Order, CatalogOptionGroup, CatalogOption } from '../types';
import {
  CATEGORY_OPTION_GROUPS_UPDATED_EVENT,
  type CategoryOptionGroupMap,
  cloneCatalogOptionGroups,
  loadCategoryOptionGroupMap,
  saveCategoryOptionGroupMap,
} from '../lib/categoryOptionGroups';

interface MenuManagerProps {
  menuItems: MenuItem[];
  orders: Order[];
  onAdd: (item: Omit<MenuItem, 'id'>) => Promise<void>;
  onUpdate: (id: string, item: Omit<MenuItem, 'id'>) => Promise<void>;
  onRenameCategory: (currentName: string, nextName: string) => Promise<void>;
  onDelete: (id: string) => void;
}

const DEFAULT_CATEGORIES = ['Main Course', 'Starters', 'Beverages', 'Desserts'] as const;
const CUSTOM_CATEGORIES_STORAGE_KEY = 'pos_custom_categories_v1';
const KEEP_CATEGORY_AFTER_SAVE_STORAGE_KEY = 'pos_keep_category_after_save_v1';
const TABLE_PRESETS_STORAGE_KEY = 'pos_table_presets_v1';
const TABLE_PRESETS_UPDATED_EVENT = 'pos-table-presets-updated';

const CATEGORY_ICONS: Record<string, string> = {
  'Main Course': '\u{1F35B}',
  Starters: '\u{1F957}',
  Beverages: '\u{1F964}',
  Desserts: '\u{1F367}',
  // Legacy
  Regular: '\u{1F361}',
  Special: '\u2B50',
  'Special Dish': '\u2B50',
  Pyali: '\u{1F367}',
  Pyaali: '\u{1F367}',
};

function generateId() {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyOption(): CatalogOption {
  return { id: generateId(), name: '', priceDelta: 0, isDefault: false, isActive: true };
}

function emptyOptionGroup(): CatalogOptionGroup {
  return {
    id: generateId(),
    name: '',
    type: 'addon',
    selection: 'single',
    required: false,
    minSelect: 0,
    maxSelect: 1,
    options: [emptyOption()],
  };
}

interface FormState {
  name: string;
  category: string;
  price: number;
  description: string;
  tags: string[];
  isActive: boolean;
  optionGroups: CatalogOptionGroup[];
}

interface BatchDraft {
  id: string;
  name: string;
  category: string;
  price: string;
  description: string;
  tags: string;
  isActive: boolean;
}

const defaultForm = (): FormState => ({
  name: '',
  category: DEFAULT_CATEGORIES[0],
  price: 0,
  description: '',
  tags: [],
  isActive: true,
  optionGroups: [],
});

function formToMenuItem(f: FormState): Omit<MenuItem, 'id'> {
  return {
    name: f.name.trim(),
    category: f.category,
    price: f.price,
    description: f.description.trim() || undefined,
    tags: f.tags.filter(Boolean),
    sortOrder: 0,
    isActive: f.isActive,
    optionGroups: f.optionGroups
      .filter((g) => g.name.trim() && g.options.some((o) => o.name.trim()))
      .map((g) => ({
        ...g,
        name: g.name.trim(),
        options: g.options.filter((o) => o.name.trim()),
      })),
  };
}

function menuItemToForm(item: MenuItem): FormState {
  return {
    name: item.name,
    category: item.category,
    price: item.price,
    description: item.description ?? '',
    tags: item.tags ?? [],
    isActive: item.isActive,
    optionGroups: item.optionGroups?.length ? item.optionGroups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o })),
    })) : [],
  };
}

function createBatchDraft(category = DEFAULT_CATEGORIES[0]): BatchDraft {
  return {
    id: generateId(),
    name: '',
    category,
    price: '',
    description: '',
    tags: '',
    isActive: true,
  };
}

function batchDraftToItem(draft: BatchDraft, sortOrder: number): Omit<MenuItem, 'id'> | null {
  const name = draft.name.trim();
  const price = Number(draft.price);
  if (!name || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    name,
    category: draft.category.trim() || DEFAULT_CATEGORIES[0],
    price: Math.round(price),
    description: draft.description.trim() || undefined,
    tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    sortOrder,
    isActive: draft.isActive,
    optionGroups: [],
  };
}

function normalizeTablePresets(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  ).sort((left, right) => left - right);
}

function parseTablePresetInput(input: string) {
  return normalizeTablePresets(
    input
      .split(/[\s,]+/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value)),
  );
}

function loadTablePresetsFromStorage() {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(TABLE_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeTablePresets(
      parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value)),
    );
  } catch {
    return [];
  }
}

function formatOrderTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MenuManager({
  menuItems,
  orders,
  onAdd,
  onUpdate,
  onRenameCategory,
  onDelete,
}: MenuManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [showOrdersPanel, setShowOrdersPanel] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | Order['status']>('all');
  const [orderSourceFilter, setOrderSourceFilter] = useState<'all' | 'pos' | 'customer'>('all');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | Order['paymentStatus']>('all');
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, { price: number }>>({});
  const [savingBulk, setSavingBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isBatchAdd, setIsBatchAdd] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<BatchDraft[]>([createBatchDraft()]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [tablePresetDraft, setTablePresetDraft] = useState('');
  const [tablePresets, setTablePresets] = useState<number[]>(() => loadTablePresetsFromStorage());
  const [selectedCategoryTemplate, setSelectedCategoryTemplate] = useState(DEFAULT_CATEGORIES[0]);
  const [categoryOptionGroups, setCategoryOptionGroups] = useState<CategoryOptionGroupMap>(() => loadCategoryOptionGroupMap());
  const [categoryExpandedGroups, setCategoryExpandedGroups] = useState<Set<string>>(new Set());
  const [keepCategoryAfterSave, setKeepCategoryAfterSave] = useState(() => {
    try {
      const stored = localStorage.getItem(KEEP_CATEGORY_AFTER_SAVE_STORAGE_KEY);
      return stored !== 'false';
    } catch {
      return true;
    }
  });
  const [tagInput, setTagInput] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ success: number; failed: number } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const itemNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
      if (stored) setCustomCategories(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEEP_CATEGORY_AFTER_SAVE_STORAGE_KEY, String(keepCategoryAfterSave));
    } catch { /* ignore */ }
  }, [keepCategoryAfterSave]);

  useEffect(() => {
    try {
      localStorage.setItem(TABLE_PRESETS_STORAGE_KEY, JSON.stringify(tablePresets));
      window.dispatchEvent(new Event(TABLE_PRESETS_UPDATED_EVENT));
    } catch { /* ignore */ }
  }, [tablePresets]);

  useEffect(() => {
    saveCategoryOptionGroupMap(categoryOptionGroups);
    window.dispatchEvent(new Event(CATEGORY_OPTION_GROUPS_UPDATED_EVENT));
  }, [categoryOptionGroups]);

  const sectionCategories = Array.from(
    new Set([...customCategories, ...menuItems.map((i) => i.category)]),
  );

  const availableCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...sectionCategories]),
  );

  const categoryTemplateCategories = useMemo(() => {
    const names = new Set<string>([
      ...DEFAULT_CATEGORIES,
      ...sectionCategories,
      ...Object.keys(categoryOptionGroups),
    ]);
    return Array.from(names);
  }, [categoryOptionGroups, sectionCategories]);

  const selectedCategoryTemplateGroups = categoryOptionGroups[selectedCategoryTemplate] ?? [];

  useEffect(() => {
    if (categoryTemplateCategories.length === 0) return;
    if (!categoryTemplateCategories.includes(selectedCategoryTemplate)) {
      setSelectedCategoryTemplate(categoryTemplateCategories[0]);
    }
  }, [categoryTemplateCategories, selectedCategoryTemplate]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = orderSearch.trim().toLowerCase();
    return [...orders]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((order) => {
        if (orderStatusFilter !== 'all' && order.status !== orderStatusFilter) return false;
        if (orderSourceFilter !== 'all' && (order.source ?? 'pos') !== orderSourceFilter) return false;
        if (orderPaymentFilter !== 'all' && order.paymentStatus !== orderPaymentFilter) return false;
        if (!normalizedSearch) return true;
        const itemText = order.items.map((item) => item.name).join(' ').toLowerCase();
        return (
          order.customerName.toLowerCase().includes(normalizedSearch) ||
          String(order.orderNumber).includes(normalizedSearch) ||
          itemText.includes(normalizedSearch)
        );
      });
  }, [orderPaymentFilter, orderSearch, orderSourceFilter, orderStatusFilter, orders]);

  const nextSortOrder = useMemo(() => {
    if (menuItems.length === 0) return 0;
    return Math.max(...menuItems.map((i) => i.sortOrder ?? 0)) + 1;
  }, [menuItems]);

  const batchDraftGroups = useMemo(() => {
    const grouped = new Map<string, BatchDraft[]>();
    batchDrafts.forEach((draft) => {
      const key = draft.category.trim() || DEFAULT_CATEGORIES[0];
      const list = grouped.get(key);
      if (list) {
        list.push(draft);
      } else {
        grouped.set(key, [draft]);
      }
    });

    return Array.from(grouped.entries()).sort(([left], [right]) => {
      const leftIndex = availableCategories.indexOf(left);
      const rightIndex = availableCategories.indexOf(right);
      return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
    });
  }, [availableCategories, batchDrafts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setSaveError('Item name is required.');
      return;
    }
    if (form.price <= 0) {
      setSaveError('Base price must be greater than zero.');
      return;
    }
    setSaveError('');
    setSaving(true);
    const savedCategory = form.category;
    try {
      const menuItem = { ...formToMenuItem(form), sortOrder: editingId ? form.optionGroups.length : nextSortOrder };
      if (editingId) {
        await onUpdate(editingId, menuItem);
        setEditingId(null);
      } else {
        await onAdd(menuItem);
      }
      setForm(() => {
        const next = defaultForm();
        if (!editingId && keepCategoryAfterSave) {
          next.category = savedCategory;
        }
        return next;
      });
      setExpandedGroups(new Set());
      window.requestAnimationFrame(() => {
        itemNameInputRef.current?.focus();
      });
    } catch (error) {
      const msg = error instanceof Error && error.message.trim() ? error.message : 'Failed to save. Please try again.';
      setSaveError(msg);
      console.error('[MenuManager.handleSubmit]', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setForm(menuItemToForm(item));
    setSaveError('');
    setExpandedGroups(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(defaultForm());
    setSaveError('');
    setExpandedGroups(new Set());
  };

  // Option Group manipulation
  const addOptionGroup = () => {
    const group = emptyOptionGroup();
    setForm((f) => ({ ...f, optionGroups: [...f.optionGroups, group] }));
    setExpandedGroups((prev) => new Set([...prev, group.id]));
  };

  const removeOptionGroup = (groupId: string) => {
    setForm((f) => ({ ...f, optionGroups: f.optionGroups.filter((g) => g.id !== groupId) }));
    setExpandedGroups((prev) => { const next = new Set(prev); next.delete(groupId); return next; });
  };

  const updateOptionGroup = (groupId: string, field: keyof CatalogOptionGroup, value: unknown) => {
    setForm((f) => ({
      ...f,
      optionGroups: f.optionGroups.map((g) => g.id === groupId ? { ...g, [field]: value } : g),
    }));
  };

  const addOptionToGroup = (groupId: string) => {
    setForm((f) => ({
      ...f,
      optionGroups: f.optionGroups.map((g) =>
        g.id === groupId ? { ...g, options: [...g.options, emptyOption()] } : g,
      ),
    }));
  };

  const removeOptionFromGroup = (groupId: string, optionId: string) => {
    setForm((f) => ({
      ...f,
      optionGroups: f.optionGroups.map((g) =>
        g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g,
      ),
    }));
  };

  const updateOption = (groupId: string, optionId: string, field: keyof CatalogOption, value: unknown) => {
    setForm((f) => ({
      ...f,
      optionGroups: f.optionGroups.map((g) =>
        g.id === groupId
          ? { ...g, options: g.options.map((o) => o.id === optionId ? { ...o, [field]: value } : o) }
          : g,
      ),
    }));
  };

  const addCategoryOptionGroup = () => {
    const group = emptyOptionGroup();
    setCategoryOptionGroups((prev) => ({
      ...prev,
      [selectedCategoryTemplate]: [...(prev[selectedCategoryTemplate] ?? []), group],
    }));
    setCategoryExpandedGroups((prev) => new Set([...prev, group.id]));
  };

  const removeCategoryOptionGroup = (groupId: string) => {
    setCategoryOptionGroups((prev) => {
      const nextGroups = (prev[selectedCategoryTemplate] ?? []).filter((group) => group.id !== groupId);
      return { ...prev, [selectedCategoryTemplate]: nextGroups };
    });
    setCategoryExpandedGroups((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  };

  const updateCategoryOptionGroup = (groupId: string, field: keyof CatalogOptionGroup, value: unknown) => {
    setCategoryOptionGroups((prev) => ({
      ...prev,
      [selectedCategoryTemplate]: (prev[selectedCategoryTemplate] ?? []).map((group) =>
        (group.id === groupId ? { ...group, [field]: value } : group)),
    }));
  };

  const addOptionToCategoryGroup = (groupId: string) => {
    setCategoryOptionGroups((prev) => ({
      ...prev,
      [selectedCategoryTemplate]: (prev[selectedCategoryTemplate] ?? []).map((group) =>
        (group.id === groupId ? { ...group, options: [...group.options, emptyOption()] } : group)),
    }));
  };

  const removeOptionFromCategoryGroup = (groupId: string, optionId: string) => {
    setCategoryOptionGroups((prev) => ({
      ...prev,
      [selectedCategoryTemplate]: (prev[selectedCategoryTemplate] ?? []).map((group) =>
        (group.id === groupId
          ? { ...group, options: group.options.filter((option) => option.id !== optionId) }
          : group)),
    }));
  };

  const updateCategoryOption = (groupId: string, optionId: string, field: keyof CatalogOption, value: unknown) => {
    setCategoryOptionGroups((prev) => ({
      ...prev,
      [selectedCategoryTemplate]: (prev[selectedCategoryTemplate] ?? []).map((group) =>
        (group.id === groupId
          ? {
              ...group,
              options: group.options.map((option) =>
                (option.id === optionId ? { ...option, [field]: value } : option)),
            }
          : group)),
    }));
  };

  const toggleCategoryGroupExpand = (groupId: string) => {
    setCategoryExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const applyCategoryGroupsToForm = (category: string) => {
    const groups = categoryOptionGroups[category] ?? [];
    setForm((prev) => ({
      ...prev,
      category,
      optionGroups: editingId ? prev.optionGroups : cloneCatalogOptionGroups(groups),
    }));
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || form.tags.includes(tag)) return;
    setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Bulk edit
  const handleToggleBulkEdit = () => {
    if (isBatchAdd) {
      if (!window.confirm('Discard batch add items and switch to bulk price edit?')) return;
      setIsBatchAdd(false);
      setBatchDrafts([createBatchDraft()]);
      setBatchError('');
    }

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

  const handleToggleBatchAdd = () => {
    if (isBulkEdit) return;

    if (isBatchAdd) {
      const hasDraftContent = batchDrafts.some((draft) => (
        draft.name.trim() ||
        draft.price.trim() ||
        draft.description.trim() ||
        draft.tags.trim() ||
        !draft.isActive ||
        draft.category.trim() !== DEFAULT_CATEGORIES[0]
      ));
      if (hasDraftContent && !window.confirm('Discard batch add items?')) return;
      setIsBatchAdd(false);
      setBatchDrafts([createBatchDraft()]);
      setBatchError('');
      setEditingId(null);
      setSaveError('');
      setForm(defaultForm());
      setExpandedGroups(new Set());
      return;
    }

    setIsBatchAdd(true);
    setBatchDrafts([createBatchDraft(form.category || DEFAULT_CATEGORIES[0])]);
    setBatchError('');
    setEditingId(null);
    setSaveError('');
    setForm(defaultForm());
    setExpandedGroups(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateBatchDraft = (draftId: string, field: keyof BatchDraft, value: string | boolean) => {
    setBatchDrafts((prev) => prev.map((draft) => (
      draft.id === draftId ? { ...draft, [field]: value } : draft
    )));
  };

  const addBatchDraft = (category = DEFAULT_CATEGORIES[0]) => {
    setBatchDrafts((prev) => [...prev, createBatchDraft(category)]);
  };

  const removeBatchDraft = (draftId: string) => {
    setBatchDrafts((prev) => {
      if (prev.length <= 1) {
        return [createBatchDraft(prev[0]?.category || DEFAULT_CATEGORIES[0])];
      }
      return prev.filter((draft) => draft.id !== draftId);
    });
  };

  const handleSaveBatch = async () => {
    const rows = batchDrafts
      .map((draft) => ({ draft, item: batchDraftToItem(draft, 0) }))
      .filter(({ draft }) => draft.name.trim().length > 0);

    if (rows.length === 0) {
      setBatchError('Add at least one item before saving.');
      return;
    }

    const invalidIndex = rows.findIndex(({ item }) => item === null);
    if (invalidIndex !== -1) {
      setBatchError(`Row ${invalidIndex + 1} needs a name and a valid price.`);
      return;
    }

    setBatchSaving(true);
    setBatchError('');
    try {
      const groupedRows = [...rows].sort((a, b) => {
        const aCategory = a.item!.category;
        const bCategory = b.item!.category;
        const aCategoryIndex = availableCategories.indexOf(aCategory);
        const bCategoryIndex = availableCategories.indexOf(bCategory);
        if (aCategoryIndex !== bCategoryIndex) {
          return (aCategoryIndex === -1 ? Number.MAX_SAFE_INTEGER : aCategoryIndex) - (bCategoryIndex === -1 ? Number.MAX_SAFE_INTEGER : bCategoryIndex);
        }
        return batchDrafts.findIndex((draft) => draft.id === a.draft.id) - batchDrafts.findIndex((draft) => draft.id === b.draft.id);
      });

      for (const [index, row] of groupedRows.entries()) {
        const item = row.item!;
        await onAdd({ ...item, sortOrder: nextSortOrder + index });
      }

      const resetCategory = groupedRows[0]?.item?.category ?? batchDrafts[0]?.category ?? DEFAULT_CATEGORIES[0];
      setBatchDrafts([createBatchDraft(resetCategory)]);
      setBatchError('');
    } catch (error) {
      setBatchError(error instanceof Error && error.message.trim() ? error.message : 'Failed to save batch items.');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleSaveBulk = async () => {
    const ids = Object.keys(bulkDrafts);
    if (ids.length === 0) { setIsBulkEdit(false); return; }
    setSavingBulk(true);
    setBulkError('');
    try {
      const promises = ids.map((id) => {
        const draft = bulkDrafts[id];
        const currentItem = menuItems.find((i) => i.id === id);
        if (!currentItem || draft.price <= 0) return Promise.resolve();
        const { id: _id, ...rest } = currentItem;
        return onUpdate(id, { ...rest, price: draft.price });
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

  // Category management
  const handleRenameCategory = async (currentCategory: string) => {
    if (saving || savingBulk || renamingCategory) return;
    const currentCategoryCount = menuItems.filter((item) => item.category === currentCategory).length;
    const nextCategory = window.prompt(`Rename "${currentCategory}" to:`, currentCategory);
    if (nextCategory == null) return;
    const trimmedNextCategory = nextCategory.trim();
    if (!trimmedNextCategory) { alert('Category name cannot be empty.'); return; }
    if (trimmedNextCategory === currentCategory) return;
    const existingCategory = availableCategories.find(
      (category) => category.toLowerCase() === trimmedNextCategory.toLowerCase() && category !== currentCategory,
    );
    const targetCategory = existingCategory ?? trimmedNextCategory;
    const mergeTargetCount = existingCategory
      ? menuItems.filter((item) => item.category.toLowerCase() === existingCategory.toLowerCase()).length
      : 0;
    const confirmed = existingCategory
      ? window.confirm(`Category "${existingCategory}" already has ${mergeTargetCount} item(s). Merge ${currentCategoryCount} item(s) from "${currentCategory}" into it?`)
      : window.confirm(`Rename category "${currentCategory}" (${currentCategoryCount} item(s)) to "${trimmedNextCategory}"?`);
    if (!confirmed) return;
    setRenamingCategory(currentCategory);
    setSaveError('');
    try {
      await onRenameCategory(currentCategory, targetCategory);
      setCustomCategories((prev) => {
        const isCurrentDefault = (DEFAULT_CATEGORIES as readonly string[]).includes(currentCategory);
        const isTargetDefault = (DEFAULT_CATEGORIES as readonly string[]).includes(targetCategory);
        const next = prev
          .filter((category) => category !== currentCategory)
          .filter((category) => category !== targetCategory);

        if (!isCurrentDefault || !isTargetDefault) {
          // Keep renamed custom categories available even after their items are edited later.
          if (!isTargetDefault && !next.includes(targetCategory)) {
            next.push(targetCategory);
          }
        }

        localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setCategoryOptionGroups((prev) => {
        if (!(currentCategory in prev) && !(targetCategory in prev)) return prev;
        const next = { ...prev };
        const sourceGroups = next[currentCategory] ?? [];
        if (currentCategory !== targetCategory && sourceGroups.length > 0) {
          delete next[currentCategory];
          next[targetCategory] = [...(next[targetCategory] ?? []), ...sourceGroups];
        }
        return next;
      });
      if (selectedCategoryTemplate === currentCategory) {
        setSelectedCategoryTemplate(targetCategory);
      }
      setForm((prev) => (prev.category === currentCategory ? { ...prev, category: targetCategory } : prev));
    } catch (error) {
      alert(error instanceof Error && error.message.trim() ? error.message : 'Failed to rename category.');
    } finally {
      setRenamingCategory(null);
    }
  };

  const handleDeleteCategory = (categoryToRemove: string) => {
    const itemsInCategory = menuItems.filter((i) => i.category === categoryToRemove);
    const count = itemsInCategory.length;
    const confirmMsg = count > 0
      ? `Delete category "${categoryToRemove}" and all ${count} item(s) inside it? This cannot be undone.`
      : `Delete empty category "${categoryToRemove}"?`;
    if (!window.confirm(confirmMsg)) return;
    // Delete all items in the category first
    itemsInCategory.forEach((item) => onDelete(item.id));
    // Remove from custom categories list
    setCustomCategories((prev) => {
      const next = prev.filter((c) => c !== categoryToRemove);
      localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    const removedGroupIds = categoryOptionGroups[categoryToRemove]?.map((group) => group.id) ?? [];
    setCategoryOptionGroups((prev) => {
      if (!(categoryToRemove in prev)) return prev;
      const next = { ...prev };
      delete next[categoryToRemove];
      return next;
    });
    if (removedGroupIds.length > 0) {
      setCategoryExpandedGroups((current) => {
        const nextExpanded = new Set(current);
        removedGroupIds.forEach((groupId) => nextExpanded.delete(groupId));
        return nextExpanded;
      });
    }
    if (form.category === categoryToRemove) {
      setForm((prev) => ({ ...prev, category: DEFAULT_CATEGORIES[0] }));
    }
    if (selectedCategoryTemplate === categoryToRemove) {
      setSelectedCategoryTemplate(DEFAULT_CATEGORIES[0]);
    }
    if (editingId) {
      const editingItem = menuItems.find((i) => i.id === editingId);
      if (editingItem?.category === categoryToRemove) handleCancel();
    }
  };

  const handleAddNewCategory = () => {
    const input = window.prompt('Enter new category name:');
    if (!input) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const existing = availableCategories.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      alert('This category already exists.');
      setForm((prev) => ({ ...prev, category: existing }));
      setSelectedCategoryTemplate(existing);
      return;
    }
    setCustomCategories((prev) => {
      const next = [...prev, trimmed];
      localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    applyCategoryGroupsToForm(trimmed);
    setSelectedCategoryTemplate(trimmed);
  };

  const handleAddTablePresets = () => {
    const draftValues = parseTablePresetInput(tablePresetDraft);
    if (draftValues.length === 0) return;
    setTablePresets((prev) => normalizeTablePresets([...prev, ...draftValues]));
    setTablePresetDraft('');
  };

  const handleRemoveTablePreset = (tableNumber: number) => {
    setTablePresets((prev) => prev.filter((value) => value !== tableNumber));
  };

  // ── CSV helpers ────────────────────────────────────────────────────────────

  const downloadExampleCsv = () => {
    const rows = [
      ['name', 'category', 'price', 'description', 'tags'],
      ['Masala Dosa', 'Main Course', '80', 'Crispy dosa with spicy potato filling', 'veg,popular'],
      ['Filter Coffee', 'Beverages', '30', 'South Indian filter coffee', 'hot,veg'],
      ['Vada', 'Starters', '25', 'Crispy medu vada', 'veg'],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'menu_example.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCsvImportResult(null);
    setCsvImporting(true);
    let success = 0; let failed = 0;
    try {
      const text = await file.text();
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
      const parseRow = (line: string) => {
        const cols: string[] = [];
        let inside = false; let cur = '';
        for (const ch of line) {
          if (ch === '"') { inside = !inside; }
          else if (ch === ',' && !inside) { cols.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        cols.push(cur.trim());
        return cols;
      };
      const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/^"/, '').replace(/"$/, ''));
      const nameIdx = headers.indexOf('name');
      const catIdx = headers.indexOf('category');
      const priceIdx = headers.indexOf('price');
      const descIdx = headers.indexOf('description');
      const tagsIdx = headers.indexOf('tags');
      if (nameIdx === -1 || priceIdx === -1) throw new Error('CSV must have "name" and "price" columns.');
      for (let i = 1; i < lines.length; i++) {
        const cols = parseRow(lines[i]).map((c) => c.replace(/^"|"$/g, ''));
        const name = cols[nameIdx]?.trim();
        const price = parseFloat(cols[priceIdx] ?? '0');
        if (!name || !price || price <= 0) { failed++; continue; }
        const item: Omit<import('../types').MenuItem, 'id'> = {
          name,
          category: catIdx >= 0 ? (cols[catIdx]?.trim() || DEFAULT_CATEGORIES[0]) : DEFAULT_CATEGORIES[0],
          price,
          description: descIdx >= 0 ? cols[descIdx]?.trim() || undefined : undefined,
          tags: tagsIdx >= 0 ? (cols[tagsIdx] ?? '').split(',').map((t) => t.trim()).filter(Boolean) : [],
          sortOrder: nextSortOrder + i,
          isActive: true,
          optionGroups: [],
        };
        try { await onAdd(item); success++; } catch { failed++; }
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'CSV import failed.');
    }
    setCsvImportResult({ success, failed });
    setCsvImporting(false);
  };

  return (
    <div className="mobile-bottom-offset md:pb-0 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Menu Management</h2>
          <span className="text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
            Live Service
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* CSV Import */}
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void handleCsvFile(e); }} />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {csvImporting ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            onClick={downloadExampleCsv}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            Example CSV
          </button>
          <button
            type="button"
            onClick={() => setShowOrdersPanel((prev) => !prev)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${showOrdersPanel
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
          >
            {showOrdersPanel ? 'Hide Orders' : 'Show Orders'}
          </button>
          <button
            onClick={handleToggleBulkEdit}
            disabled={savingBulk}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${isBulkEdit
              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200'
              : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200'
              }`}
          >
            {isBulkEdit ? 'Cancel Bulk Edit' : 'Bulk Edit Prices'}
          </button>
          <button
            type="button"
            onClick={handleToggleBatchAdd}
            disabled={savingBulk || batchSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${isBatchAdd
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              } disabled:opacity-50`}
          >
            {isBatchAdd ? 'Exit Batch Add' : 'Batch Add Items'}
          </button>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-500" />
              Table Number Presets
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Add the table numbers you want to show as quick picks when taking dine-in orders.
            </p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
            {tablePresets.length} preset(s)
          </span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={tablePresetDraft}
            onChange={(e) => setTablePresetDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTablePresets();
              }
            }}
            placeholder="e.g. 1, 2, 3, 4"
            className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAddTablePresets}
            className="h-11 px-4 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Add Preset(s)
          </button>
          {tablePresets.length > 0 && (
            <button
              type="button"
              onClick={() => setTablePresets([])}
              className="h-11 px-4 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tablePresets.length > 0 ? (
            tablePresets.map((tableNumber) => (
              <span
                key={tableNumber}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 text-sm font-semibold"
              >
                Table {tableNumber}
                <button
                  type="button"
                  onClick={() => handleRemoveTablePreset(tableNumber)}
                  className="text-indigo-400 hover:text-indigo-700"
                  title={`Remove table ${tableNumber}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))
          ) : (
            <div className="text-sm text-slate-400">
              No table presets yet. Add a few numbers above, and they will appear in the order screen.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Tag className="w-5 h-5 text-violet-500" />
              Category Option Groups
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Assign option groups to a category once, then every item in that category will show them while ordering.
            </p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide bg-violet-50 text-violet-700 px-3 py-1 rounded-full">
            {selectedCategoryTemplateGroups.length} group(s)
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {categoryTemplateCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategoryTemplate(category)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${selectedCategoryTemplate === category
                ? 'bg-violet-100 text-violet-800 border-violet-500'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
            >
              {CATEGORY_ICONS[category] ?? '\u{1F37D}'} {category}
              {(categoryOptionGroups[category]?.length ?? 0) > 0 && (
                <span className="ml-2 text-[10px] bg-white/70 px-1.5 py-0.5 rounded-full">
                  {categoryOptionGroups[category].length}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={handleAddNewCategory}
            className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-violet-600 hover:border-violet-400 transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add New
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <p className="text-sm text-slate-500">
            These groups are merged into the item setup automatically for the selected category.
          </p>
          <button
            type="button"
            onClick={addCategoryOptionGroup}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Group
          </button>
        </div>

        {selectedCategoryTemplateGroups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-500">
            No category groups yet. Add one above for this category.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedCategoryTemplateGroups.map((group) => {
              const isExpanded = categoryExpandedGroups.has(group.id);
              return (
                <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div
                    className="bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer"
                    onClick={() => toggleCategoryGroupExpand(group.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className="text-sm font-bold text-slate-700 truncate">{group.name || 'Untitled Group'}</span>
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded shrink-0">
                        {group.selection === 'single' ? 'Single' : 'Multi'} · {group.options.length} option(s)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCategoryOptionGroup(group.id); }}
                      className="text-rose-500 hover:bg-rose-50 p-1 rounded shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Group Name</label>
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) => updateCategoryOptionGroup(group.id, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-violet-500"
                            placeholder="e.g. Spice Level"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Type</label>
                          <select
                            value={group.type}
                            onChange={(e) => updateCategoryOptionGroup(group.id, 'type', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                          >
                            <option value="size">Size</option>
                            <option value="addon">Add-on</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Selection</label>
                          <select
                            value={group.selection}
                            onChange={(e) => updateCategoryOptionGroup(group.id, 'selection', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                          >
                            <option value="single">Single (radio)</option>
                            <option value="multiple">Multiple (checkbox)</option>
                          </select>
                        </div>
                        <div className="flex items-end gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={group.required}
                              onChange={(e) => updateCategoryOptionGroup(group.id, 'required', e.target.checked)}
                              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            <span className="font-medium text-slate-700">Required</span>
                          </label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Options</span>
                          <button
                            type="button"
                            onClick={() => addOptionToCategoryGroup(group.id)}
                            className="text-[11px] font-bold text-violet-600 hover:text-violet-800 flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" /> Add Option
                          </button>
                        </div>
                        {group.options.map((option) => (
                          <div key={option.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                            <input
                              type="text"
                              value={option.name}
                              onChange={(e) => updateCategoryOption(group.id, option.id, 'name', e.target.value)}
                              className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-violet-500"
                              placeholder="Option name"
                            />
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] text-slate-500">₹±</span>
                              <input
                                type="number"
                                value={option.priceDelta || ''}
                                onChange={(e) => updateCategoryOption(group.id, option.id, 'priceDelta', parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white text-center focus:ring-1 focus:ring-violet-500"
                                placeholder="0"
                              />
                            </div>
                            <label className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0" title="Default">
                              <input
                                type="checkbox"
                                checked={option.isDefault}
                                onChange={(e) => updateCategoryOption(group.id, option.id, 'isDefault', e.target.checked)}
                                className="rounded border-slate-300 text-violet-600 w-3.5 h-3.5"
                              />
                              Def
                            </label>
                            <button
                              type="button"
                              onClick={() => removeOptionFromCategoryGroup(group.id, option.id)}
                              className="text-rose-400 hover:text-rose-600 p-1 shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Orders Panel */}
      {showOrdersPanel && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Order List</h3>
              <p className="text-sm text-slate-500 mt-1">Search and filter orders.</p>
            </div>
            <span className="text-xs font-bold uppercase tracking-wide bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
              {filteredOrders.length} order(s)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
            <input
              type="text"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search by order #, customer, or item"
              className="xl:col-span-2 h-11 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value as 'all' | Order['status'])} className="h-11 px-3 rounded-xl border border-slate-200 bg-white">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <select value={orderSourceFilter} onChange={(e) => setOrderSourceFilter(e.target.value as 'all' | 'pos' | 'customer')} className="h-11 px-3 rounded-xl border border-slate-200 bg-white">
              <option value="all">All Sources</option>
              <option value="pos">POS</option>
              <option value="customer">Customer</option>
            </select>
            <select value={orderPaymentFilter} onChange={(e) => setOrderPaymentFilter(e.target.value as 'all' | Order['paymentStatus'])} className="h-11 px-3 rounded-xl border border-slate-200 bg-white">
              <option value="all">All Payment</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="max-h-[520px] overflow-y-auto space-y-3 pr-1">
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-500">No orders match.</div>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-slate-800">#{order.orderNumber}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${order.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>{order.status}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${order.paymentStatus === 'paid' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>{order.paymentStatus}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-700 font-semibold">{order.customerName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatOrderTimestamp(order.timestamp)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-800">₹{order.total}</div>
                      <div className="text-xs text-slate-500">{order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.items.map((item, index) => (
                      <span key={`${order.id}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs text-slate-700">
                        <span className="font-bold">{item.quantity}x</span>
                        <span>{item.name}</span>
                        {item.selectedOptions?.length > 0 && <span className="text-indigo-600 font-medium">({item.selectedOptions.map((o) => o.optionName).join(', ')})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bulk Edit Bar */}
      {isBulkEdit && Object.keys(bulkDrafts).length > 0 && (
        <div className="sticky top-4 z-10 bg-white p-4 border border-slate-200 shadow-xl rounded-2xl flex flex-wrap gap-4 justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <span className="font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg text-sm border border-indigo-100">
              {Object.keys(bulkDrafts).length} item(s) changed
            </span>
            {bulkError && <span className="text-sm text-rose-500 font-medium flex-1">{bulkError}</span>}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={() => { if (window.confirm('Discard all unsaved changes?')) { setBulkDrafts({}); setBulkError(''); } }} disabled={savingBulk} className="flex-1 sm:flex-none px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold bg-white text-slate-600 hover:bg-slate-50">Discard</button>
            <button onClick={() => { void handleSaveBulk(); }} disabled={savingBulk} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-2 px-6 rounded-xl flex items-center justify-center gap-2">
              {savingBulk ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              Save All
            </button>
          </div>
        </div>
      )}

      {isBatchAdd && !isBulkEdit && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-500" />
                Batch Add Items
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Add multiple menu items, grouped by category, and save them in one go.
              </p>
            </div>
            <button
              type="button"
              onClick={() => addBatchDraft(batchDrafts[batchDrafts.length - 1]?.category || DEFAULT_CATEGORIES[0])}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </button>
          </div>

          <div className="space-y-5">
            {batchDraftGroups.map(([category, drafts]) => (
              <div key={category} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">{category}</h4>
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      {drafts.length} item(s)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => addBatchDraft(category)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to Category
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {drafts.map((draft) => (
                    <div key={draft.id} className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.9fr_0.8fr_1.2fr_auto] gap-3 items-start">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Item Name</label>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) => updateBatchDraft(draft.id, 'name', e.target.value)}
                          placeholder="e.g. Masala Dosa"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Category</label>
                        <select
                          value={draft.category}
                          onChange={(e) => updateBatchDraft(draft.id, 'category', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {availableCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Price (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={draft.price}
                          onChange={(e) => updateBatchDraft(draft.id, 'price', e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Description</label>
                        <input
                          type="text"
                          value={draft.description}
                          onChange={(e) => updateBatchDraft(draft.id, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="inline-flex items-center gap-2 h-10 px-3 border border-slate-200 rounded-lg bg-white text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(e) => updateBatchDraft(draft.id, 'isActive', e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          Active
                        </label>
                        <button
                          type="button"
                          onClick={() => removeBatchDraft(draft.id)}
                          className="h-10 w-10 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center"
                          title="Remove row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="lg:col-span-5">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Tags</label>
                        <input
                          type="text"
                          value={draft.tags}
                          onChange={(e) => updateBatchDraft(draft.id, 'tags', e.target.value)}
                          placeholder="Optional comma-separated tags"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {batchDraftGroups.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-500">
                No draft items yet. Add a row to start batch entry.
              </div>
            )}
          </div>

          {batchError && (
            <div className="mt-4 flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{batchError}</span>
            </div>
          )}

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => { void handleSaveBatch(); }}
              disabled={batchSaving}
              className="flex-1 min-h-11 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {batchSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              {batchSaving ? 'Saving...' : 'Save All Items'}
            </button>
            <button
              type="button"
              onClick={() => setBatchDrafts([createBatchDraft(batchDrafts[0]?.category || DEFAULT_CATEGORIES[0])])}
              disabled={batchSaving}
              className="px-6 min-h-11 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold py-3 rounded-xl transition-colors"
            >
              Clear Rows
            </button>
          </div>
        </div>
      )}

      {/* Item Form */}
      {!isBulkEdit && !isBatchAdd && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            {editingId ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <Plus className="w-5 h-5 text-indigo-500" />}
            {editingId ? 'Edit Menu Item' : 'Add New Item'}
          </h3>

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
            {/* Name + Price Row */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
                <input
                  ref={itemNameInputRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Masala Dosa"
                  required
                />
              </div>
              <div className="w-full sm:w-32">
                <label className="block text-sm font-medium text-slate-700 mb-1">Base Price (₹)</label>
                <input
                  type="number"
                  value={form.price || ''}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  min="0"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none h-16"
                placeholder="Short description of the item"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
              <div className="flex gap-2 flex-wrap">
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => applyCategoryGroupsToForm(cat)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${form.category === cat
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {CATEGORY_ICONS[cat] ?? '\u{1F37D}'} {cat}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddNewCategory}
                  className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-400 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add New
                </button>
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={keepCategoryAfterSave}
                  onChange={(e) => setKeepCategoryAfterSave(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Keep this category after save for quick multi-item entry</span>
              </label>
              <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h4 className="text-sm font-bold text-violet-800">Category option groups</h4>
                    <p className="text-xs text-violet-700 mt-0.5">
                      {categoryOptionGroups[form.category]?.length
                        ? `This category has ${categoryOptionGroups[form.category].length} preset group(s) and they are loaded into the item form.`
                        : 'No preset groups are assigned to this category yet.'}
                    </p>
                  </div>
                  {categoryOptionGroups[form.category]?.length > 0 && !editingId && (
                    <button
                      type="button"
                      onClick={() => applyCategoryGroupsToForm(form.category)}
                      className="text-xs font-bold text-violet-700 bg-white border border-violet-200 px-3 py-1.5 rounded-lg hover:bg-violet-100"
                    >
                      Reload template
                    </button>
                  )}
                </div>
                {categoryOptionGroups[form.category]?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {categoryOptionGroups[form.category].map((group) => (
                      <span
                        key={group.id}
                        className="inline-flex items-center gap-2 rounded-full bg-white border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-800"
                      >
                        {group.name}
                        <span className="text-[10px] uppercase tracking-wide text-violet-500">
                          {group.selection === 'single' ? 'single' : 'multi'}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tags <span className="text-slate-400 font-normal">(optional)</span></label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-slate-400 hover:text-rose-500"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Add tag (press Enter)"
                />
                <button type="button" onClick={addTag} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200">Add</button>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
              </label>
              <span className={`text-sm font-medium ${form.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                {form.isActive ? 'Active — visible to customers' : 'Inactive — hidden from ordering'}
              </span>
            </div>

            {/* Option Groups */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Option Groups <span className="text-slate-400 font-normal">(sizes, addons, extras)</span></label>
                <button type="button" onClick={addOptionGroup} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Group
                </button>
              </div>
              {form.optionGroups.length === 0 && (
                <div className="text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-6 text-center">
                  No option groups. Add one to create sizes, addons, or extras for this item.
                </div>
              )}
              <div className="space-y-3">
                {form.optionGroups.map((group) => {
                  const isExpanded = expandedGroups.has(group.id);
                  return (
                    <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Group Header */}
                      <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer" onClick={() => toggleGroupExpand(group.id)}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                          <span className="text-sm font-bold text-slate-700 truncate">{group.name || 'Untitled Group'}</span>
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded shrink-0">
                            {group.selection === 'single' ? 'Single' : 'Multi'} · {group.options.length} option(s)
                          </span>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeOptionGroup(group.id); }} className="text-rose-500 hover:bg-rose-50 p-1 rounded shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>

                      {/* Group Body */}
                      {isExpanded && (
                        <div className="p-4 space-y-3">
                          {/* Group Settings */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-500 mb-1">Group Name</label>
                              <input
                                type="text"
                                value={group.name}
                                onChange={(e) => updateOptionGroup(group.id, 'name', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500"
                                placeholder="e.g. Size, Toppings"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-500 mb-1">Type</label>
                              <select value={group.type} onChange={(e) => updateOptionGroup(group.id, 'type', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                                <option value="size">Size</option>
                                <option value="addon">Add-on</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-500 mb-1">Selection</label>
                              <select value={group.selection} onChange={(e) => updateOptionGroup(group.id, 'selection', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                                <option value="single">Single (radio)</option>
                                <option value="multiple">Multiple (checkbox)</option>
                              </select>
                            </div>
                            <div className="flex items-end gap-3">
                              <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={group.required} onChange={(e) => updateOptionGroup(group.id, 'required', e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                <span className="font-medium text-slate-700">Required</span>
                              </label>
                            </div>
                          </div>

                          {/* Options */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Options</span>
                              <button type="button" onClick={() => addOptionToGroup(group.id)} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5">
                                <Plus className="w-3 h-3" /> Add Option
                              </button>
                            </div>
                            {group.options.map((option) => (
                              <div key={option.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                                <input
                                  type="text"
                                  value={option.name}
                                  onChange={(e) => updateOption(group.id, option.id, 'name', e.target.value)}
                                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-indigo-500"
                                  placeholder="Option name"
                                />
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[10px] text-slate-500">₹±</span>
                                  <input
                                    type="number"
                                    value={option.priceDelta || ''}
                                    onChange={(e) => updateOption(group.id, option.id, 'priceDelta', parseFloat(e.target.value) || 0)}
                                    className="w-16 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white text-center focus:ring-1 focus:ring-indigo-500"
                                    placeholder="0"
                                  />
                                </div>
                                <label className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0" title="Default">
                                  <input type="checkbox" checked={option.isDefault} onChange={(e) => updateOption(group.id, option.id, 'isDefault', e.target.checked)} className="rounded border-slate-300 text-indigo-600 w-3.5 h-3.5" />
                                  Def
                                </label>
                                <button type="button" onClick={() => removeOptionFromGroup(group.id, option.id)} className="text-rose-400 hover:text-rose-600 p-1 shrink-0"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Errors + Actions */}
            {saveError && (
              <div className="flex items-start gap-1.5 text-rose-500 text-sm font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{saveError}</span>
              </div>
            )}
            {csvImportResult && (
              <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border ${csvImportResult.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                CSV import: {csvImportResult.success} added{csvImportResult.failed > 0 ? `, ${csvImportResult.failed} skipped` : ''}.
                <button type="button" onClick={() => setCsvImportResult(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-11 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 touch-manipulation"
              >
                {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                {saving ? 'Saving…' : editingId ? 'Update Item' : 'Save Item'}
              </button>
              {editingId && (
                <button type="button" onClick={handleCancel} className="px-6 min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors touch-manipulation">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Item List */}
      <div className="space-y-8">
        {sectionCategories.map((category) => {
          const items = menuItems.filter((item) => item.category === category);
          return (
            <div key={category} className={`bg-white rounded-2xl shadow-sm border ${items.length === 0 ? 'border-dashed border-slate-300 opacity-70' : 'border-slate-100'} overflow-hidden`}>
              <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-slate-400" />
                  <h3 className="font-bold text-slate-700 uppercase tracking-wider text-sm flex items-center gap-2">
                    {CATEGORY_ICONS[category] ?? '\u{1F37D}'} {category}
                    {items.length === 0 && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">EMPTY</span>}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { void handleRenameCategory(category); }}
                    disabled={isBulkEdit || renamingCategory !== null}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {renamingCategory === category ? 'Renaming...' : 'Rename'}
                  </button>
                  {!(DEFAULT_CATEGORIES as readonly string[]).includes(category) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      disabled={isBulkEdit || renamingCategory !== null}
                      className="border border-rose-200 text-rose-600 rounded-lg px-3 py-1.5 text-xs font-medium bg-white hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
              {items.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">
                  No items in this category yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {items.map((item) => {
                    if (isBulkEdit) {
                      const draft = bulkDrafts[item.id];
                      const isEdited = !!draft;
                      const currentPrice = draft ? draft.price : item.price;
                      return (
                        <div key={item.id} className={`p-4 sm:px-6 flex items-center gap-4 transition-colors ${isEdited ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                            {!item.isActive && <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Inactive</span>}
                          </div>
                          <div className="w-28 shrink-0">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Price ₹</label>
                            <input
                              type="number"
                              min="0"
                              value={currentPrice || ''}
                              onChange={(e) => setBulkDrafts((prev) => ({ ...prev, [item.id]: { price: parseFloat(e.target.value) || 0 } }))}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                          </div>
                          {isEdited && <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">Edited</span>}
                        </div>
                      );
                    }

                    return (
                      <div key={item.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{item.name}</span>
                            {!item.isActive && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Inactive</span>}
                          </div>
                          {item.description && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md">{item.description}</p>}
                          <div className="text-sm text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className="font-semibold text-indigo-600">₹{item.price}</span>
                            {item.optionGroups?.length > 0 && (
                              <span className="text-xs text-slate-500">
                                {item.optionGroups.map((g) => `${g.name} (${g.options.length})`).join(' · ')}
                              </span>
                            )}
                          </div>
                          {item.tags?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.tags.map((t) => <span key={t} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{t}</span>)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <button onClick={() => handleEdit(item)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit"><Edit2 className="w-5 h-5" /></button>
                          <button
                            onClick={() => { if (window.confirm(`Delete "${item.name}" permanently?`)) onDelete(item.id); }}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          ><Trash2 className="w-5 h-5" /></button>
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
