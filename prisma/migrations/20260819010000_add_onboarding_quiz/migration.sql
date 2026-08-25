-- CreateEnum
CREATE TYPE "OnboardingQuizStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'SKIPPED_ALL');

-- CreateTable
CREATE TABLE "onboarding_quiz_responses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizVersion" INTEGER NOT NULL,
    "status" "OnboardingQuizStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_quiz_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_quiz_answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerIds" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_quiz_responses_userId_quizVersion_key" ON "onboarding_quiz_responses"("userId", "quizVersion");

-- CreateIndex
CREATE INDEX "onboarding_quiz_responses_userId_idx" ON "onboarding_quiz_responses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_quiz_answers_responseId_questionId_key" ON "onboarding_quiz_answers"("responseId", "questionId");

-- CreateIndex
CREATE INDEX "onboarding_quiz_answers_responseId_idx" ON "onboarding_quiz_answers"("responseId");

-- AddForeignKey
ALTER TABLE "onboarding_quiz_responses" ADD CONSTRAINT "onboarding_quiz_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_quiz_answers" ADD CONSTRAINT "onboarding_quiz_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "onboarding_quiz_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
