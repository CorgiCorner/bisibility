CREATE TABLE provider_connection_recovery (
  "connectionId" text PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "credentialVersion" text NOT NULL,
  "accountState" text NOT NULL CHECK ("accountState" IN ('payment_required','verified','unknown')),
  "checkedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "probeId" text,
  version integer NOT NULL DEFAULT 1 CHECK (version>0)
);
