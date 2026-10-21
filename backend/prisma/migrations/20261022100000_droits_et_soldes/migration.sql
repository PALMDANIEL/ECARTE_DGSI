-- CreateEnum
CREATE TYPE "LedgerNature" AS ENUM ('ACQUIS', 'REPORT', 'CONSOMME', 'REGULARISATION');

-- CreateTable
CREATE TABLE "leave_ledger" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nature" "LedgerNature" NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "requestId" TEXT,
    "decisionId" TEXT,
    "reason" TEXT,
    "ruleSnapshot" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_ledger_agentId_leaveType_year_idx" ON "leave_ledger"("agentId", "leaveType", "year");

-- CreateIndex
CREATE INDEX "leave_ledger_requestId_idx" ON "leave_ledger"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_companyId_date_key" ON "holidays"("companyId", "date");

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Registre des droits immuable : aucune modification ni suppression de ligne n'est possible
-- (les corrections se font par écritures de régularisation). TRUNCATE reste réservé à l'administrateur de la base.
CREATE OR REPLACE FUNCTION leave_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le registre des droits est en écriture seule (modification et suppression interdites)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leave_ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON "leave_ledger"
  FOR EACH ROW EXECUTE FUNCTION leave_ledger_immutable();

-- Idempotence : un droit acquis / reporté par agent, type et année ; une consommation par demande, type et année.
CREATE UNIQUE INDEX "leave_ledger_acquired_once" ON "leave_ledger" ("agentId", "leaveType", "year", "nature") WHERE "nature" IN ('ACQUIS', 'REPORT');
CREATE UNIQUE INDEX "leave_ledger_consumed_once" ON "leave_ledger" ("requestId", "leaveType", "year") WHERE "nature" = 'CONSOMME' AND "requestId" IS NOT NULL;
