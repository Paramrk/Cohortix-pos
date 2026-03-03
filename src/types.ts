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
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  timestamp: number;
}
