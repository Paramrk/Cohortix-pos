# Rollback Runbook

## Frontend Rollback (Vercel)
1. Open the Vercel project.
2. Locate the last known healthy deployment.
3. Promote that deployment to production.
4. Verify POS login, queue updates, and customer ordering.

## Database Rollback
If migration causes production issues:
1. Disable traffic by switching frontend to maintenance page or previous deployment.
2. Revert app usage of RPCs by deploying previous frontend revision.
3. In Supabase, revert schema changes manually in controlled order:
   - Drop/disable new policies if they block access.
   - Recreate legacy access policies if needed.
   - Keep data columns intact unless explicit data migration rollback is planned.
4. Re-run smoke tests before re-enabling traffic.

## Partial Failure Strategy
- If only customer flow fails: roll back customer project only.
- If only POS flow fails: roll back POS project only.
- If both fail after migration: prioritize frontend rollback first, then policy/function rollback.

## Verification After Rollback
1. Customer can place orders.
2. POS queue receives and updates orders.
3. Dashboard loads without RPC errors.
4. No sustained order creation failure alerts in telemetry logs.
