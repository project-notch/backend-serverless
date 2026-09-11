-- DropIndex
DROP INDEX "email_candidates_user_id_gmail_message_id_key";

-- DropIndex
DROP INDEX "users_google_id_key";

-- AlterTable
ALTER TABLE "email_candidates" ADD COLUMN     "email_connection_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "email_connections" ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "email_address" TEXT NOT NULL,
ALTER COLUMN "provider_account_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "google_id",
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "username" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_account_id_key" ON "auth_identities"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_candidates_email_connection_id_gmail_message_id_key" ON "email_candidates"("email_connection_id", "gmail_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_connections_user_id_provider_provider_account_id_key" ON "email_connections"("user_id", "provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_candidates" ADD CONSTRAINT "email_candidates_email_connection_id_fkey" FOREIGN KEY ("email_connection_id") REFERENCES "email_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

