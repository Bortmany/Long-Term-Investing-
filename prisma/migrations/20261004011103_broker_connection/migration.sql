-- CreateEnum
CREATE TYPE "BrokerConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT');

-- CreateEnum
CREATE TYPE "BrokerSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'NEEDS_RECONNECT');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "syncRunId" TEXT,
ADD COLUMN     "syncedFrom" TEXT;

-- CreateTable
CREATE TABLE "BrokerConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "accountId" TEXT,
    "tokenExpiresOn" TIMESTAMP(3),
    "expiryReminderSentAt" TIMESTAMP(3),
    "status" "BrokerConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "lastFailureMessage" TEXT,
    "syncingSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerSyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" "BrokerSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "rowsSeen" INTEGER NOT NULL DEFAULT 0,
    "rowsAdded" INTEGER NOT NULL DEFAULT 0,
    "rowsAlready" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsRejected" INTEGER NOT NULL DEFAULT 0,
    "accountCount" INTEGER NOT NULL DEFAULT 0,
    "skipReasons" JSONB,
    "message" TEXT,

    CONSTRAINT "BrokerSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrokerConnection_userId_provider_key" ON "BrokerConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "BrokerSyncRun_connectionId_startedAt_idx" ON "BrokerSyncRun"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "BrokerSyncRun_userId_idx" ON "BrokerSyncRun"("userId");

-- CreateIndex
CREATE INDEX "Transaction_syncRunId_idx" ON "Transaction"("syncRunId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "BrokerSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerConnection" ADD CONSTRAINT "BrokerConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerSyncRun" ADD CONSTRAINT "BrokerSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BrokerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerSyncRun" ADD CONSTRAINT "BrokerSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
