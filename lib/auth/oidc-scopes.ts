// Shared by the OIDC provider and discovery metadata; `tokens:write` gates the
// OAuth-to-personal-token exchange on POST /api/v1/me/tokens.
export const oidcScopes = ["openid", "profile", "email", "offline_access", "tokens:write"] as const;
