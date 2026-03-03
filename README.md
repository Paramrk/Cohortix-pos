# Ice Dish POS

A simple, fast, and mobile-friendly Point-of-Sale (POS) and order tracking application designed specifically for a local ice dish shop. Built to handle the rush of night shifts with ease.

## 🌟 Features

### 1. Quick Order Taking (New Order)
*   **Intuitive Menu:** Tap to add items to the cart.
*   **Variants Support:** Select between "Stick" and "Dish" variants for specific flavors (e.g., Kala Khatta, Mango) with automatic price adjustments.
*   **Mobile Cart Bar:** A sticky bottom bar on mobile devices shows a quick summary of the cart and total price, expanding into a full checkout modal.
*   **Payment Methods:** Support for Cash, UPI (with a scannable QR code placeholder), and "Pay Later".

### 2. Order Management (Queue)
*   **Preparing/Pending:** View all active orders that need to be prepared.
*   **Completed:** Track recently finished orders.
*   **Pay Later Settlement:** Easily settle "Unpaid" orders later with Cash or UPI directly from the queue.

### 3. Finance & Analytics (Dashboard)
*   **Today's Stats:** Track total collected sales, pending sales, and daily expenses.
*   **Expense Tracking:** Add daily expenses (e.g., ice blocks, syrups, cups) to automatically calculate net profit.
*   **Monthly Preview:** View a summary of the current month's total sales, collected amount, pending amount, and net profit.
*   **End of Day Reset:** Clear today's orders and expenses to start fresh the next day (menu items are preserved).

### 4. Menu Management
*   **Customizable Menu:** Add, edit, or delete menu items.
*   **Categories:** Group items by categories (Premium, Regular, Special, etc.).
*   **Variant Pricing:** Set separate base prices (Stick) and Dish prices for items that require it.

## 🛠️ Tech Stack
*   **Frontend:** React 19, TypeScript, Vite
*   **Styling:** Tailwind CSS v4
*   **Icons:** Lucide React
*   **Data Storage:** Browser `localStorage` (No external database required, works completely offline after initial load).

## 💾 Data Persistence
All data (Orders, Expenses, and Menu Items) is saved locally in the browser's `localStorage`. 
*   If you refresh or close the browser, your data will still be there.
*   **Note:** Clearing browser data/cache will erase the app's data. Use the "Reset All Data" button in the Dashboard to clear orders and expenses at the end of a shift.

## 🚀 Getting Started
1. Navigate to the **Menu** tab to set up your initial items and prices.
2. Go to the **New Order** tab to start taking customer orders.
3. Track active orders in the **Orders Queue**.
4. Monitor your sales and add expenses in the **Dashboard**.

## Deployment + Ops
- Vercel deployment checklist: `docs/deployment-vercel.md`
- Rollback runbook: `docs/rollback.md`
- Supabase migration for rush-hour hardening and RLS: `supabase/migrations/20260304_rush_hour_hardening.sql`
- Rush-hour validation checklist: `docs/test-scenarios.md`
