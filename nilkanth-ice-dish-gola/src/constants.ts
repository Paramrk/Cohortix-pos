import { type MenuItem } from "./types";

export const MENU_CATEGORIES = [
  { id: 'sali-gola', name: 'Sali Gola (સળી ગોલા)', description: 'Traditional stick gola' },
  { id: 'dish', name: 'Dish (ડીશ)', description: 'Gola served in a dish with toppings' },
  { id: 'ice-cream-pyali', name: 'Ice Cream Pyali (આઈસ્ક્રીમ પ્યાલી)', description: 'Gola with ice cream in a bowl' },
  { id: 'special-dish', name: 'Special Dish (સ્પેશિયલ ડીશ)', description: 'Our signature premium dishes' },
];

export const MENU_ITEMS: MenuItem[] = [
  // Sali Gola
  { id: 'sg-kala-khatta', category: 'sali-gola', name: 'Kala Khatta (કાલા ખટ્ટા)', price: 30 },
  { id: 'sg-kachi-keri', category: 'sali-gola', name: 'Kachi Keri (કાચી કેરી)', price: 30 },
  { id: 'sg-rose', category: 'sali-gola', name: 'Rose (રોઝ)', price: 30 },
  { id: 'sg-orange', category: 'sali-gola', name: 'Orange (ઓરેન્જ)', price: 30 },
  { id: 'sg-rajwadi', category: 'sali-gola', name: 'Rajwadi (રાજવાડી)', price: 40 },
  { id: 'sg-cadbury', category: 'sali-gola', name: 'Cadbury (કેડબરી)', price: 40 },

  // Dish (Customizable)
  { id: 'dish-kala-khatta', category: 'dish', name: 'Kala Khatta Dish (કાલા ખટ્ટા ડીશ)', basePrice: 50, customizable: true },
  { id: 'dish-kachi-keri', category: 'dish', name: 'Kachi Keri Dish (કાચી કેરી ડીશ)', basePrice: 50, customizable: true },
  { id: 'dish-rajwadi', category: 'dish', name: 'Rajwadi Dish (રાજવાડી ડીશ)', basePrice: 60, customizable: true },
  { id: 'dish-chocolate', category: 'dish', name: 'Chocolate Dish (ચોકલેટ ડીશ)', basePrice: 60, customizable: true },

  // Ice Cream Pyali
  { id: 'pyali-regular', category: 'ice-cream-pyali', name: 'Regular Pyali (રેગ્યુલર પ્યાલી)', price: 80 },
  { id: 'pyali-dryfruit', category: 'ice-cream-pyali', name: 'Dry Fruit Pyali (ડ્રાયફ્રૂટ પ્યાલી)', price: 100 },
  { id: 'pyali-special', category: 'ice-cream-pyali', name: 'Special Pyali (સ્પેશિયલ પ્યાલી)', price: 120 },

  // Special Dish
  { id: 'special-nilkanth', category: 'special-dish', name: 'Nilkanth Special Dish (નીલકંઠ સ્પેશિયલ ડીશ)', price: 200 },
  { id: 'special-royal', category: 'special-dish', name: 'Royal Rajwadi Dish (રોયલ રાજવાડી ડીશ)', price: 150 },
];

export const DISH_VARIANTS = [
  { id: 'plain', name: 'Plain (પ્લેન)', extraPrice: 0 },
  { id: 'dry-fruit', name: 'With Dry Fruit (ડ્રાયફ્રૂટ સાથે)', extraPrice: 30 },
  { id: 'ice-cream-dry-fruit', name: 'With Ice Cream & Dry Fruit (આઈસ્ક્રીમ અને ડ્રાયફ્રૂટ સાથે)', extraPrice: 60 },
];

export const PARCEL_CHARGE = 5;
