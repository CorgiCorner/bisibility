-- CreateEnum
CREATE TYPE "CostItemKind" AS ENUM ('seo_tool', 'ai', 'analytics', 'custom');

-- CreateEnum
CREATE TYPE "CostItemBilling" AS ENUM ('monthly', 'yearly', 'lifetime', 'one_off');

-- CreateEnum
CREATE TYPE "CostItemSplit" AS ENUM ('equal', 'percent', 'single_project');

-- CreateEnum
CREATE TYPE "CostItemPriceReason" AS ENUM ('trial', 'discount', 'regular');

-- CreateTable
CREATE TABLE "cost_items" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "CostItemKind" NOT NULL,
    "catalogKey" VARCHAR(64),
    "planLabel" VARCHAR(80) NOT NULL DEFAULT '',
    "billing" "CostItemBilling" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "startedOn" DATE NOT NULL,
    "endedOn" DATE,
    "split" "CostItemSplit" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_item_projects" (
    "id" TEXT NOT NULL,
    "costItemId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "basisPoints" INTEGER,

    CONSTRAINT "cost_item_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_item_price_changes" (
    "id" TEXT NOT NULL,
    "costItemId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" "CostItemPriceReason" NOT NULL,
    "note" VARCHAR(200),

    CONSTRAINT "cost_item_price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_items_publicId_key" ON "cost_items"("publicId");

-- Public id format, same contract as the other runtime resources.
ALTER TABLE "cost_items"
  ADD CONSTRAINT "cost_items_public_id_contract_format" CHECK ("publicId" ~ '^cst_[a-z][a-z0-9]{23}$'::text);

-- CreateIndex
CREATE INDEX "cost_items_ownerId_idx" ON "cost_items"("ownerId");

-- CreateIndex
CREATE INDEX "cost_item_projects_projectId_idx" ON "cost_item_projects"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_item_projects_costItemId_projectId_key" ON "cost_item_projects"("costItemId", "projectId");

-- CreateIndex
CREATE INDEX "cost_item_price_changes_costItemId_effectiveFrom_idx" ON "cost_item_price_changes"("costItemId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_item_projects" ADD CONSTRAINT "cost_item_projects_costItemId_fkey" FOREIGN KEY ("costItemId") REFERENCES "cost_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_item_projects" ADD CONSTRAINT "cost_item_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_item_price_changes" ADD CONSTRAINT "cost_item_price_changes_costItemId_fkey" FOREIGN KEY ("costItemId") REFERENCES "cost_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
