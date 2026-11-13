import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it } from "vitest";
import BrandVisibilityPage from "./page";

describe("BrandVisibilityPage", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("opens Research and keeps the query", async () => {
    await BrandVisibilityPage({
      params: Promise.resolve({ project: "prj_public" }),
      searchParams: Promise.resolve({ fresh: "1", q: "example.com" }),
    });
    expect(redirect).toHaveBeenCalledWith(
      "/app/prj_public/ai-visibility?tab=research&fresh=1&q=example.com",
    );
  });
});
