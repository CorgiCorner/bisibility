export const SELF_HOSTED_ALLOW_INDEXING_ENV = "SELF_HOSTED_ALLOW_INDEXING";

export function selfHostedIndexingAllowed(value = process.env.SELF_HOSTED_ALLOW_INDEXING) {
  return value?.trim().toLowerCase() === "true";
}

export function createSelfHostedRobotsTxt(value = process.env.SELF_HOSTED_ALLOW_INDEXING) {
  const directive = selfHostedIndexingAllowed(value) ? "Allow: /" : "Disallow: /";
  return `User-agent: *\n${directive}\n`;
}

export function createSelfHostedRobotsResponse(value = process.env.SELF_HOSTED_ALLOW_INDEXING) {
  return new Response(createSelfHostedRobotsTxt(value), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function selfHostedRobotsTag(value = process.env.SELF_HOSTED_ALLOW_INDEXING) {
  return selfHostedIndexingAllowed(value) ? null : "noindex";
}
