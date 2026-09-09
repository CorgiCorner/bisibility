import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOnboardingSources } from "./use-onboarding-sources";

describe("onboarding source state after a website correction", () => {
  it.each([false, true])(
    "removes old GSC context while preserving other analytics: %s",
    (hasOtherAnalyticsSource) => {
      const { result } = renderHook(() =>
        useOnboardingSources({
          gscJustConnected: true,
          gscGoogleOAuth: { properties: [] },
          gscPropertyLabel: "sc-domain:old.com",
          hasAnalyticsSource: true,
          hasOtherAnalyticsSource,
          rankedKeywordConnections: [
            { id: "gsc", label: "Old GSC", provider: "gsc" },
            { id: "serp", label: "SERP", provider: "dataforseo" },
          ],
        }),
      );
      act(() => result.current.invalidateGsc());
      expect(result.current).toMatchObject({
        gscJustConnected: false,
        gscGoogleOAuth: null,
        gscPropertyLabel: null,
        hasAnalyticsSource: hasOtherAnalyticsSource,
      });
      expect(result.current.rankedKeywordConnections).toEqual([
        { id: "serp", label: "SERP", provider: "dataforseo" },
      ]);
    },
  );
});
