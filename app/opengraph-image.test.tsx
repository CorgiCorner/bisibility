import { LICENSE } from "@/lib/site/site";
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
  it("renders the open-source observability positioning and agent-ready toolchain", () => {
    Image();
    const markup = renderToStaticMarkup(capture.element);

    expect(alt).toBe("Open-source observability for your rankings");
    expect(capture.options).toEqual(size);
    expect(markup).toContain("Open-source observability");
    expect(markup).toContain("for your rankings.");
    expect(markup).toContain(LICENSE);
    expect(markup).toContain("MCP server + SDKs + CLI");
    expect(markup).toContain("Agent-ready");
    expect(markup).not.toContain("Know where you rank.");
    expect(markup).not.toContain("Signals timeline");
  });
});
