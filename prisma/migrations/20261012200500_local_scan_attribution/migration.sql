-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Attribution only. Availability and price still require a current supported catalog descriptor.
ALTER TYPE "ProviderCostFeature" ADD VALUE 'local_scan';
