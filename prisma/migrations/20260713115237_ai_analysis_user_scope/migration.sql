/*
  Warnings:

  - Added the required column `userId` to the `AiAnalysis` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AiAnalysis_type_subjectType_subjectId_createdAt_idx";

-- AlterTable
ALTER TABLE "AiAnalysis" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "AiAnalysis_userId_type_subjectType_subjectId_createdAt_idx" ON "AiAnalysis"("userId", "type", "subjectType", "subjectId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
