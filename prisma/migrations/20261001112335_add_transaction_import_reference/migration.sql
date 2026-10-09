-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importReference" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_importReference_idx" ON "Transaction"("portfolioId", "importReference");
