/*
  Warnings:

  - A unique constraint covering the columns `[userId,period]` on the table `WeeklyReview` will be added.
  - Added the required column `userId` to the `AiAnalysis` table.
  - Added the required column `userId` to the `Thesis` table.
  - Added the required column `userId` to the `WeeklyReview` table.

  Existing rows (from before this app had per-user scoping) are backfilled to
  the oldest user account, then the column is locked to NOT NULL. This is a
  one-time migration step, not a general pattern — new rows always get a real
  userId from the signed-in session, never a fallback.
*/

-- DropIndex
DROP INDEX "WeeklyReview_period_key";

-- AlterTable: add nullable first so existing rows don't block the ADD COLUMN.
ALTER TABLE "AiAnalysis" ADD COLUMN     "userId" TEXT;
ALTER TABLE "Thesis" ADD COLUMN     "userId" TEXT;
ALTER TABLE "WeeklyReview" ADD COLUMN     "userId" TEXT;

-- Backfill: assign any pre-existing rows to the oldest user account.
UPDATE "AiAnalysis" SET "userId" = (SELECT "id" FROM "user" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "Thesis" SET "userId" = (SELECT "id" FROM "user" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "WeeklyReview" SET "userId" = (SELECT "id" FROM "user" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;

-- AlterTable: now that every row has a userId, require it going forward.
ALTER TABLE "AiAnalysis" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Thesis" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "WeeklyReview" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AiAnalysis_userId_createdAt_idx" ON "AiAnalysis"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Thesis_userId_status_idx" ON "Thesis"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_userId_period_key" ON "WeeklyReview"("userId", "period");

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
