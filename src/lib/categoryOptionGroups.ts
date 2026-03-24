import type { CatalogOption, CatalogOptionGroup } from '../types';

export type CategoryOptionGroupMap = Record<string, CatalogOptionGroup[]>;

export const CATEGORY_OPTION_GROUPS_STORAGE_KEY = 'pos_category_option_groups_v1';
export const CATEGORY_OPTION_GROUPS_UPDATED_EVENT = 'pos-category-option-groups-updated';

function normalizeOption(input: unknown, fallbackName: string, fallbackIndex: number): CatalogOption | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : fallbackName;

  return {
    id: typeof row.id === 'string' && row.id.trim()
      ? row.id
      : `${fallbackName.toLowerCase().replace(/\s+/g, '-')}-${fallbackIndex + 1}`,
    name,
    priceDelta: Number(row.priceDelta ?? row.price_delta ?? 0) || 0,
    isDefault: row.isDefault === true || row.is_default === true,
    isActive: row.isActive !== false && row.is_active !== false,
  };
}

function normalizeOptionGroup(input: unknown, groupIndex: number): CatalogOptionGroup | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `Group ${groupIndex + 1}`;
  const type = row.type === 'addon' ? 'addon' : 'size';
  const selection = row.selection === 'multiple' ? 'multiple' : 'single';
  const options = Array.isArray(row.options)
    ? row.options
      .map((option, optionIndex) => normalizeOption(option, `${name} ${optionIndex + 1}`, optionIndex))
      .filter(Boolean) as CatalogOption[]
    : [];

  return {
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `group-${groupIndex + 1}`,
    name,
    type,
    selection,
    required: row.required === true,
    minSelect: Math.max(0, Number(row.minSelect ?? row.min_select ?? (row.required ? 1 : 0)) || 0),
    maxSelect: Math.max(1, Number(row.maxSelect ?? row.max_select ?? (selection === 'multiple' ? options.length || 1 : 1)) || 1),
    options,
  };
}

function normalizeGroupList(input: unknown): CatalogOptionGroup[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((group, groupIndex) => normalizeOptionGroup(group, groupIndex))
    .filter(Boolean) as CatalogOptionGroup[];
}

export function normalizeCategoryOptionGroupMap(input: unknown): CategoryOptionGroupMap {
  if (!input || typeof input !== 'object') {
    return {};
  }

  if (Array.isArray(input)) {
    const output: CategoryOptionGroupMap = {};
    input.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const row = entry as Record<string, unknown>;
      const category = typeof row.category === 'string' ? row.category.trim() : '';
      if (!category) return;
      const groups = normalizeGroupList(row.optionGroups ?? row.option_groups ?? row.groups);
      if (groups.length > 0) {
        output[category] = groups;
      }
    });
    return output;
  }

  const output: CategoryOptionGroupMap = {};
  Object.entries(input as Record<string, unknown>).forEach(([category, value]) => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory) return;
    const groups = normalizeGroupList(value);
    if (groups.length > 0) {
      output[trimmedCategory] = groups;
    }
  });
  return output;
}

export function loadCategoryOptionGroupMap() {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(CATEGORY_OPTION_GROUPS_STORAGE_KEY);
    if (!raw) return {};
    return normalizeCategoryOptionGroupMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveCategoryOptionGroupMap(map: CategoryOptionGroupMap) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CATEGORY_OPTION_GROUPS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failures; in-memory state still works.
  }
}

export function mergeCategoryOptionGroups(
  itemGroups: CatalogOptionGroup[],
  category: string,
  categoryGroupMap: CategoryOptionGroupMap,
) {
  const categoryGroups = categoryGroupMap[category] ?? [];
  if (categoryGroups.length === 0) return itemGroups;

  const merged = [...itemGroups];
  categoryGroups.forEach((group) => {
    if (!merged.some((existing) => existing.id === group.id)) {
      merged.push(group);
    }
  });
  return merged;
}

export function cloneCatalogOptionGroups(groups: CatalogOptionGroup[]) {
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({ ...option })),
  }));
}
