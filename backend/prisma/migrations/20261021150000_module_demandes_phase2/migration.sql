-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepKind" AS ENUM ('AVIS', 'VISA', 'TRAITEMENT', 'DECISION');

-- CreateEnum
CREATE TYPE "StepResolution" AS ENUM ('POSITION', 'SUPERVISOR_LEVEL', 'UNIT_TYPE_HEAD');

-- CreateEnum
CREATE TYPE "StepResult" AS ENUM ('PENDING', 'FAVORABLE', 'UNFAVORABLE', 'APPROVED', 'REJECTED', 'RETURNED', 'SKIPPED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "link" TEXT,
ADD COLUMN     "requestId" TEXT;

-- CreateTable
CREATE TABLE "request_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "requiresPriorDecision" BOOLEAN NOT NULL DEFAULT false,
    "attachmentRules" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'JOUR',
    "annualCap" DOUBLE PRECISION,
    "deductsFromLeave" BOOLEAN NOT NULL DEFAULT false,
    "legalReference" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestTypeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "StepKind" NOT NULL,
    "label" TEXT,
    "resolution" "StepResolution" NOT NULL,
    "positionId" TEXT,
    "level" INTEGER,
    "unitType" "OrgUnitType",
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "conditionJson" JSONB,
    "deadlineDays" INTEGER,
    "escalatePositionId" TEXT,
    "allowReturn" BOOLEAN NOT NULL DEFAULT true,
    "rejectOnUnfavorable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "round" INTEGER NOT NULL DEFAULT 1,
    "workflowId" TEXT,
    "data" JSONB NOT NULL,
    "snapshot" JSONB,
    "leaveDecisionId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_steps" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL,
    "kind" "StepKind" NOT NULL,
    "label" TEXT NOT NULL,
    "positionId" TEXT,
    "assigneeId" TEXT,
    "titleSnapshot" TEXT,
    "result" "StepResult" NOT NULL DEFAULT 'PENDING',
    "actorId" TEXT,
    "actorName" TEXT,
    "actorTitle" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "rejectOnUnfavorable" BOOLEAN NOT NULL DEFAULT false,
    "allowReturn" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "request_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_documents" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_attachments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_counters" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "request_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_decisions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "html" TEXT NOT NULL,
    "css" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_types_companyId_code_key" ON "request_types"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "absence_types_companyId_code_key" ON "absence_types"("companyId", "code");

-- CreateIndex
CREATE INDEX "workflow_definitions_companyId_requestTypeId_idx" ON "workflow_definitions"("companyId", "requestTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_requestTypeId_version_key" ON "workflow_definitions"("requestTypeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflowId_order_key" ON "workflow_steps"("workflowId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "requests_reference_key" ON "requests"("reference");

-- CreateIndex
CREATE INDEX "requests_companyId_status_idx" ON "requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "requests_agentId_idx" ON "requests"("agentId");

-- CreateIndex
CREATE INDEX "requests_typeId_idx" ON "requests"("typeId");

-- CreateIndex
CREATE INDEX "request_steps_requestId_round_order_idx" ON "request_steps"("requestId", "round", "order");

-- CreateIndex
CREATE INDEX "request_steps_positionId_idx" ON "request_steps"("positionId");

-- CreateIndex
CREATE INDEX "request_steps_assigneeId_idx" ON "request_steps"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "request_documents_requestId_version_key" ON "request_documents"("requestId", "version");

-- CreateIndex
CREATE INDEX "request_attachments_requestId_idx" ON "request_attachments"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "request_counters_companyId_prefix_year_key" ON "request_counters"("companyId", "prefix", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_decisions_requestId_key" ON "leave_decisions"("requestId");

-- CreateIndex
CREATE INDEX "leave_decisions_agentId_idx" ON "leave_decisions"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_decisions_companyId_number_key" ON "leave_decisions"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_companyId_typeCode_version_key" ON "form_templates"("companyId", "typeCode", "version");

-- AddForeignKey
ALTER TABLE "request_types" ADD CONSTRAINT "request_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "request_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_leaveDecisionId_fkey" FOREIGN KEY ("leaveDecisionId") REFERENCES "leave_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_decisions" ADD CONSTRAINT "leave_decisions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_decisions" ADD CONSTRAINT "leave_decisions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_decisions" ADD CONSTRAINT "leave_decisions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

