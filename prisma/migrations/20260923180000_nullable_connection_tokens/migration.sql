-- Disconnecting an inbox now clears its credentials instead of deleting the
-- row (EmailConnectionService.disconnect), so the token columns must accept
-- NULL. Widening NOT NULL -> NULL is non-destructive and needs no backfill.
ALTER TABLE "email_connections" ALTER COLUMN "access_token" DROP NOT NULL;
ALTER TABLE "email_connections" ALTER COLUMN "refresh_token" DROP NOT NULL;
