import type { ProviderCredentials } from "./types";

type CredentialInput = {
  credentials?: { apiKey?: string; endpoint?: string; login?: string; secret?: string };
  login?: string;
  secret?: string;
};

export function credentialsFromInput(input: CredentialInput): ProviderCredentials {
  const endpoint = input.credentials?.endpoint;
  const login = input.credentials?.login ?? input.login;
  const secret = input.credentials?.secret ?? input.secret;
  const apiKey = input.credentials?.apiKey ?? (login ? undefined : secret);
  return {
    ...(endpoint ? { endpoint } : {}),
    ...(login ? { login } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(login && secret ? { password: secret } : {}),
  };
}
