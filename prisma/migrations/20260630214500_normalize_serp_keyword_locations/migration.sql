-- Normalize legacy keyword country aliases to the app-owned SERP market names.
-- Unknown free-form locations are handled at runtime by falling back to the
-- default market; this migration keeps rows unchanged when normalization would
-- violate the existing per-project keyword uniqueness constraint.
WITH market_aliases("alias", "canonical") AS (
  VALUES
    ('United States', 'United States'),
    ('US', 'United States'),
    ('USA', 'United States'),
    ('United States of America', 'United States'),
    ('Global', 'United States'),
    ('United Kingdom', 'United Kingdom'),
    ('GB', 'United Kingdom'),
    ('UK', 'United Kingdom'),
    ('Great Britain', 'United Kingdom'),
    ('Canada', 'Canada'),
    ('CA', 'Canada'),
    ('Australia', 'Australia'),
    ('AU', 'Australia'),
    ('Germany', 'Germany'),
    ('DE', 'Germany'),
    ('Deutschland', 'Germany'),
    ('France', 'France'),
    ('FR', 'France'),
    ('Spain', 'Spain'),
    ('ES', 'Spain'),
    ('Espana', 'Spain'),
    ('España', 'Spain'),
    ('Italy', 'Italy'),
    ('IT', 'Italy'),
    ('Italia', 'Italy'),
    ('Netherlands', 'Netherlands'),
    ('NL', 'Netherlands'),
    ('Holland', 'Netherlands'),
    ('Sweden', 'Sweden'),
    ('SE', 'Sweden'),
    ('Poland', 'Poland'),
    ('PL', 'Poland'),
    ('Polska', 'Poland'),
    ('Ireland', 'Ireland'),
    ('IE', 'Ireland'),
    ('Portugal', 'Portugal'),
    ('PT', 'Portugal'),
    ('Belgium', 'Belgium'),
    ('BE', 'Belgium'),
    ('Switzerland', 'Switzerland'),
    ('CH', 'Switzerland'),
    ('Austria', 'Austria'),
    ('AT', 'Austria'),
    ('Denmark', 'Denmark'),
    ('DK', 'Denmark'),
    ('Norway', 'Norway'),
    ('NO', 'Norway'),
    ('Finland', 'Finland'),
    ('FI', 'Finland'),
    ('Brazil', 'Brazil'),
    ('BR', 'Brazil'),
    ('Mexico', 'Mexico'),
    ('MX', 'Mexico'),
    ('India', 'India'),
    ('IN', 'India'),
    ('Japan', 'Japan'),
    ('JP', 'Japan'),
    ('Singapore', 'Singapore'),
    ('SG', 'Singapore'),
    ('New Zealand', 'New Zealand'),
    ('NZ', 'New Zealand'),
    ('South Africa', 'South Africa'),
    ('ZA', 'South Africa'),
    ('United Arab Emirates', 'United Arab Emirates'),
    ('AE', 'United Arab Emirates'),
    ('UAE', 'United Arab Emirates')
),
normalized_candidates AS (
  SELECT
    keyword."id",
    keyword."projectId",
    keyword."text",
    keyword."device",
    market_aliases."canonical"
  FROM "keywords" AS keyword
  JOIN market_aliases
    ON lower(trim(keyword."location")) = lower(market_aliases."alias")
  WHERE keyword."location" <> market_aliases."canonical"
),
safe_candidates AS (
  SELECT candidate."id", candidate."canonical"
  FROM normalized_candidates AS candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM "keywords" AS existing
    JOIN market_aliases AS existing_alias
      ON lower(trim(existing."location")) = lower(existing_alias."alias")
    WHERE existing."id" <> candidate."id"
      AND existing."projectId" = candidate."projectId"
      AND existing."text" = candidate."text"
      AND existing."device" = candidate."device"
      AND existing_alias."canonical" = candidate."canonical"
  )
)
UPDATE "keywords" AS keyword
SET
  "location" = safe_candidates."canonical",
  "updatedAt" = CURRENT_TIMESTAMP
FROM safe_candidates
WHERE keyword."id" = safe_candidates."id";
