/*
  Warnings:

  - You are about to drop the column `company` on the `bills` table. All the data in the column will be lost.
  - You are about to drop the `oauth_tokens` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "oauth_tokens" DROP CONSTRAINT "oauth_tokens_user_id_fkey";

-- AlterTable
ALTER TABLE "bills" DROP COLUMN "company",
ADD COLUMN     "converted_amount" DECIMAL,
ADD COLUMN     "converted_currency" TEXT,
ADD COLUMN     "extracted_company" TEXT,
ADD COLUMN     "fx_rate_used" DECIMAL,
ADD COLUMN     "manually_edited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "user_biller_id" TEXT;

-- AlterTable
ALTER TABLE "email_candidates" ADD COLUMN     "is_bill" BOOLEAN,
ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "default_currency" TEXT,
ADD COLUMN     "timezone" TEXT;

-- DropTable
DROP TABLE "oauth_tokens";

-- CreateTable
CREATE TABLE "email_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "provider_account_id" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billers" (
    "id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "category" TEXT,
    "sender_patterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_billers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "biller_id" TEXT,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_via" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_billers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" DECIMAL NOT NULL,
    "as_of_date" DATE NOT NULL,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_base_currency_quote_currency_as_of_date_key" ON "fx_rates"("base_currency", "quote_currency", "as_of_date");

-- AddForeignKey
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_billers" ADD CONSTRAINT "user_billers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_billers" ADD CONSTRAINT "user_billers_biller_id_fkey" FOREIGN KEY ("biller_id") REFERENCES "billers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_user_biller_id_fkey" FOREIGN KEY ("user_biller_id") REFERENCES "user_billers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
