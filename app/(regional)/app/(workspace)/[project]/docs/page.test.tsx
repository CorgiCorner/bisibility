import { DOCS_URL } from "@/lib/site/site";
import { redirect } from "next/navigation";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.access }));

import DocsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(undefined);
  vi.mocked(redirect).mockImplementation(() => {
    throw new Error("test redirect");
  });
});

it("authorizes the project before redirecting the retired in-app docs to current documentation", async () => {
  await expect(DocsPage({ params: Promise.resolve({ project: "prj_test" }) })).rejects.toThrow(
    "test redirect",
  );
  expect(mocks.access).toHaveBeenCalledExactlyOnceWith("prj_test");
  expect(vi.mocked(redirect)).toHaveBeenCalledExactlyOnceWith(DOCS_URL);
});

it("does not redirect when project access is refused", async () => {
  mocks.access.mockRejectedValueOnce(new Error("forbidden"));
  await expect(DocsPage({ params: Promise.resolve({ project: "prj_test" }) })).rejects.toThrow(
    "forbidden",
  );
  expect(vi.mocked(redirect)).not.toHaveBeenCalled();
});
