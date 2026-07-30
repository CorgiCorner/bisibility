-- Personal access tokens: user-scoped bearer credentials (bsp_live_*) that act
-- as the user across all their project memberships, unlike project-scoped
-- api_keys. Optional expiry; revocation mirrors api_keys.
CREATE TABLE "personal_access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_access_tokens_hashedKey_key" ON "personal_access_tokens"("hashedKey");

CREATE INDEX "personal_access_tokens_userId_idx" ON "personal_access_tokens"("userId");

CREATE INDEX "personal_access_tokens_prefix_idx" ON "personal_access_tokens"("prefix");

ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prefix lookup index for the hot bearer-auth path on api_keys (was a seq scan).
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- First-party public OAuth client used by `bisibility auth login`. PKCE is
-- mandatory (public client); the loopback redirect matches any port per
-- RFC 8252 so the CLI can bind whichever local port is free.
INSERT INTO "oauthClient" (
    "id", "clientId", "clientSecret", "disabled", "skipConsent", "scopes",
    "name", "redirectUris", "postLogoutRedirectUris", "contacts",
    "tokenEndpointAuthMethod", "grantTypes", "responseTypes", "public",
    "type", "requirePKCE", "createdAt", "updatedAt"
) VALUES (
    'oc_bisibility_cli', 'bisibility-cli', NULL, false, false,
    ARRAY['openid','profile','email','offline_access','tokens:write']::TEXT[],
    'Bisibility CLI', ARRAY['http://127.0.0.1/callback']::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[],
    'none', ARRAY['authorization_code','refresh_token']::TEXT[], ARRAY['code']::TEXT[], true,
    'native', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("clientId") DO NOTHING;
