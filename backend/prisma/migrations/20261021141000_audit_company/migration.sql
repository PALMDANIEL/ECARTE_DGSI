-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "companyId" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId");
