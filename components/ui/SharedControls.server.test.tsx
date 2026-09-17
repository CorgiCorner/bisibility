import { sharedMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdChip, shortId } from "./IdChip";
import { StatusPill } from "./StatusPill";

describe("shared controls server boundary", () => {
  it("keeps IdChip utilities and StatusPill callable from a server render", () => {
    const markup = renderToStaticMarkup(
      sharedMessagesElement(
        <>
          <IdChip value="prj_8fK2Qf9m" />
          <StatusPill primary status="connected" />
        </>,
      ),
    );

    expect(shortId("prj_8fK2Qf9m")).toBe("prj_8fK2Qf");
    expect(markup).toContain("Copy ID");
    expect(markup).toContain("Connected");
    expect(markup).toContain("Primary");
  });
});
