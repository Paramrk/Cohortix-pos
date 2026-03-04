# Vercel Deployment Checklist (POS + Customer)

## Projects
1. Create Vercel project `ice-dish-pos` with root directory `.`.
2. Create Vercel project `ice-dish-customer` with root directory `nilkanth-ice-dish-gola`.

## Required Environment Variables
Set in both projects:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Build Commands
- POS: `npm run build`
- Customer: `npm run build`

## Database Migration Steps
1. Apply SQL migration file: `supabase/migrations/20260304_rush_hour_hardening.sql`.
2. Verify RPCs exist:
   - `create_order_atomic`
   - `get_dashboard_metrics`
3. Verify indexes and constraints are present.
4. Verify RLS policies are enabled on `orders`, `expenses`, `menu_items`.
5. Verify `supabase_realtime` publication includes `public.orders` and `public.menu_items`.

## Supabase Auth/RLS Setup
1. Create staff users in Supabase Auth.
2. Set staff role in JWT metadata (`app_metadata.role = staff`).
3. Confirm POS login succeeds with staff credentials.
4. Confirm customer app remains anonymous and can place orders via RPC only.

## Smoke Test
1. Open customer app, place order, verify token created.
2. Open POS app (authenticated), verify order appears in queue.
3. Mark order complete and settle payment.
4. Add one expense.
5. Validate dashboard metrics update.
6. Validate POS and customer app deploy previews build independently.
