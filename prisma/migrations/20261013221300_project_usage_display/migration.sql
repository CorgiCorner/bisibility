ALTER TABLE projects ADD COLUMN "usageDisplaySettings" JSONB;

ALTER TABLE projects ADD CONSTRAINT projects_usage_display_shape
CHECK ("usageDisplaySettings" IS NULL OR COALESCE(
  jsonb_typeof("usageDisplaySettings") = 'object'
  AND "usageDisplaySettings" = jsonb_build_object(
    'version', 1,
    'revision', "usageDisplaySettings" -> 'revision',
    'options', "usageDisplaySettings" -> 'options'
  )
  AND CASE WHEN jsonb_typeof("usageDisplaySettings" -> 'revision') = 'number' THEN
    ("usageDisplaySettings" ->> 'revision')::numeric BETWEEN 1 AND 2147483647
    AND ("usageDisplaySettings" ->> 'revision')::numeric =
      trunc(("usageDisplaySettings" ->> 'revision')::numeric)
    ELSE FALSE END
  AND jsonb_typeof("usageDisplaySettings" -> 'options') = 'object'
  AND "usageDisplaySettings" -> 'options' = jsonb_build_object(
    'moneyDisplay', "usageDisplaySettings" -> 'options' -> 'moneyDisplay',
    'moneyFractionDigits', "usageDisplaySettings" -> 'options' -> 'moneyFractionDigits',
    'quantityFractionDigits', "usageDisplaySettings" -> 'options' -> 'quantityFractionDigits'
  )
  AND "usageDisplaySettings" -> 'options' ->> 'moneyDisplay' IN ('currency', 'raw-unit')
  AND "usageDisplaySettings" -> 'options' -> 'moneyFractionDigits'
    IN ('0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb, '4'::jsonb, '6'::jsonb)
  AND "usageDisplaySettings" -> 'options' -> 'quantityFractionDigits'
    IN ('0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb, '4'::jsonb, '6'::jsonb),
  FALSE
));
