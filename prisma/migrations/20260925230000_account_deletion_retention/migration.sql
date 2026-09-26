ALTER TABLE "users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "users" ADD COLUMN "pending_deletion_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "purge_at" TIMESTAMP(3);
