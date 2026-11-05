import {
  accountFeatureTestMessages,
  featureMessagesElement,
} from "@/i18n/test-support/render-with-feature-messages";
import { installServerTestDom } from "@/tests/config/vitest.server-test-dom";
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalTokenDateLabels } from "./PersonalTokenDateLabels";

describe("PersonalTokensSection", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("replaces the UTC server date with the browser date after hydration", async () => {
    process.env.TZ = "America/New_York";
    const props = {
      dateFormat: "month_first" as const,
      token: {
        createdAt: "2026-06-20T01:30:00.000Z",
        expiresAt: null,
        lastUsedAt: null,
      },
    };
    const markup = renderToString(
      featureMessagesElement(<PersonalTokenDateLabels {...props} />, {
        messages: accountFeatureTestMessages,
      }),
    );
    installServerTestDom();
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = hydrateRoot(
      container,
      featureMessagesElement(<PersonalTokenDateLabels {...props} />, {
        messages: accountFeatureTestMessages,
      }),
    );

    expect(container).toHaveTextContent("created Jun 20, 2026");
    await act(async () => undefined);
    expect(container).toHaveTextContent("created Jun 19, 2026");
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
