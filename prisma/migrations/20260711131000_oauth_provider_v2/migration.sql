-- Add the OAuth 2.1 provider tables alongside the legacy OIDC tables. Existing
-- dynamic clients can re-register; the legacy records remain intact for audit
-- and rollback instead of being destructively reshaped in place.
CREATE TABLE "oauthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[],
    "postLogoutRedirectUris" TEXT[],
    "tokenEndpointAuthMethod" TEXT,
    "grantTypes" TEXT[],
    "responseTypes" TEXT[],
    "public" BOOLEAN,
    "type" TEXT,
    "requirePKCE" BOOLEAN,
    "referenceId" TEXT,
    "metadata" JSONB,
    CONSTRAINT "oauthClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauthRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "scopes" TEXT[],
    CONSTRAINT "oauthRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauthAccessTokenV2" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT[],
    CONSTRAINT "oauthAccessTokenV2_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauthConsentV2" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "oauthConsentV2_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauthClient_clientId_key" ON "oauthClient"("clientId");
CREATE INDEX "oauthClient_userId_idx" ON "oauthClient"("userId");
CREATE UNIQUE INDEX "oauthRefreshToken_token_key" ON "oauthRefreshToken"("token");
CREATE INDEX "oauthRefreshToken_clientId_idx" ON "oauthRefreshToken"("clientId");
CREATE INDEX "oauthRefreshToken_sessionId_idx" ON "oauthRefreshToken"("sessionId");
CREATE INDEX "oauthRefreshToken_userId_idx" ON "oauthRefreshToken"("userId");
CREATE UNIQUE INDEX "oauthAccessTokenV2_token_key" ON "oauthAccessTokenV2"("token");
CREATE INDEX "oauthAccessTokenV2_clientId_idx" ON "oauthAccessTokenV2"("clientId");
CREATE INDEX "oauthAccessTokenV2_sessionId_idx" ON "oauthAccessTokenV2"("sessionId");
CREATE INDEX "oauthAccessTokenV2_userId_idx" ON "oauthAccessTokenV2"("userId");
CREATE INDEX "oauthAccessTokenV2_refreshId_idx" ON "oauthAccessTokenV2"("refreshId");
CREATE INDEX "oauthConsentV2_clientId_idx" ON "oauthConsentV2"("clientId");
CREATE INDEX "oauthConsentV2_userId_idx" ON "oauthConsentV2"("userId");

ALTER TABLE "oauthClient" ADD CONSTRAINT "oauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "oauthRefreshToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauthConsentV2" ADD CONSTRAINT "oauthConsentV2_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauthConsentV2" ADD CONSTRAINT "oauthConsentV2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
