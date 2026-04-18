-- CreateEnum
CREATE TYPE "TaskCompletionReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMPLETION_REVIEW_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMPLETION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMPLETION_REJECTED';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completionRejectionReason" TEXT,
ADD COLUMN     "completionRequiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completionReviewStatus" "TaskCompletionReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "completionReviewedAt" TIMESTAMP(3),
ADD COLUMN     "completionReviewedById" INTEGER,
ADD COLUMN     "requireLocationEvidence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireNoteEvidence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requirePhotoEvidence" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tasks_completionReviewedById_idx" ON "tasks"("completionReviewedById");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completionReviewedById_fkey" FOREIGN KEY ("completionReviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
