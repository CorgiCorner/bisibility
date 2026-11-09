import { expect, it, vi } from "vitest";

const render = vi.hoisted(() => vi.fn());
vi.mock("@/components/admin/pages/OssAdminPage", () => ({ OssAdminPage: render }));

import Page from "./page";

it("passes search state to the shared authorized audit page", () => {
  const searchParams = Promise.resolve({ filter: "ops", cursor: "older" });
  Page({ searchParams });
  expect(render).toHaveBeenCalledWith({ view: "Audit", searchParams });
});
