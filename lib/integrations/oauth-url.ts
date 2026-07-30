import "server-only";

function configuredOrigin() {
  for (const candidate of [process.env.SITE_URL, process.env.BETTER_AUTH_URL]) {
    if (candidate && URL.canParse(candidate)) {
      return new URL(candidate).origin;
    }
  }
  return null;
}

export function oauthRequestOrigin(requestUrl: string) {
  return configuredOrigin() ?? new URL(requestUrl).origin;
}

export function oauthResultUrl(requestUrl: string, returnPath: string) {
  return new URL(returnPath, oauthRequestOrigin(requestUrl));
}
