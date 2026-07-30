import { absoluteUrl, resolveCanonicalOrigin } from "./origin";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10_000;

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export type IndexNowResult = {
  ok: boolean;
  status: number;
};

export function readIndexNowKey(env: NodeJS.ProcessEnv = process.env) {
  return env.INDEXNOW_KEY?.trim() || null;
}

export function chunkIndexNowUrls(urls: readonly string[], size = INDEXNOW_MAX_URLS) {
  if (!Number.isInteger(size) || size < 1 || size > INDEXNOW_MAX_URLS) {
    throw new Error(`IndexNow chunk size must be between 1 and ${INDEXNOW_MAX_URLS}.`);
  }

  const chunks: string[][] = [];
  for (let index = 0; index < urls.length; index += size) {
    chunks.push(urls.slice(index, index + size));
  }
  return chunks;
}

export function buildIndexNowPayload(urls: readonly string[]): IndexNowPayload {
  if (urls.length === 0) throw new Error("IndexNow requires at least one URL.");

  const key = readIndexNowKey();
  if (!key) throw new Error("INDEXNOW_KEY is not configured.");

  const origin = resolveCanonicalOrigin();
  const canonical = new URL(origin);
  const urlList = [...new Set(urls.map((value) => new URL(value, `${origin}/`).toString()))];

  for (const url of urlList) {
    if (new URL(url).origin !== canonical.origin) {
      throw new Error(`IndexNow URL must belong to ${canonical.origin}: ${url}`);
    }
  }
  if (urlList.length > INDEXNOW_MAX_URLS) {
    throw new Error(`IndexNow payloads support at most ${INDEXNOW_MAX_URLS} URLs.`);
  }

  return {
    host: canonical.host,
    key,
    keyLocation: absoluteUrl(origin, "/indexnow-key.txt"),
    urlList,
  };
}

export async function submitToIndexNow(urls: readonly string[]): Promise<IndexNowResult> {
  if (!readIndexNowKey()) {
    console.info("[indexnow] INDEXNOW_KEY is not configured; skipping submission.");
    return { ok: false, status: 0 };
  }
  if (urls.length === 0) throw new Error("IndexNow requires at least one URL.");

  let result: IndexNowResult = { ok: true, status: 200 };
  for (const chunk of chunkIndexNowUrls(urls)) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      body: JSON.stringify(buildIndexNowPayload(chunk)),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    result = { ok: response.ok, status: response.status };
    if (!response.ok) return result;
  }
  return result;
}
