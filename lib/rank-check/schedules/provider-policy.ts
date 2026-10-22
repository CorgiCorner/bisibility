export function scheduleProviderId(policy: string | null | undefined) {
  return policy && policy !== "project" ? policy : undefined;
}
