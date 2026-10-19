-- CreateTable
CREATE TABLE "waitlist_interests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "interest" TEXT NOT NULL,
    "submissions" INTEGER NOT NULL DEFAULT 1,
    "lastSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_interests_email_interest_key" ON "waitlist_interests"("email", "interest");
