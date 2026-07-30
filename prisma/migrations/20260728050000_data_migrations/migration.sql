CREATE TABLE "data_migrations" (
    "id" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "data_migrations_pkey" PRIMARY KEY ("id")
);
