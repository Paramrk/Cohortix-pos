export type GolaVariant = 'Ice Cream Only' | 'Dry Fruit Only' | 'Ice Cream + Dry Fruit' | 'Plain';
export type VariantMode = 'both' | 'stick_only' | 'dish_only';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  dishPrice?: number;
  category: string;
  hasVariants?: boolean;
  hasGolaVariants?: boolean;
  golaVariantPrices?: Record<GolaVariant, number>;
  defaultGolaVariant?: GolaVariant;
  variantMode?: VariantMode;
}

export interface CartItem extends MenuItem {
  cartItemId: string;
  quantity: number;
  variant?: 'Stick' | 'Dish' | GolaVariant;
  calculatedPrice: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  customerName: string;
  items: CartItem[];
  total: number;
  status: 'pending' | 'completed';
  paymentMethod: 'cash' | 'upi' | 'pay_later';
  paymentStatus: 'paid' | 'unpaid';
  timestamp: number;
  businessDate?: string;
  source?: 'pos' | 'customer';
  clientRequestId?: string;
  shopId?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  timestamp: number;
}

export interface PricingRule {
  discountPercent: number;
  bogoEnabled: boolean;
  bogoType: 'b1g1' | 'b2g1';
}

export interface OrderCreateResult {
  orderId: string;
  orderNumber: number;
  timestamp: number;
  businessDate?: string;
  source?: 'pos' | 'customer';
  clientRequestId?: string;
}

export type ChatRole = 'user' | 'assistant';

export interface AIChatMessage {
  role: ChatRole;
  content: string;
}

export interface AICartSnapshotItem {
  id: string;
  name: string;
  quantity: number;
  variant?: string;
  calculatedPrice: number;
}

export interface AISuggestedItem {
  menuItemId: string;
  name: string;
  quantity: number;
  variant?: string;
  reason: string;
}

export interface AIOrderDraft {
  items: AISuggestedItem[];
  isParcel: boolean;
  customerName?: string;
  orderInstructions?: string;
  summary: string;
}

export type CustomerAIProvider = 'gemini' | 'openai' | 'nvidia' | 'sambanova' | 'ollama';

export type CustomerAIIntent =
  | 'answer'
  | 'recommend'
  | 'cart_update'
  | 'order_draft'
  | 'order_confirm'
  | 'clarify';

export interface CustomerAIRequest {
  shopId: 'main';
  language: 'en' | 'gu';
  provider?: CustomerAIProvider;
  customerName?: string;
  message: string;
  conversation: AIChatMessage[];
  cart: AICartSnapshotItem[];
  pendingOrderDraft?: AIOrderDraft | null;
}

export interface CustomerAIResponse {
  reply: string;
  language: 'en' | 'gu';
  intent: CustomerAIIntent;
  suggestions: AISuggestedItem[];
  orderDraft?: AIOrderDraft | null;
  requiresName: boolean;
  requiresDoubleConfirmation: boolean;
}

export interface CustomerAIProviderConfig {
  enabled: boolean;
  availableProviders: CustomerAIProvider[];
  defaultProvider: CustomerAIProvider | null;
}
