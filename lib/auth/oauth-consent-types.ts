export type OAuthConsentClient = {
  dynamic: boolean;
  id: string;
  name: string;
  /** Host and path label used for the consent summary and read-only client detection. */
  redirectUri: string | null;
  /**
   * Exact registered redirect, including its scheme when one was stored.
   * A stored value with no scheme is kept as-is instead of guessing https.
   */
  redirectTarget?: string | null;
};
