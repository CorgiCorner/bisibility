import { providerAccountKey } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { googleApiFetch, refreshGoogleAccessToken, stringValue } from "./google-client";
import { normalizeGscProperty } from "./gsc-property";

const URL_INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

export type GscUrlInspectionInput = {
  property: string;
  url: string;
};

export type GscUrlInspectionResult = {
  coverageState: string | null;
  googleCanonical: string | null;
  lastCrawlAt: Date | null;
  userCanonical: string | null;
  verdict: string | null;
};

export type GscUrlInspectionSession = {
  inspectUrl(input: GscUrlInspectionInput): Promise<GscUrlInspectionResult>;
};

type UrlInspectionResponse = {
  inspectionResult?: {
    indexStatusResult?: {
      coverageState?: unknown;
      googleCanonical?: unknown;
      lastCrawlTime?: unknown;
      userCanonical?: unknown;
      verdict?: unknown;
    };
  };
};

function parsedDate(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createGscUrlInspectionSession(
  creds: ProviderCredentials,
): Promise<GscUrlInspectionSession> {
  const storedProperty = normalizeGscProperty(creds.login ?? "");
  if (!storedProperty) {
    throw new Error("Google Search Console connection is missing a site. Reconnect the account.");
  }
  const accessToken = await refreshGoogleAccessToken(creds.apiKey, creds.onRefreshToken);

  return {
    async inspectUrl(input) {
      const property = input.property.trim() || storedProperty;
      const data = await googleApiFetch<UrlInspectionResponse>(
        URL_INSPECTION_URL,
        accessToken,
        {
          body: JSON.stringify({ inspectionUrl: input.url, siteUrl: property }),
          method: "POST",
        },
        {
          accountKey: providerAccountKey("gsc", { apiKey: creds.apiKey, login: property }),
          providerId: "gsc",
        },
      );
      const status = data.inspectionResult?.indexStatusResult ?? {};
      return {
        coverageState: stringValue(status.coverageState),
        googleCanonical: stringValue(status.googleCanonical),
        lastCrawlAt: parsedDate(status.lastCrawlTime),
        userCanonical: stringValue(status.userCanonical),
        verdict: stringValue(status.verdict),
      };
    },
  };
}
