import type { MenuItem } from '../types';

export interface QuickPickEntry {
  menuItemId: string;
  lastUsedAt: number;
  useCount: number;
}

export const MOBILE_QUICK_PICKS_STORAGE_KEY = 'pos_mobile_quick_picks_v1';
const MAX_STORED_QUICK_PICKS = 40;

function sortEntries(entries: QuickPickEntry[]) {
  return [...entries].sort((left, right) =>
    right.lastUsedAt - left.lastUsedAt ||
    right.useCount - left.useCount ||
    left.menuItemId.localeCompare(right.menuItemId),
  );
}

function writeQuickPickEntries(entries: QuickPickEntry[]) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      MOBILE_QUICK_PICKS_STORAGE_KEY,
      JSON.stringify(sortEntries(entries).slice(0, MAX_STORED_QUICK_PICKS)),
    );
  } catch {
    // Ignore storage failures; quick picks remain best-effort only.
  }
}

export function loadQuickPickEntries(): QuickPickEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(MOBILE_QUICK_PICKS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const deduped = new Map<string, QuickPickEntry>();
    for (const entry of parsed) {
      const row = entry as Record<string, unknown>;
      const menuItemId = typeof row.menuItemId === 'string' ? row.menuItemId.trim() : '';
      const lastUsedAt = Number(row.lastUsedAt);
      const useCount = Number(row.useCount);

      if (!menuItemId || !Number.isFinite(lastUsedAt) || !Number.isFinite(useCount) || useCount <= 0) {
        continue;
      }

      const current = deduped.get(menuItemId);
      if (!current) {
        deduped.set(menuItemId, {
          menuItemId,
          lastUsedAt,
          useCount,
        });
        continue;
      }

      deduped.set(menuItemId, {
        menuItemId,
        lastUsedAt: Math.max(current.lastUsedAt, lastUsedAt),
        useCount: Math.max(current.useCount, useCount),
      });
    }

    return sortEntries(Array.from(deduped.values())).slice(0, MAX_STORED_QUICK_PICKS);
  } catch {
    return [];
  }
}

export function recordQuickPickUsage(menuItemId: string, timestamp = Date.now()) {
  const normalizedId = menuItemId.trim();
  if (!normalizedId) return loadQuickPickEntries();

  const entries = loadQuickPickEntries();
  const existing = entries.find((entry) => entry.menuItemId === normalizedId);
  const nextEntries = existing
    ? entries.map((entry) =>
      entry.menuItemId === normalizedId
        ? {
          ...entry,
          lastUsedAt: timestamp,
          useCount: entry.useCount + 1,
        }
        : entry,
    )
    : [
      ...entries,
      {
        menuItemId: normalizedId,
        lastUsedAt: timestamp,
        useCount: 1,
      },
    ];

  writeQuickPickEntries(nextEntries);
  return sortEntries(nextEntries).slice(0, MAX_STORED_QUICK_PICKS);
}

export function resolveQuickPickItems(
  menuItems: MenuItem[],
  quickPickEntries: QuickPickEntry[],
  limit = 8,
) {
  const entryById = new Map(quickPickEntries.map((entry) => [entry.menuItemId, entry] as const));
  const activeItemsById = new Map(
    menuItems
      .filter((item) => item.isActive)
      .map((item) => [item.id, item] as const),
  );

  return sortEntries(quickPickEntries)
    .map((entry) => activeItemsById.get(entry.menuItemId))
    .filter((item): item is MenuItem => Boolean(item))
    .sort((left, right) =>
      (entryById.get(right.id)?.lastUsedAt ?? 0) - (entryById.get(left.id)?.lastUsedAt ?? 0) ||
      (entryById.get(right.id)?.useCount ?? 0) - (entryById.get(left.id)?.useCount ?? 0) ||
      left.name.localeCompare(right.name),
    )
    .slice(0, limit);
}
