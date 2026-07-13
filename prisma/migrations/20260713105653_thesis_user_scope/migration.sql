/*
  Warnings:

  - Added the required column `userId` to the `Thesis` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dataAsOf` to the `ThesisCheck` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Thesis_instrumentId_status_idx";

-- AlterTable
ALTER TABLE "Thesis" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ThesisCheck" ADD COLUMN     "dataAsOf" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Thesis_userId_status_idx" ON "Thesis"("userId", "status");

-- CreateIndex
CREATE INDEX "Thesis_instrumentId_idx" ON "Thesis"("instrumentId");

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
