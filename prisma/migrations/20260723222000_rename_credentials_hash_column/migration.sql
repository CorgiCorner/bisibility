-- Rename the misnamed column: it stores AES-256-GCM ciphertext, not a digest.
ALTER TABLE "provider_connections" RENAME COLUMN "credentialsHash" TO "credentialsEncrypted";
