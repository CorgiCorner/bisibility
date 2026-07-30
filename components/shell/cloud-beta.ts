export const CLOUD_BETA_DISMISSAL_COOKIE = "cloud-beta-dismissed";
export const CLOUD_BETA_DISMISSAL_VALUE = "1";
export const CLOUD_BETA_DISMISSAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function isCloudBetaDismissed(value: string | undefined) {
  return value === CLOUD_BETA_DISMISSAL_VALUE;
}
