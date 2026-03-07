const STICK_RESTRICTED_CATEGORIES = new Set([
  'special dish',
  'special  dish',
  'pyali',
  'pyaali',
]);

export function isStickRestrictedCategory(category: string) {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, ' ');
  return STICK_RESTRICTED_CATEGORIES.has(normalized);
}
