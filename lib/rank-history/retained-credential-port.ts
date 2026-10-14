/** Exact read shapes shared by retained-history transports and their credential fixtures. */
type CredentialState = { revokedAt: Date | null; expiresAt: Date | null; scopes: unknown };
const credentialSelect = { revokedAt: true, expiresAt: true, scopes: true } as const;
export type RetainedCredentialReadPort = {
  apiKey: {
    findFirst(input: {
      where: { id: string; projectId: string };
      select: typeof credentialSelect;
    }): Promise<CredentialState | null>;
  };
  personalAccessToken: {
    findFirst(input: {
      where: { id: string; userId: string };
      select: typeof credentialSelect;
    }): Promise<CredentialState | null>;
  };
  oauthClient: {
    findUnique(input: {
      where: { clientId: string };
      select: { disabled: true; scopes: true };
    }): Promise<{ disabled: boolean | null; scopes: unknown } | null>;
  };
  oauthConsent: {
    findFirst(input: {
      where: { clientId: string; userId: string };
      select: { scopes: true };
    }): Promise<{ scopes: unknown } | null>;
  };
};
