import { MenuItem } from './types';

export const DEFAULT_MENU: MenuItem[] = [
  { id: '1', name: 'Rajwadi Ice Dish', price: 120, category: 'Premium', hasVariants: false },
  { id: '2', name: 'Cadbury Ice Dish', price: 150, category: 'Premium', hasVariants: false },
  { id: '3', name: 'Dry Fruit Ice Dish', price: 140, category: 'Premium', hasVariants: false },
  { id: '4', name: 'Kala Khatta', price: 60, dishPrice: 80, category: 'Regular', hasVariants: true },
  { id: '5', name: 'Rose (Gulab)', price: 60, dishPrice: 80, category: 'Regular', hasVariants: true },
  { id: '6', name: 'Mango', price: 70, dishPrice: 90, category: 'Regular', hasVariants: true },
  { id: '7', name: 'Orange', price: 60, dishPrice: 80, category: 'Regular', hasVariants: true },
  { id: '8', name: 'Pineapple', price: 70, dishPrice: 90, category: 'Regular', hasVariants: true },
  { id: '9', name: 'Mix Fruit', price: 80, dishPrice: 100, category: 'Regular', hasVariants: true },
  { id: '10', name: 'Special Malai', price: 100, dishPrice: 120, category: 'Special', hasVariants: true },
];
