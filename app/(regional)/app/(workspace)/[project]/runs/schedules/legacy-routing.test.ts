import { redirect } from "@/tests/next-navigation";
import { beforeEach, expect, it, vi } from "vitest";
import DetailPage from "./[publicId]/page";
import ListPage from "./page";

vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: async () => ({ publicId: "prj_public" }),
}));
beforeEach(() => vi.clearAllMocks());
it("keeps query state when an old list URL redirects", async () => {
  await ListPage({
    params: Promise.resolve({ project: "old-reference" }),
    searchParams: Promise.resolve({ status: "archived", ai: ["one", "two"] }),
  });
  expect(redirect).toHaveBeenCalledWith("/app/prj_public/schedules?status=archived&ai=one&ai=two");
});
it("keeps detail and saved state when an old schedule URL redirects", async () => {
  await DetailPage({
    params: Promise.resolve({ project: "old-reference", publicId: "sch_one" }),
    searchParams: Promise.resolve({ saved: "1" }),
  });
  expect(redirect).toHaveBeenCalledWith("/app/prj_public/schedules/sch_one?saved=1");
});
