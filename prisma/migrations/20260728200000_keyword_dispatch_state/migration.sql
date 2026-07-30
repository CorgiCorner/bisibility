CREATE TABLE "keyword_dispatch_states" (
    "keywordId" TEXT NOT NULL,
    "nextCheckAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_dispatch_states_pkey" PRIMARY KEY ("keywordId")
);

CREATE INDEX "keyword_dispatch_states_nextCheckAt_idx"
ON "keyword_dispatch_states"("nextCheckAt");

ALTER TABLE "keyword_dispatch_states"
ADD CONSTRAINT "keyword_dispatch_states_keywordId_fkey"
FOREIGN KEY ("keywordId") REFERENCES "keywords"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
