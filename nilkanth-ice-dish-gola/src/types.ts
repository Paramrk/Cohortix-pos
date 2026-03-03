export enum OrderStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface MenuItem {
  id: string;
  category: string;
  name: string;
  price?: number;
  basePrice?: number;
  customizable?: boolean;
}

export interface CartItem {
  cartId: string;
  id: string;
  name: string;
  price: number;
  quantity: number;
  variantId?: string;
  variantName?: string;
}

export interface Order {
  id: number;
  token: number;
  items: string; // JSON string
  totalPrice: number;
  isParcel: boolean;
  status: OrderStatus;
  createdAt: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  variantName?: string;
}
