import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ element: null as ReactNode, options: null as unknown }));

vi.mock("next/og", () => ({
  ImageResponse: class ImageResponse {
    constructor(element: ReactNode, options: unknown) {
      capture.element = element;
      capture.options = options;
    }
  },
}));

import Image, { alt, size } from "./opengraph-image";

describe("main Open Graph image", () => {
  it("renders the MCP-ready open-source SEO platform positioning", () => {
    Image();
    const markup = renderToStaticMarkup(capture.element);

    expect(alt).toBe("Open-source SEO platform");
    expect(capture.options).toEqual(size);
    expect(markup.match(/MCP-ready/g)).toEqual(["MCP-ready"]);
    expect(markup).toContain("Open-source SEO platform");
    expect(markup).not.toContain("Open-source SEO platform.");
    expect(markup).toContain("Track rankings");
    expect(markup).toContain("Research keywords");
    expect(markup).toContain("Inspect backlinks");
    expect(markup).not.toContain("research keywords");
    expect(markup).not.toContain("inspect backlinks");
    expect(markup).toContain("Self-host or free beta");
    expect(markup).toContain("Pay only for SERP checks");
    expect(markup).not.toContain("#f1511c");
    expect(
      markup.split(
        "align-items:center;color:#6b6657;display:flex;font-size:26px;gap:12px;white-space:nowrap",
      ).length - 1,
    ).toBe(2);
    expect(markup).not.toContain("Open-source observability");
    expect(markup).not.toContain("for your rankings.");
    expect(markup).not.toContain("MCP server + SDKs + CLI");
    expect(markup).not.toContain("Agent-ready");
    expect(markup).not.toContain("Know where you rank.");
    expect(markup).not.toContain("Signals timeline");
    expect(markup).not.toContain("SEO observability for developers");
  });
});
