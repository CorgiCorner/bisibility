-- Stored JavaScript-compatible grouping key for grouped Rank Tracker queries.
ALTER TABLE "keywords"
ADD COLUMN "textNormalized" text GENERATED ALWAYS AS (
  lower(regexp_replace("text", U&'^[\0009\000A\000B\000C\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009\000A\000B\000C\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') COLLATE "en-US-x-icu")
) STORED;

CREATE INDEX "keywords_projectId_textNormalized_idx"
ON "keywords"("projectId", "textNormalized");
