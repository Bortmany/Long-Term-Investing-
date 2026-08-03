-- CreateTable
CREATE TABLE "ManualPrice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "currency" "Currency" NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualFxRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "base" "Currency" NOT NULL,
    "quote" "Currency" NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualFxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualPrice_userId_instrumentId_asOf_idx" ON "ManualPrice"("userId", "instrumentId", "asOf" DESC);

-- CreateIndex
CREATE INDEX "ManualFxRate_userId_base_quote_asOf_idx" ON "ManualFxRate"("userId", "base", "quote", "asOf" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ManualFxRate_userId_base_quote_asOf_key" ON "ManualFxRate"("userId", "base", "quote", "asOf");

-- AddForeignKey
ALTER TABLE "ManualPrice" ADD CONSTRAINT "ManualPrice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPrice" ADD CONSTRAINT "ManualPrice_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualFxRate" ADD CONSTRAINT "ManualFxRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
