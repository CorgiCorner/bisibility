import "server-only";

import { unstable_cache } from "next/cache";

const GITHUB_REPOSITORY_API_URL = "https://api.github.com/repos/CorgiCorner/bisibility";
const GITHUB_STARS_CACHE_SECONDS = 300;
const GITHUB_REQUEST_TIMEOUT_MS = 1_500;

function starCountFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const stars = (payload as { stargazers_count?: unknown }).stargazers_count;
  return typeof stars === "number" && Number.isSafeInteger(stars) && stars >= 0
    ? String(stars)
    : null;
}

export async function readGitHubStars(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher(GITHUB_REPOSITORY_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    });
    return response.ok ? starCountFrom(await response.json()) : null;
  } catch {
    // Do not turn a GitHub outage into a failed sign-in page.
    return null;
  }
}

export const getGitHubStars = unstable_cache(readGitHubStars, ["github-stars"], {
  revalidate: GITHUB_STARS_CACHE_SECONDS,
});
