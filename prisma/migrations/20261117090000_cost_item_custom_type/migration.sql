SET lock_timeout = '5s';
ALTER TABLE "cost_items" ADD COLUMN "customType" VARCHAR(80);
RESET lock_timeout;
