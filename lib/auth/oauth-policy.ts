export const FIRST_PARTY_OAUTH_CLIENT_ID = "bisibility-cli";
export const OAUTH_AUTHORIZATION_TTL_SECONDS = 5 * 60;
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const OAUTH_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const OAUTH_ACCESS_TOKEN_TTL_LABEL = "1 hour";
export const OAUTH_REFRESH_TOKEN_TTL_LABEL = "30 days";

export function isDynamicallyRegisteredOAuthClient(clientId: string) {
  return clientId !== FIRST_PARTY_OAUTH_CLIENT_ID;
}
