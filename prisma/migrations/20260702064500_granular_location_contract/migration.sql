-- Granular location CONTRACT step: makes keywords.locationId first-class.
-- Runs only after the expand migration (20260701203000) has been deployed and its
-- backfill verified in prod, and after the app no longer reads keywords.location as
-- the resolution source (adapters/API now read the joined Location relation).
-- This step is intentionally destructive on a small, well-defined set of rows;
-- see the DELETE comment below. The legacy scalar "location" column is deliberately
-- KEPT this milestone (a later cleanup drops it once no code path reads it, to avoid
-- an old-code-reads-dropped-column window). trackingScope is untouched.

-- DESTRUCTIVE: remove the dedup-loser rows the expand migration intentionally left
-- with a NULL locationId. Those rows are true duplicates of a kept keyword under the
-- new uniqueness key (projectId, text, locationId, device): the expand backfill
-- collapsed distinct legacy location strings/aliases onto the same resolved
-- locationId, and for each duplicate group it kept the oldest row's locationId and
-- reset the newer duplicates' locationId back to NULL. Those NULL rows cannot satisfy
-- either the new NOT NULL constraint or the new composite unique index (they would
-- collide with their surviving keeper), so they are deleted here. Any RankCheck /
-- alert-target / schedule children cascade per their existing ON DELETE CASCADE FKs.
DELETE FROM "keywords" WHERE "locationId" IS NULL;

-- Now every remaining row has a resolved locationId; enforce it at the column level.
ALTER TABLE "keywords" ALTER COLUMN "locationId" SET NOT NULL;

-- Swap the composite uniqueness from the legacy scalar location string to the FK.
-- DropIndex: old unique on (projectId, text, location, device) from 20260619023000_init.
DROP INDEX "keywords_projectId_text_location_device_key";

-- CreateIndex: new unique on (projectId, text, locationId, device), Prisma-named.
-- Note: if "keywords" is expected to be large, this could be built outside the
-- migration transaction via CREATE UNIQUE INDEX CONCURRENTLY to avoid a long lock;
-- the default Prisma transactional migration is acceptable at current row scale.
CREATE UNIQUE INDEX "keywords_projectId_text_locationId_device_key" ON "keywords"("projectId", "text", "locationId", "device");

-- Tighten the foreign key: the expand migration added keywords_locationId_fkey with
-- ON DELETE SET NULL (needed while the column was nullable). With locationId now
-- required, deleting a referenced Location must be blocked, not null it out.
-- DropForeignKey + re-add ON DELETE RESTRICT ON UPDATE CASCADE.
ALTER TABLE "keywords" DROP CONSTRAINT "keywords_locationId_fkey";
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
