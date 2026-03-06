export type GolaVariant = 'Ice Cream Only' | 'Dry Fruit Only' | 'Ice Cream + Dry Fruit' | 'Plain';

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
