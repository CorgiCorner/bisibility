-- Historical URL matching must use the value resolved when this check ran.
ALTER TABLE "rank_checks" ADD COLUMN "expectedUrlAtCheck" TEXT;
