-- CreateTable
CREATE TABLE "achievement_enrollments" (
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL DEFAULT 1,
    "joinedOn" TEXT NOT NULL,
    "leftAt" TIMESTAMP(3),
    "timeZone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievement_enrollments_pkey" PRIMARY KEY ("userId","kind","definitionVersion")
);

-- AddForeignKey
ALTER TABLE "achievement_enrollments" ADD CONSTRAINT "achievement_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "achievement_enrollments" ADD CONSTRAINT "achievement_enrollments_kind_check" CHECK ("kind" IN ('thirty_days'));

ALTER TABLE "achievement_awards" DROP CONSTRAINT "achievement_awards_kind_check";
ALTER TABLE "achievement_awards" ADD CONSTRAINT "achievement_awards_kind_check" CHECK ("kind" IN ('presence', 'practice', 'thirty_days'));
