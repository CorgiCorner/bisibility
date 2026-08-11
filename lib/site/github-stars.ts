import "server-only";
import "@/lib/deployment/runtime-env.generated";

import { unstable_cache } from "next/cache";

const GITHUB_REPOSITORY_API_URL = "https://api.github.com/repos/CorgiCorner/bisibility";
const GITHUB_STARS_CACHE_SECONDS = 300;
const GITHUB_REQUEST_TIMEOUT_MS = 3_000;

type GitHubStarsReadOptions = {
  token?: string;
};

function starCountFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const stars = (payload as { stargazers_count?: unknown }).stargazers_count;
  return typeof stars === "number" && Number.isSafeInteger(stars) && stars >= 0
    ? String(stars)
    : null;
}

function requestHeaders(token: string | undefined) {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const normalizedToken = token?.trim();
  if (normalizedToken) {
    headers.Authorization = `Bearer ${normalizedToken}`;
  }
  return headers;
}

export async function readGitHubStars(
  fetcher: typeof fetch = fetch,
  { token = process.env.GITHUB_API_TOKEN }: GitHubStarsReadOptions = {},
): Promise<string | null> {
  try {
    const response = await fetcher(GITHUB_REPOSITORY_API_URL, {
      headers: requestHeaders(token),
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`GitHub repository request failed with ${response.status}`);
    }
    const count = starCountFrom(await response.json());
    if (count === null) {
      throw new Error("GitHub repository response did not contain a valid star count");
    }
    return count;
  } catch {
    return null;
  }
}

const readLastKnownGoodGitHubStars = unstable_cache(
  async () => {
    const count = await readGitHubStars();
    if (count === null) {
      // A thrown revalidation keeps the prior Data Cache value and retries later. A cold failure
      // reaches getGitHubStars, which fails soft without caching null.
      throw new Error("GitHub star count is unavailable");
    }
    return count;
  },
  ["github-stars-last-known-good"],
  {
    revalidate: GITHUB_STARS_CACHE_SECONDS,
  },
);

export async function getGitHubStars(): Promise<string | null> {
  try {
    return await readLastKnownGoodGitHubStars();
  } catch {
    return null;
  }
}
