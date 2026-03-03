# Rush-Hour Test Scenarios

## 1. Concurrency Correctness
1. Open 20 browser tabs across POS and customer apps.
2. Submit orders in parallel from customer tabs.
3. Confirm POS queue shows unique sequential token numbers for the same business date.
4. Retry same request with identical `client_request_id` (API tool) and confirm no duplicate row.

## 2. Sustained Load (200 orders/hour)
1. Run steady order creation for 30 to 60 minutes.
2. Validate queue interactions (complete, settle payment, due adjustment) remain responsive.
3. Track telemetry panel in dashboard for order failure spikes and latency p95.

## 3. Auth + RLS
1. Anonymous session:
   - Must not update menu, expenses, or POS order status/payment.
2. Staff session (`app_metadata.role = staff`):
   - Must create/update/delete menu and expenses.
   - Must update order status/payment.
3. Customer app anonymous:
   - Must place orders through `create_order_atomic` RPC.

## 4. Functional Regression
1. Validate BOGO and discount stacking math on POS and customer flows.
2. Validate parcel fee addition.
3. Validate order instructions round-trip (customer -> POS card).
4. Validate due adjustment and payment settlement totals.

## 5. Realtime Resilience
1. Drop network on one POS tab and reconnect.
2. Confirm fallback polling keeps queue updated during disconnect.
3. Confirm reconnect resumes realtime and no duplicate notifications.

## 6. Deployment Validation
1. Deploy both Vercel projects.
2. Verify independent preview deploys for POS and customer apps.
3. Run smoke test from customer order to POS completion and dashboard update.
