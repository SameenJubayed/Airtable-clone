-- DropIndex
DROP INDEX "public"."Base_createdById_updatedAt_idx";

-- AlterTable
ALTER TABLE "public"."Base" ADD COLUMN     "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Base_createdById_lastOpenedAt_idx" ON "public"."Base"("createdById", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "Base_starred_by_user" ON "public"."Base"("createdById", "starred");
