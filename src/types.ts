export type GolaVariant = 'Ice Cream Only' | 'Dry Fruit Only' | 'Ice Cream + Dry Fruit' | 'Plain';

/** Controls which Stick/Dish variants are offered for Regular items. */
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
  /** Restricts which variants the POS shows for this item (Regular category only). Defaults to 'both'. */
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
  orderInstructions?: string;
  items: CartItem[];
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
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

export interface DashboardMetrics {
  businessDate: string;
  shopId: string;
  todayTotalSales: number;
  todayCollected: number;
  todayPending: number;
  todayExpenses: number;
  todayNetProfit: number;
  monthTotalSales: number;
  monthCollected: number;
  monthPending: number;
  monthExpenses: number;
  monthNetProfit: number;
}

export type AnalyticsRange = 'day' | 'week' | 'month' | 'specific_date' | 'specific_month' | 'custom';

export interface AnalyticsFilter {
  range: AnalyticsRange;
  specificDate?: string;
  specificMonth?: string;
  customStartDate?: string;
  customEndDate?: string;
}

export interface UpdateOrderDetailsInput {
  customerName: string;
  orderInstructions?: string;
  items: CartItem[];
  total: number;
  paymentMethod: 'cash' | 'upi' | 'pay_later';
  paymentStatus: 'paid' | 'unpaid';
}
