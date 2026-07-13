/*
  Warnings:

  - A unique constraint covering the columns `[userId,period]` on the table `WeeklyReview` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dataAsOf` to the `WeeklyReview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `WeeklyReview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `WeeklyReview` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "WeeklyReview_period_key";

-- AlterTable
ALTER TABLE "WeeklyReview" ADD COLUMN     "dataAsOf" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "model" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "WeeklyReview_userId_createdAt_idx" ON "WeeklyReview"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_userId_period_key" ON "WeeklyReview"("userId", "period");

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
