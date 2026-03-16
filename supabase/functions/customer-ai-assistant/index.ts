import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHOP_ID = 'main';
const GOLA_VARIANTS = ['Plain', 'Ice Cream Only', 'Dry Fruit Only', 'Ice Cream + Dry Fruit'] as const;
const AI_PROVIDERS = ['gemini', 'openai', 'nvidia', 'sambanova', 'ollama'] as const;
const DEFAULT_PROVIDER = (Deno.env.get('CUSTOMER_AI_DEFAULT_PROVIDER') ?? 'gemini').trim().toLowerCase();
const GEMINI_API_KEY = Deno.env.get('CUSTOMER_AI_GEMINI_API_KEY') ?? Deno.env.get('GEMINI_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('CUSTOMER_AI_OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('CUSTOMER_AI_OPENAI_MODEL') ?? 'gpt-4o-mini';
const NVIDIA_API_KEY = Deno.env.get('CUSTOMER_AI_NVIDIA_API_KEY') ?? '';
const NVIDIA_MODEL = Deno.env.get('CUSTOMER_AI_NVIDIA_MODEL') ?? 'meta/llama-3.1-70b-instruct';
const SAMBANOVA_API_KEY = Deno.env.get('CUSTOMER_AI_SAMBANOVA_API_KEY') ?? '';
const SAMBANOVA_MODEL = Deno.env.get('CUSTOMER_AI_SAMBANOVA_MODEL') ?? 'Meta-Llama-3.3-70B-Instruct';
const OLLAMA_MODEL = Deno.env.get('CUSTOMER_AI_OLLAMA_MODEL') ?? 'llama3';
const OLLAMA_API_KEY = Deno.env.get('CUSTOMER_AI_OLLAMA_API_KEY') ?? '';
const ALLOWED_INTENTS = new Set([
  'answer',
  'recommend',
  'cart_update',
  'order_draft',
  'order_confirm',
  'clarify',
]);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

type AIProvider = typeof AI_PROVIDERS[number];

interface RequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestDraftItem {
  menuItemId: string;
  name: string;
  quantity: number;
  variant?: string;
  reason: string;
}

interface RequestPayload {
  shopId: 'main';
  language: 'en' | 'gu';
  provider?: AIProvider;
  action?: 'providers';
  customerName?: string;
  message: string;
  conversation: RequestMessage[];
  cart: Array<{
    id: string;
    name: string;
    quantity: number;
    variant?: string;
    calculatedPrice: number;
  }>;
  pendingOrderDraft?: {
    items: RequestDraftItem[];
    isParcel: boolean;
    customerName?: string;
    orderInstructions?: string;
    summary: string;
  } | null;
}

interface MenuRow {
  id: string;
  name: string;
  category: string;
  price: number;
  dish_price: number | null;
  has_variants: boolean | null;
  has_gola_variants: boolean | null;
  gola_variant_prices: Record<string, number> | null;
  default_gola_variant: string | null;
  variant_mode: 'both' | 'stick_only' | 'dish_only' | null;
  shop_id: string | null;
}

interface ProfileRow {
  menu_item_id: string | null;
  menu_item_name: string;
  category: string | null;
  aliases_en: string[] | null;
  aliases_gu: string[] | null;
  description_en: string | null;
  description_gu: string | null;
  flavor_tags: string[] | null;
  ingredient_tags: string[] | null;
  texture_tags: string[] | null;
  best_for: string[] | null;
  recommended_variant: string | null;
  recommended_quantity: number | null;
}

interface CustomerAppSettingsRow {
  shop_id: string;
  customer_ai_enabled: boolean;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isAIProvider(value: string): value is AIProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

function getConfiguredProviders() {
  const providers: AIProvider[] = [];
  if (GEMINI_API_KEY) providers.push('gemini');
  if (OPENAI_API_KEY) providers.push('openai');
  if (NVIDIA_API_KEY) providers.push('nvidia');
  if (SAMBANOVA_API_KEY) providers.push('sambanova');
  if (OLLAMA_URL) providers.push('ollama');
  return providers;
}

function normalizeOpenAICompatibleBaseUrl(value: string, fallback?: string) {
  const raw = (value || fallback || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  return raw
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/v1$/i, '');
}

const NVIDIA_BASE_URL = normalizeOpenAICompatibleBaseUrl(
  Deno.env.get('CUSTOMER_AI_NVIDIA_BASE_URL') ?? '',
  'https://integrate.api.nvidia.com',
);
const OLLAMA_URL = normalizeOpenAICompatibleBaseUrl(Deno.env.get('CUSTOMER_AI_OLLAMA_URL') ?? '');

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined, relation: string) {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  return typeof error.message === 'string' && error.message.includes(relation);
}

function getDefaultProvider(configuredProviders: AIProvider[]) {
  if (isAIProvider(DEFAULT_PROVIDER) && configuredProviders.includes(DEFAULT_PROVIDER)) {
    return DEFAULT_PROVIDER;
  }
  return configuredProviders[0] ?? null;
}

async function getCustomerAIEnabled(supabase: ReturnType<typeof createClient>, shopId: string) {
  const { data, error } = await supabase
    .from('customer_app_settings')
    .select('shop_id, customer_ai_enabled')
    .eq('shop_id', shopId)
    .maybeSingle<CustomerAppSettingsRow>();

  if (isMissingRelationError(error, 'customer_app_settings')) {
    return true;
  }

  if (error) {
    throw new Error(`Customer AI settings query failed: ${error.message}`);
  }

  return data?.customer_ai_enabled !== false;
}

function resolveProvider(requestedProvider: unknown, configuredProviders: AIProvider[]) {
  const normalized = typeof requestedProvider === 'string' ? requestedProvider.trim().toLowerCase() : '';
  if (isAIProvider(normalized) && configuredProviders.includes(normalized)) {
    return normalized;
  }
  return getDefaultProvider(configuredProviders);
}

function buildFallbackResponse(language: 'en' | 'gu', reply?: string) {
  return {
    reply: reply ?? (
      language === 'gu'
        ? 'હું હમણાં યોગ્ય ભલામણ આપી શક્યો નથી. કૃપા કરીને સ્વાદ અથવા પસંદગી થોડું વધુ સ્પષ્ટ લખો.'
        : 'I could not prepare a reliable recommendation right now. Please describe your preferred flavor a bit more clearly.'
    ),
    language,
    intent: 'clarify',
    suggestions: [],
    orderDraft: null,
    requiresName: false,
    requiresDoubleConfirmation: false,
  };
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCategoryName(category: string) {
  return category.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isStickRestrictedCategory(category: string) {
  const normalized = normalizeCategoryName(category);
  return normalized === 'special' || normalized === 'special dish' || normalized === 'pyali' || normalized === 'pyaali';
}

function getAvailableVariants(item: MenuRow) {
  const stickAllowedByCategory = !isStickRestrictedCategory(item.category ?? '');
  const mode = item.variant_mode ?? 'both';
  const canShowStickVariant = Boolean(item.has_variants && stickAllowedByCategory && mode !== 'dish_only');
  const canShowDishVariant = Boolean(item.has_variants && mode !== 'stick_only');
  const variants: string[] = [];

  if (canShowStickVariant) {
    variants.push('Stick');
  }

  if (item.has_gola_variants && canShowDishVariant) {
    variants.push(...GOLA_VARIANTS);
  } else if (canShowDishVariant) {
    variants.push('Dish');
  }

  return variants;
}

function defaultVariantForItem(item: MenuRow, profile?: ProfileRow) {
  const availableVariants = getAvailableVariants(item);
  if (availableVariants.length === 0) return undefined;
  if (profile?.recommended_variant && availableVariants.includes(profile.recommended_variant)) {
    return profile.recommended_variant;
  }
  if (item.has_gola_variants) {
    return item.default_gola_variant && availableVariants.includes(item.default_gola_variant)
      ? item.default_gola_variant
      : 'Plain';
  }
  if (availableVariants.includes('Stick')) return 'Stick';
  if (availableVariants.includes('Dish')) return 'Dish';
  return availableVariants[0];
}

function normalizeVariantForItem(item: MenuRow, requestedVariant: unknown, profile?: ProfileRow) {
  const normalized = normalizeText(requestedVariant).toLowerCase().replace(/\s+/g, ' ');
  const availableVariants = getAvailableVariants(item);
  if (!normalized) {
    return defaultVariantForItem(item, profile);
  }

  const matched = availableVariants.find((variant) => variant.toLowerCase().replace(/\s+/g, ' ') === normalized);
  if (matched) return matched;

  if (normalized === 'dish' && item.has_gola_variants && availableVariants.length > 0) {
    return defaultVariantForItem(item, profile);
  }

  return null;
}

function compactArray(value: string[] | null | undefined) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
    : [];
}

function normalizeScopeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMenuItem(
  rawItem: Record<string, unknown>,
  menuById: Map<string, MenuRow>,
  menuByName: Map<string, MenuRow>,
) {
  const menuItemId = normalizeText(rawItem.menuItemId);
  if (menuItemId && menuById.has(menuItemId)) {
    return menuById.get(menuItemId)!;
  }

  const name = normalizeText(rawItem.name).toLowerCase();
  if (name && menuByName.has(name)) {
    return menuByName.get(name)!;
  }

  return null;
}

function findCustomMixMenuItem(menu: MenuRow[]) {
  const candidates = menu.filter((item) => /\bmix\b/i.test(item.name));
  if (candidates.length === 0) return null;

  const exactMixItem = candidates.find((item) => item.name.trim().toLowerCase() === 'mix item');
  if (exactMixItem) return exactMixItem;

  const exactMixFruit = candidates.find((item) => item.name.trim().toLowerCase() === 'mix fruit');
  if (exactMixFruit) return exactMixFruit;

  return candidates[0];
}

function isCustomMixRequest(message: string) {
  const normalized = normalizeScopeText(message);
  if (!normalized) return false;

  const customMixPatterns = [
    /\bcustom\b/,
    /\bmix\b/,
    /\bcombine\b/,
    /\bcombination\b/,
    /\bwith(out)?\b/,
    /\bless\b/,
    /\bextra\b/,
    /\bmore\b/,
    /\bno\b/,
    /\bwithout\b/,
    /(customized|customised)/,
    /(મિક્સ|કસ્ટમ|ભેળવી|ભેળવો|ઓછું|વધારે|વગર|સાથે|જોડીને)/,
  ];

  return customMixPatterns.some((pattern) => pattern.test(normalized));
}

function sanitizeSuggestion(
  rawItem: unknown,
  menuById: Map<string, MenuRow>,
  menuByName: Map<string, MenuRow>,
  profilesByMenuId: Map<string, ProfileRow>,
) {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;

  const record = rawItem as Record<string, unknown>;
  const menuItem = findMenuItem(record, menuById, menuByName);
  if (!menuItem) return null;

  const profile = profilesByMenuId.get(menuItem.id);
  const variant = normalizeVariantForItem(menuItem, record.variant, profile);
  if (record.variant && variant === null) return null;

  const quantity = Math.min(20, Math.max(1, Math.round(Number(record.quantity) || profile?.recommended_quantity || 1)));
  const reason = normalizeText(record.reason) || (
    profile?.description_en ||
    profile?.description_gu ||
    (menuItem.category ? `${menuItem.category} menu recommendation.` : 'Recommended for your request.')
  );

  return {
    menuItemId: menuItem.id,
    name: menuItem.name,
    quantity,
    variant: variant ?? undefined,
    reason,
  };
}

function stripCodeFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

async function callGemini(prompt: string) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured for customer-ai-assistant.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${errorText}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callOpenAICompatible(options: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  prompt: string;
  jsonMode?: boolean;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  const body: Record<string, unknown> = {
    model: options.model,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: 'Return valid JSON only. Do not use markdown fences.',
      },
      {
        role: 'user',
        content: options.prompt,
      },
    ],
  };

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${options.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider request failed: ${errorText}`);
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return payload.choices?.[0]?.message?.content ?? '';
}

async function callProvider(prompt: string, provider: AIProvider) {
  if (provider === 'gemini') {
    return callGemini(prompt);
  }

  if (provider === 'openai') {
    return callOpenAICompatible({
      baseUrl: 'https://api.openai.com',
      model: OPENAI_MODEL,
      apiKey: OPENAI_API_KEY,
      prompt,
      jsonMode: true,
    });
  }

  if (provider === 'nvidia') {
    return callOpenAICompatible({
      baseUrl: NVIDIA_BASE_URL,
      model: NVIDIA_MODEL,
      apiKey: NVIDIA_API_KEY,
      prompt,
    });
  }

  if (provider === 'sambanova') {
    return callOpenAICompatible({
      baseUrl: 'https://api.sambanova.ai',
      model: SAMBANOVA_MODEL,
      apiKey: SAMBANOVA_API_KEY,
      prompt,
    });
  }

  return callOpenAICompatible({
    baseUrl: OLLAMA_URL,
    model: OLLAMA_MODEL,
    apiKey: OLLAMA_API_KEY || undefined,
    prompt,
  });
}

function buildPrompt(payload: RequestPayload, menu: MenuRow[], profilesByMenuId: Map<string, ProfileRow>) {
  const customMixItem = findCustomMixMenuItem(menu);
  const menuContext = menu.map((item) => {
    const profile = profilesByMenuId.get(item.id);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      dishPrice: item.dish_price,
      availableVariants: getAvailableVariants(item),
      recommendedVariant: defaultVariantForItem(item, profile),
      aliasesEn: compactArray(profile?.aliases_en),
      aliasesGu: compactArray(profile?.aliases_gu),
      descriptionEn: profile?.description_en ?? '',
      descriptionGu: profile?.description_gu ?? '',
      flavorTags: compactArray(profile?.flavor_tags),
      ingredientTags: compactArray(profile?.ingredient_tags),
      textureTags: compactArray(profile?.texture_tags),
      bestFor: compactArray(profile?.best_for),
    };
  });

  const conversation = payload.conversation.slice(-8).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  return `You are a customer-facing menu assistant for Nilkanth Ice Dish Gola.

Rules:
- Reply in ${payload.language === 'gu' ? 'Gujarati script' : 'English'} unless the user clearly asks otherwise.
- You may answer general conversation too, but any product suggestion, cart action, or order draft must use MENU_CONTEXT only.
- Only recommend products that exist in MENU_CONTEXT.
- Use exact menu item IDs from MENU_CONTEXT.
- If the request is unclear or low confidence, ask a clarifying question.
- Prefer 1 to 3 recommendations unless the user explicitly asks for more.
- If the user wants an order made, prepare an order draft but never claim the order is already placed.
- Order placement requires two explicit confirmations on the client side.
- Do not invent prices, products, or variants.
- Variants must match the item's availableVariants list.
- Keep the reply concise and customer-friendly.
- If the customer asks for a custom combination, preparation, or ingredient adjustment and CUSTOM_MIX_ITEM_CONTEXT is available, create an order draft using that exact mix item and put the customization request inside orderDraft.orderInstructions.
- Do not invent a custom item name. Only use CUSTOM_MIX_ITEM_CONTEXT when handling such custom requests.

Return JSON with this exact shape:
{
  "reply": "string",
  "language": "${payload.language}",
  "intent": "answer|recommend|cart_update|order_draft|order_confirm|clarify",
  "suggestions": [
    {
      "menuItemId": "string",
      "name": "string",
      "quantity": 1,
      "variant": "string or omit",
      "reason": "string"
    }
  ],
  "orderDraft": {
    "items": [],
    "isParcel": false,
    "customerName": "string or omit",
    "orderInstructions": "string or omit",
    "summary": "string"
  },
  "requiresName": false,
  "requiresDoubleConfirmation": false
}

CURRENT_CUSTOMER_NAME: ${payload.customerName || '(not provided)'}
CURRENT_CART: ${JSON.stringify(payload.cart)}
PENDING_ORDER_DRAFT: ${JSON.stringify(payload.pendingOrderDraft ?? null)}
RECENT_CONVERSATION: ${JSON.stringify(conversation)}
CUSTOM_MIX_ITEM_CONTEXT: ${JSON.stringify(customMixItem ? {
    id: customMixItem.id,
    name: customMixItem.name,
    category: customMixItem.category,
    availableVariants: getAvailableVariants(customMixItem),
    recommendedVariant: defaultVariantForItem(customMixItem),
  } : null)}
MENU_CONTEXT: ${JSON.stringify(menuContext)}
USER_MESSAGE: ${JSON.stringify(payload.message)}
`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const configuredProviders = getConfiguredProviders();
  const defaultProvider = getDefaultProvider(configuredProviders);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(buildFallbackResponse('en', 'Invalid request payload.'));
  }

  const shopId = normalizeText(payload.shopId) || SHOP_ID;
  const language = payload.language === 'gu' ? 'gu' : 'en';
  let customerAIEnabled = true;

  try {
    customerAIEnabled = await getCustomerAIEnabled(supabase, shopId);
  } catch (error) {
    console.error('[customer-ai-assistant] settings query failed', error);
    return jsonResponse(buildFallbackResponse(
      language,
      language === 'gu'
        ? 'હમણાં AI સેવા ઉપલબ્ધ નથી. કૃપા કરીને થોડા સમય પછી ફરી પ્રયાસ કરો.'
        : 'The AI assistant is temporarily unavailable right now. Please try again shortly.',
    ));
  }

  if (payload.action === 'providers') {
    return jsonResponse({
      ok: true,
      enabled: customerAIEnabled,
      availableProviders: configuredProviders,
      defaultProvider,
    });
  }

  if (!customerAIEnabled) {
    return jsonResponse(buildFallbackResponse(
      language,
      language === 'gu'
        ? 'હાલ માટે ગ્રાહક AI બંધ છે. કૃપા કરીને મેનૂમાંથી સીધો ઓર્ડર આપો.'
        : 'Customer AI is turned off right now. Please place your order directly from the menu.',
    ));
  }

  const safePayload: RequestPayload = {
    shopId,
    language,
    provider: isAIProvider(String(payload.provider ?? '')) ? payload.provider : undefined,
    customerName: normalizeText(payload.customerName) || undefined,
    message: normalizeText(payload.message),
    conversation: Array.isArray(payload.conversation)
      ? payload.conversation.filter((message) => message && typeof message.content === 'string' && (message.role === 'user' || message.role === 'assistant'))
      : [],
    cart: Array.isArray(payload.cart) ? payload.cart : [],
    pendingOrderDraft: payload.pendingOrderDraft ?? null,
  };

  if (!safePayload.message) {
    return jsonResponse(buildFallbackResponse(language));
  }

  if (configuredProviders.length === 0) {
    return jsonResponse(buildFallbackResponse(
      language,
      language === 'gu'
        ? 'સર્વર પર કોઈ AI પ્રોવાઇડર કોન્ફિગર થયેલો નથી.'
        : 'No AI provider is configured on the server.',
    ));
  }

  try {
    const provider = resolveProvider(safePayload.provider, configuredProviders);
    if (!provider) {
      return jsonResponse(buildFallbackResponse(language));
    }

    const [{ data: menuData, error: menuError }, { data: profileData, error: profileError }] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, name, category, price, dish_price, has_variants, has_gola_variants, gola_variant_prices, default_gola_variant, variant_mode, shop_id')
        .eq('shop_id', shopId)
        .order('created_at'),
      supabase
        .from('menu_item_ai_profiles')
        .select('menu_item_id, menu_item_name, category, aliases_en, aliases_gu, description_en, description_gu, flavor_tags, ingredient_tags, texture_tags, best_for, recommended_variant, recommended_quantity')
        .eq('shop_id', shopId),
    ]);

    if (menuError) {
      console.error('[customer-ai-assistant] menu query failed', menuError.message);
      return jsonResponse(buildFallbackResponse(language));
    }

    if (profileError) {
      console.error('[customer-ai-assistant] profile query failed', profileError.message);
    }

    const menu = (menuData ?? []).filter((item) => item.name !== '__pricing_rule__') as MenuRow[];
    const profiles = (profileData ?? []) as ProfileRow[];
    const customMixItem = findCustomMixMenuItem(menu);
    const menuById = new Map(menu.map((item) => [item.id, item]));
    const menuByName = new Map(menu.map((item) => [item.name.trim().toLowerCase(), item]));
    const profilesByMenuId = new Map(
      profiles
        .filter((profile) => profile.menu_item_id && menuById.has(profile.menu_item_id))
        .map((profile) => [profile.menu_item_id!, profile]),
    );

    const prompt = buildPrompt(safePayload, menu, profilesByMenuId);
    const rawModelResponse = await callProvider(prompt, provider);
    const parsedModelResponse = JSON.parse(stripCodeFence(rawModelResponse)) as Record<string, unknown>;

    const rawSuggestions = Array.isArray(parsedModelResponse.suggestions) ? parsedModelResponse.suggestions : [];
    const suggestions = rawSuggestions
      .map((item) => sanitizeSuggestion(item, menuById, menuByName, profilesByMenuId))
      .filter((item): item is NonNullable<ReturnType<typeof sanitizeSuggestion>> => item !== null);

    const rawOrderDraft = parsedModelResponse.orderDraft && typeof parsedModelResponse.orderDraft === 'object'
      ? parsedModelResponse.orderDraft as Record<string, unknown>
      : null;
    const draftItemsSource = Array.isArray(rawOrderDraft?.items) ? rawOrderDraft.items : rawSuggestions;
    const draftItems = draftItemsSource
      .map((item) => sanitizeSuggestion(item, menuById, menuByName, profilesByMenuId))
      .filter((item): item is NonNullable<ReturnType<typeof sanitizeSuggestion>> => item !== null);
    const customMixRequested = isCustomMixRequest(safePayload.message) && Boolean(customMixItem);
    const customMixVariant = customMixItem ? (defaultVariantForItem(customMixItem) ?? undefined) : undefined;
    const draftCustomerName = normalizeText(rawOrderDraft?.customerName)
      || normalizeText(parsedModelResponse.customerName)
      || safePayload.customerName
      || undefined;
    const fallbackCustomInstructions = normalizeText(rawOrderDraft?.orderInstructions)
      || normalizeText(parsedModelResponse.customizationInstructions)
      || safePayload.message;
    const fallbackCustomMixDraft = customMixRequested && customMixItem
      ? {
        items: [{
          menuItemId: customMixItem.id,
          name: customMixItem.name,
          quantity: 1,
          variant: customMixVariant,
          reason: language === 'gu'
            ? 'તમારી કસ્ટમ રિક્વેસ્ટ માટે મિક્સ આઇટમ તરીકે તૈયાર કરેલું ડ્રાફ્ટ.'
            : 'Prepared as a custom mix draft for your requested customization.',
        }],
        isParcel: Boolean(rawOrderDraft?.isParcel),
        customerName: draftCustomerName,
        orderInstructions: fallbackCustomInstructions,
        summary: normalizeText(rawOrderDraft?.summary)
          || (language === 'gu'
            ? `${customMixItem.name} માટે કસ્ટમ સૂચનાઓ ઉમેરવામાં આવી છે.`
            : `Custom instructions have been added for ${customMixItem.name}.`),
      }
      : null;
    const orderDraft = draftItems.length > 0
      ? {
        items: draftItems,
        isParcel: Boolean(rawOrderDraft?.isParcel),
        customerName: draftCustomerName,
        orderInstructions: normalizeText(rawOrderDraft?.orderInstructions) || undefined,
        summary: normalizeText(rawOrderDraft?.summary) || normalizeText(parsedModelResponse.reply) || '',
      }
      : fallbackCustomMixDraft;

    const intent = normalizeText(parsedModelResponse.intent);
    const normalizedIntent = ALLOWED_INTENTS.has(intent)
      ? intent
      : (orderDraft ? 'order_draft' : suggestions.length > 0 ? 'recommend' : 'clarify');
    const reply = normalizeText(parsedModelResponse.reply)
      || (fallbackCustomMixDraft
        ? (language === 'gu'
          ? `હું ${customMixItem?.name ?? 'મિક્સ આઇટમ'} હેઠળ કસ્ટમ ઓર્ડર ડ્રાફ્ટ તૈયાર કરી શકું છું. કૃપા કરીને સૂચનાઓ ચેક કરો.`
          : `I can prepare this as a custom order under ${customMixItem?.name ?? 'Mix Item'}. Please review the instructions.`)
        : buildFallbackResponse(language).reply);
    const requiresDoubleConfirmation = Boolean(orderDraft && orderDraft.items.length > 0);
    const requiresName = requiresDoubleConfirmation && !safePayload.customerName;

    return jsonResponse({
      reply,
      language,
      intent: normalizedIntent,
      suggestions,
      orderDraft,
      requiresName,
      requiresDoubleConfirmation,
    });
  } catch (error) {
    console.error('[customer-ai-assistant] unexpected failure', error);
    const message = error instanceof Error ? error.message : undefined;
    return jsonResponse(buildFallbackResponse(language, message));
  }
});
