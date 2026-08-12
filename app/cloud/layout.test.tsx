import { notFound } from "@/tests/next-navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCloud: true,
}));

vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.isCloud;
  },
}));
vi.mock("@/lib/seo/noindex", () => ({ createNoindexMetadata: () => ({}) }));

import CloudLayout from "./layout";

describe("CloudLayout deployment guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCloud = true;
    notFound.mockImplementation(() => {
      throw new Error("not-found");
    });
  });

  it("renders cloud route content on a cloud deployment", () => {
    const result = CloudLayout({ children: <div>Cloud content</div> });

    expect(renderToStaticMarkup(result)).toContain("Cloud content");
  });

  it("returns not found for /cloud/import on a self-hosted deployment", () => {
    mocks.isCloud = false;

    expect(() => CloudLayout({ children: <div>Import content</div> })).toThrow("not-found");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
