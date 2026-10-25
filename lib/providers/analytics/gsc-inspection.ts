import { providerAccountKey } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { googleApiFetch, refreshGoogleAccessToken } from "./google-client";
import {
  type GscUrlInspectionResult,
  normalizeGscInspection,
  type UrlInspectionResponse,
} from "./gsc-inspection-result";
import { normalizeGscProperty } from "./gsc-property";
import { assertGscPropertyUrl } from "./gsc-property-membership";
import { withInspectionDeadline } from "./inspection-deadline";

export type { GscUrlInspectionResult } from "./gsc-inspection-result";

const URL_INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

export type GscUrlInspectionInput = {
  property: string;
  url: string;
  signal?: AbortSignal;
};

export type GscUrlInspectionSession = {
  inspectUrl(input: GscUrlInspectionInput): Promise<GscUrlInspectionResult>;
};

export async function createGscUrlInspectionSession(
  creds: ProviderCredentials,
): Promise<GscUrlInspectionSession> {
  const storedProperty = normalizeGscProperty(creds.login ?? "");
  if (!storedProperty) {
    throw new Error("Google Search Console connection is missing a site. Reconnect the account.");
  }
  let accessToken: string | undefined;

  return {
    async inspectUrl(input) {
      const property = normalizeGscProperty(input.property.trim() || storedProperty);
      assertGscPropertyUrl(storedProperty, input.url);
      if (property !== storedProperty)
        throw new Error("Inspection must use the connected property.");
      const inspect = async (signal: AbortSignal) => {
        signal.throwIfAborted();
        accessToken ??= await refreshGoogleAccessToken(creds.apiKey, creds.onRefreshToken, signal);
        signal.throwIfAborted();
        const data = await googleApiFetch<UrlInspectionResponse>(
          URL_INSPECTION_URL,
          accessToken,
          {
            body: JSON.stringify({ inspectionUrl: input.url, siteUrl: property }),
            method: "POST",
            signal,
          },
          {
            accountKey: providerAccountKey("gsc", { apiKey: creds.apiKey, login: property }),
            providerId: "gsc",
          },
        );
        return normalizeGscInspection(data);
      };
      return input.signal ? inspect(input.signal) : withInspectionDeadline(inspect, 30_000);
    },
  };
}
