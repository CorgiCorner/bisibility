import { notFound } from "@/tests/next-navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCloud: true,
  guard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.isCloud;
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/app-extensions", () => ({ appExtensions: { guardAccountSurface: mocks.guard } }));
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

  it("renders cloud route content on a cloud deployment", async () => {
    const result = await CloudLayout({ children: <div>Cloud content</div> });

    expect(renderToStaticMarkup(result)).toContain("Cloud content");
    expect(mocks.guard).toHaveBeenCalledWith("owner");
  });

  it("returns not found for /cloud/import on a self-hosted deployment", async () => {
    mocks.isCloud = false;

    await expect(CloudLayout({ children: <div>Import content</div> })).rejects.toThrow("not-found");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
