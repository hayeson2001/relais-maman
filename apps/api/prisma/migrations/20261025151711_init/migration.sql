-- CreateEnum
CREATE TYPE "LanguageValidation" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'VALIDATED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BENEFICIARY', 'AGENT', 'FACILITY_REFERENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ActivationPurpose" AS ENUM ('FIRST_ACTIVATION', 'SUPERVISED_RECOVERY');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('SMS', 'VOICE_CALL', 'IN_APP');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('TRANSMIT_REQUEST', 'RECEIVE_CALLBACK', 'KEEP_AUDIO', 'RESEARCH');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestState" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'ACTION_AGREED', 'AWAITING_COMPLETION', 'CARE_DECLARED', 'CARE_VERIFIED', 'CLOSED_WITHOUT_CARE');

-- CreateEnum
CREATE TYPE "RequestCategory" AS ENUM ('TRANSPORT', 'COST', 'AVAILABILITY', 'UNDERSTANDING', 'OTHER_CALLBACK', 'HEALTH_QUESTION');

-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('BENEFICIARY_CHOICE', 'MODEL_SUGGESTION', 'AGENT_DECISION', 'NONE');

-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('TO_VERIFY', 'KNOWN');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'ALTERNATIVE_REQUESTED', 'CONFIRMED_BY_FACILITY', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('FACILITY_CONFIRMATION', 'AGENT_VERIFICATION');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('PHONE_CALL', 'IN_PERSON', 'FACILITY_REGISTER', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('TO_BENEFICIARY', 'FROM_BENEFICIARY');

-- CreateEnum
CREATE TYPE "ContentValidation" AS ENUM ('MISSING', 'DRAFT', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT_SIMULATED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConnectorKind" AS ENUM ('SMS', 'VOICE', 'TRANSCRIPTION', 'FACILITY');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('REQUESTED', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "Country" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "isFictional" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthFacility" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" UUID NOT NULL,
    "isFictional" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HealthFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nativeName" TEXT,
    "uiAvailable" BOOLEAN NOT NULL DEFAULT false,
    "uiValidation" "LanguageValidation" NOT NULL DEFAULT 'NOT_STARTED',

    CONSTRAINT "Language_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "loginId" TEXT NOT NULL,
    "secretHash" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "displayName" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "totpSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "teamId" UUID,
    "facilityId" UUID,
    "canConfirmCare" BOOLEAN NOT NULL DEFAULT false,
    "spokenLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "mfaVerifiedAt" TIMESTAMP(3),
    "csrfToken" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationCode" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "ActivationPurpose" NOT NULL,
    "issuedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ActivationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" UUID NOT NULL,
    "keyHash" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "preferredLocale" TEXT NOT NULL DEFAULT 'fr',
    "activityLabel" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletionRequestedAt" TIMESTAMP(3),

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInfo" (
    "beneficiaryId" UUID NOT NULL,
    "phoneE164" TEXT,
    "phoneIsShared" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactInfo_pkey" PRIMARY KEY ("beneficiaryId")
);

-- CreateTable
CREATE TABLE "ContactPreference" (
    "beneficiaryId" UUID NOT NULL,
    "channels" "ContactChannel"[] DEFAULT ARRAY['IN_APP']::"ContactChannel"[],
    "callWindowStart" TEXT NOT NULL DEFAULT '15:00',
    "callWindowEnd" TEXT NOT NULL DEFAULT '19:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactPreference_pkey" PRIMARY KEY ("beneficiaryId")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "birthYearMonth" TEXT NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentText" (
    "id" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "textVersion" TEXT NOT NULL,
    "recordedById" UUID NOT NULL,
    "assisted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "childId" UUID,
    "facilityId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "assignedAgentId" UUID,
    "appointmentId" UUID,
    "state" "RequestState" NOT NULL DEFAULT 'RECEIVED',
    "category" "RequestCategory",
    "categorySource" "CategorySource" NOT NULL DEFAULT 'NONE',
    "text" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL,
    "audioId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstViewedAt" TIMESTAMP(3),
    "firstHumanResponseAt" TIMESTAMP(3),
    "actionAgreedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" UUID,
    "actorRole" TEXT NOT NULL,
    "fromState" "RequestState",
    "toState" "RequestState",
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "costStatus" "CostStatus" NOT NULL DEFAULT 'TO_VERIFY',
    "costAmountXof" INTEGER,
    "costSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotProposal" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedById" UUID NOT NULL,
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "beneficiaryComment" TEXT,
    "facilityConfirmedById" UUID,
    "facilityConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareDeclaration" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "careDate" TEXT NOT NULL,
    "declaredById" UUID NOT NULL,
    "declaredByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareVerification" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "careDate" TEXT NOT NULL,
    "source" "VerificationSource" NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "verifiedById" UUID NOT NULL,
    "verifiedByRole" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "correctionReason" TEXT,
    "supersededById" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelSuggestion" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "suggestedCategory" "RequestCategory",
    "topCategory" "RequestCategory",
    "abstained" BOOLEAN NOT NULL,
    "abstentionReason" TEXT,
    "score" DOUBLE PRECISION,
    "recognizedTokens" INTEGER NOT NULL,
    "healthReviewCue" BOOLEAN NOT NULL,
    "finalCategory" "RequestCategory",
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioAsset" (
    "id" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "locale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "transcription" TEXT,
    "transcribedById" UUID,

    CONSTRAINT "AudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioContent" (
    "id" UUID NOT NULL,
    "messageKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "storageKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "provenance" TEXT NOT NULL,
    "validation" "ContentValidation" NOT NULL DEFAULT 'MISSING',
    "validatedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "recipientId" UUID NOT NULL,
    "templateKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "costMicroUnits" INTEGER,
    "costCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadSha256" TEXT NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSetting" (
    "kind" "ConnectorKind" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'simulator',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorSetting_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" UUID NOT NULL,
    "beneficiaryId" UUID NOT NULL,
    "status" "DeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedById" UUID,
    "processedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_loginId_key" ON "Account"("loginId");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- CreateIndex
CREATE INDEX "ActivationCode_accountId_idx" ON "ActivationCode"("accountId");

-- CreateIndex
CREATE INDEX "AuthAttempt_keyHash_createdAt_idx" ON "AuthAttempt"("keyHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_accountId_key" ON "Beneficiary"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentText_purpose_version_locale_key" ON "ConsentText"("purpose", "version", "locale");

-- CreateIndex
CREATE INDEX "Consent_beneficiaryId_purpose_createdAt_idx" ON "Consent"("beneficiaryId", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Request_idempotencyKey_key" ON "Request"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Request_audioId_key" ON "Request"("audioId");

-- CreateIndex
CREATE INDEX "Request_teamId_state_idx" ON "Request"("teamId", "state");

-- CreateIndex
CREATE INDEX "Request_assignedAgentId_idx" ON "Request"("assignedAgentId");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "SlotProposal_facilityId_startsAt_idx" ON "SlotProposal"("facilityId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CareVerification_supersededById_key" ON "CareVerification"("supersededById");

-- CreateIndex
CREATE UNIQUE INDEX "ModelSuggestion_requestId_key" ON "ModelSuggestion"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioAsset_storageKey_key" ON "AudioAsset"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "AudioContent_messageKey_locale_version_key" ON "AudioContent"("messageKey", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_providerMessageId_key" ON "Notification"("providerMessageId");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthFacility" ADD CONSTRAINT "HealthFacility_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInfo" ADD CONSTRAINT "ContactInfo_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPreference" ADD CONSTRAINT "ContactPreference_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "AudioAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotProposal" ADD CONSTRAINT "SlotProposal_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotProposal" ADD CONSTRAINT "SlotProposal_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareDeclaration" ADD CONSTRAINT "CareDeclaration_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareVerification" ADD CONSTRAINT "CareVerification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareVerification" ADD CONSTRAINT "CareVerification_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CareVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelSuggestion" ADD CONSTRAINT "ModelSuggestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioAsset" ADD CONSTRAINT "AudioAsset_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioContent" ADD CONSTRAINT "AudioContent_locale_fkey" FOREIGN KEY ("locale") REFERENCES "Language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
