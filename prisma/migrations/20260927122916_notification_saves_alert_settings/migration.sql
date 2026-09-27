-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "alertIntervalDays" INTEGER,
ADD COLUMN     "alertKind" "AlertKind",
ADD COLUMN     "alertThreshold" DECIMAL(20,8);
