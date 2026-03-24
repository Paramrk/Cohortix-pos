export type AppRole = 'owner' | 'waiter';
export type ServiceMode = 'dine_in' | 'takeaway' | 'delivery';
export type PaymentMethod = 'cash' | 'upi' | 'pay_later';
export type PaymentStatus = 'paid' | 'unpaid';
export type OrderStatus = 'pending' | 'completed' | 'cancelled';

export interface CatalogOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface CatalogOptionGroup {
  id: string;
  name: string;
  type: 'size' | 'addon';
  selection: 'single' | 'multiple';
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: CatalogOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  optionGroups: CatalogOptionGroup[];
}

export interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface CartItem {
  id: string;
  cartItemId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  calculatedPrice: number;
  lineTotal: number;
  selectedOptions: SelectedOption[];
}

export interface OrderLine {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  category: string;
  selectedOptions: SelectedOption[];
}

export interface OrderTicket {
  displayLabel: string;
  serviceMode: ServiceMode;
  tableNumber?: number;
  notes?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  lines: OrderLine[];
}

export interface Order {
  id: string;
  orderNumber: number;
  customerName: string;
  displayLabel: string;
  serviceMode: ServiceMode;
  tableNumber?: number;
  orderInstructions?: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
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



export interface RestaurantProfile {
  name: string;
  currencyCode: string;
  currencySymbol: string;
  defaultServiceMode: ServiceMode;
}

export interface OrderCreateResult {
  orderId: string;
  orderNumber: number;
  timestamp: number;
  businessDate?: string;
  tableNumber?: number;
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
  displayLabel: string;
  serviceMode: ServiceMode;
  tableNumber?: number | null;
  orderInstructions?: string;
  items: CartItem[];
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}
