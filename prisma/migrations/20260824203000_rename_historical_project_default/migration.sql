-- An exact "New workspace" name is indistinguishable from the historical default,
-- so this operator-approved migration rewrites every such exact value. Names with
-- different casing or whitespace are intentionally left unchanged.
-- A hand-typed exact "New workspace" is renamed on purpose, as accepted in #818.
UPDATE "projects"
SET "name" = 'New project', "updatedAt" = NOW()
WHERE "name" = 'New workspace';
