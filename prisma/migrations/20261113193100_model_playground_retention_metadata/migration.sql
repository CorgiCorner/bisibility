-- Metadata omission is separate from answer and citation truncation. Absence means untrimmed.
ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_retention_metadata
CHECK (result IS NULL OR NOT (result->'truncation' ? 'metadata') OR
  (result->'truncation'->'metadata' = 'true'::jsonb) IS TRUE);
