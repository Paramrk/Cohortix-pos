import type { Session } from '@supabase/supabase-js';
import type {
  AppRole,
  CartItem,
  CatalogOption,
  CatalogOptionGroup,
  MenuItem,
  SelectedOption,
  ServiceMode,
} from '../types';

const ORDER_META_PREFIX = 'ORDER_META:';

export interface ParsedOrderMeta {
  displayLabel: string;
  serviceMode: ServiceMode;
  tableNumber?: number;
  notes?: string;
}

export interface MenuConfigRow {
  menu_item_id: string;
  description?: string | null;
  tags?: unknown;
  option_groups?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

function sanitizeRole(value: unknown): AppRole | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'owner' || normalized === 'admin') return 'owner';
  if (normalized === 'waiter' || normalized === 'staff') return 'waiter';
  return null;
}

function normalizeTableNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function extractTableNumberFromLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const tableMatch = trimmed.match(/^(?:table|tbl|t)\s*#?\s*(\d+)\b/i);
  if (tableMatch) {
    return normalizeTableNumber(tableMatch[1]);
  }

  return null;
}

export function getSessionRole(session: Session | null): AppRole | null {
  if (!session) return null;
  const user = session.user;
  return (
    sanitizeRole(user.role) ||
    sanitizeRole(user.app_metadata?.role) ||
    sanitizeRole(user.user_metadata?.role) ||
    null
  );
}

export function formatServiceModeLabel(mode: ServiceMode) {
  if (mode === 'dine_in') return 'Dine In';
  if (mode === 'takeaway') return 'Parcel';
  return 'Delivery';
}

export function defaultDisplayLabel(serviceMode: ServiceMode) {
  if (serviceMode === 'dine_in') return 'Walk-in Table';
  if (serviceMode === 'takeaway') return 'Takeaway';
  return 'Delivery';
}

export function normalizeDisplayLabel(value: string, serviceMode: ServiceMode) {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return defaultDisplayLabel(serviceMode);
}

export function buildOrderInstructions(
  meta: { displayLabel: string; serviceMode: ServiceMode },
  notes?: string,
) {
  const normalizedNotes = notes?.trim();
  const metaLine = `${ORDER_META_PREFIX}${JSON.stringify({
    displayLabel: normalizeDisplayLabel(meta.displayLabel, meta.serviceMode),
    serviceMode: meta.serviceMode,
  })}`;

  return normalizedNotes ? `${metaLine}\n\n${normalizedNotes}` : metaLine;
}

export function parseOrderInstructions(
  value?: string,
  customerName?: string,
): ParsedOrderMeta {
  const fallbackLabel = customerName?.trim() || 'Walk-in';
  if (!value?.trim()) {
    const tableNumber = extractTableNumberFromLabel(fallbackLabel);
    return {
      displayLabel: fallbackLabel,
      serviceMode: 'dine_in',
      tableNumber: tableNumber ?? undefined,
    };
  }

  const [firstLine, ...rest] = value.split('\n');
  if (!firstLine.startsWith(ORDER_META_PREFIX)) {
    return {
      displayLabel: fallbackLabel,
      serviceMode: 'dine_in',
      notes: value.trim() || undefined,
    };
  }

  try {
    const meta = JSON.parse(firstLine.slice(ORDER_META_PREFIX.length)) as {
      displayLabel?: unknown;
      serviceMode?: unknown;
      tableNumber?: unknown;
    };
    const serviceMode: ServiceMode =
      meta.serviceMode === 'takeaway' || meta.serviceMode === 'delivery' || meta.serviceMode === 'dine_in'
        ? meta.serviceMode
        : 'dine_in';
    const notes = rest.join('\n').trim() || undefined;
    const tableNumber = normalizeTableNumber(meta.tableNumber) ?? extractTableNumberFromLabel(String(meta.displayLabel ?? fallbackLabel));
    return {
      displayLabel: normalizeDisplayLabel(String(meta.displayLabel ?? fallbackLabel), serviceMode),
      serviceMode,
      tableNumber: tableNumber ?? undefined,
      notes,
    };
  } catch {
    const tableNumber = extractTableNumberFromLabel(fallbackLabel);
    return {
      displayLabel: fallbackLabel,
      serviceMode: 'dine_in',
      tableNumber: tableNumber ?? undefined,
      notes: value.trim() || undefined,
    };
  }
}

export function optionSummary(options: SelectedOption[]) {
  if (!options.length) return '';
  return options.map((option) => option.optionName).join(', ');
}

export function calculateCartLinePrice(basePrice: number, selectedOptions: SelectedOption[]) {
  return Math.max(
    0,
    Math.round(
      basePrice + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0),
    ),
  );
}

function parseStringArray(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

function normalizeOption(input: unknown, fallbackName: string, fallbackIndex: number): CatalogOption | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : fallbackName;
  return {
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `${fallbackName.toLowerCase().replace(/\s+/g, '-')}-${fallbackIndex + 1}`,
    name,
    priceDelta: Number(row.priceDelta ?? row.price_delta ?? 0) || 0,
    isDefault: row.isDefault === true || row.is_default === true,
    isActive: row.isActive !== false && row.is_active !== false,
  };
}

function normalizeOptionGroups(input: unknown): CatalogOptionGroup[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((group, groupIndex) => {
      if (!group || typeof group !== 'object') return null;
      const row = group as Record<string, unknown>;
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
      } satisfies CatalogOptionGroup;
    })
    .filter(Boolean) as CatalogOptionGroup[];
}

export function buildFallbackOptionGroups(row: Record<string, unknown>): CatalogOptionGroup[] {
  const basePrice = Number(row.price ?? 0) || 0;
  const dishPrice = Number(row.dish_price ?? 0) || 0;
  const hasGolaVariants = row.has_gola_variants === true && row.gola_variant_prices && typeof row.gola_variant_prices === 'object';
  const fallbackGroups: CatalogOptionGroup[] = [];

  if (dishPrice > 0) {
    fallbackGroups.push({
      id: 'legacy-size',
      name: 'Size',
      type: 'size',
      selection: 'single',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'regular', name: 'Regular', priceDelta: 0, isDefault: true, isActive: true },
        { id: 'large', name: 'Large', priceDelta: Math.max(0, dishPrice - basePrice), isDefault: false, isActive: true },
      ],
    });
  }

  if (hasGolaVariants) {
    const rawMap = row.gola_variant_prices as Record<string, unknown>;
    const options = Object.entries(rawMap)
      .map(([name, price], index) => ({
        id: `legacy-option-${index + 1}`,
        name,
        priceDelta: Math.max(0, (Number(price) || 0) - basePrice),
        isDefault: String(row.default_gola_variant ?? '') === name,
        isActive: true,
      }));
    if (options.length > 0) {
      fallbackGroups.push({
        id: 'legacy-options',
        name: 'Options',
        type: 'size',
        selection: 'single',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options,
      });
    }
  }

  return fallbackGroups;
}

export function toCatalogItem(
  row: Record<string, unknown>,
  config?: MenuConfigRow | null,
): MenuItem {
  const optionGroups = normalizeOptionGroups(config?.option_groups);
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? 'Main'),
    price: Number(row.price ?? 0) || 0,
    description: typeof config?.description === 'string' && config.description.trim() ? config.description.trim() : undefined,
    tags: parseStringArray(config?.tags),
    sortOrder: Number(config?.sort_order ?? 0) || 0,
    isActive: config?.is_active !== false,
    optionGroups: optionGroups.length > 0 ? optionGroups : buildFallbackOptionGroups(row),
  };
}

export function selectedOptionsFromUnknown(input: unknown): SelectedOption[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((option) => {
      if (!option || typeof option !== 'object') return null;
      const row = option as Record<string, unknown>;
      return {
        groupId: String(row.groupId ?? row.group_id ?? ''),
        groupName: String(row.groupName ?? row.group_name ?? ''),
        optionId: String(row.optionId ?? row.option_id ?? ''),
        optionName: String(row.optionName ?? row.option_name ?? ''),
        priceDelta: Number(row.priceDelta ?? row.price_delta ?? 0) || 0,
      } satisfies SelectedOption;
    })
    .filter((option) => option && option.groupId && option.optionId) as SelectedOption[];
}

export function toOrderLinePayload(item: CartItem) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    price: item.price,
    calculatedPrice: item.calculatedPrice,
    lineTotal: item.lineTotal,
    selectedOptions: item.selectedOptions.map((option) => ({
      groupId: option.groupId,
      groupName: option.groupName,
      optionId: option.optionId,
      optionName: option.optionName,
      priceDelta: option.priceDelta,
    })),
    selectedOptionSummary: optionSummary(item.selectedOptions),
  };
}

export function buildMenuConfigPayload(item: Omit<MenuItem, 'id'>) {
  return {
    description: item.description ?? null,
    tags: item.tags,
    option_groups: item.optionGroups,
    sort_order: item.sortOrder,
    is_active: item.isActive,
  };
}
