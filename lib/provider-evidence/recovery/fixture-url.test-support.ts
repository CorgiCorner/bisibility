/** Same disposable database boundary as the provider usage PostgreSQL suites. */
export function assertRecoveryFixtureUrl(value: string | undefined) {
  const url = new URL(value ?? "");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/credits_fixture" ||
    process.env.DEPLOYMENT_ENV !== "test"
  )
    throw new Error("Recovery tests require a disposable loopback credits_fixture in test mode");
}
