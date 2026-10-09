-- CreateEnum
CREATE TYPE "ShariaVerdict" AS ENUM ('COMPLIANT', 'NOT_COMPLIANT');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "shariaScreenEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShariaScreen" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "verdict" "ShariaVerdict" NOT NULL,
    "source" TEXT NOT NULL,
    "methodName" TEXT NOT NULL,
    "methodVersion" TEXT NOT NULL DEFAULT '',
    "ratios" JSONB,
    "asOf" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShariaScreen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShariaScreen_fetchedAt_idx" ON "ShariaScreen"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShariaScreen_instrumentId_source_key" ON "ShariaScreen"("instrumentId", "source");

-- AddForeignKey
ALTER TABLE "ShariaScreen" ADD CONSTRAINT "ShariaScreen_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
