CREATE TABLE "assistant_funding_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_funding_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_funding_preferences_userId_projectId_provider_key" ON "assistant_funding_preferences"("userId", "projectId", "provider");

ALTER TABLE "assistant_funding_preferences" ADD CONSTRAINT "assistant_funding_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assistant_funding_preferences" ADD CONSTRAINT "assistant_funding_preferences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
