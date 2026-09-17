import { redirect } from "@/tests/next-navigation";
import { expect, it, vi } from "vitest";
import UsageSettingsPage from "./page";

const readable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: readable }));

it.each([
  [undefined, "/app/prj_canonical/integrations?tab=usage"],
  ["edit", "/app/prj_canonical/integrations?tab=usage&budget=edit"],
  ["other", "/app/prj_canonical/integrations?tab=usage"],
])("redirects legacy usage with budget=%s", async (budget, destination) => {
  readable.mockResolvedValue({ project: { publicId: "prj_canonical" } });
  await UsageSettingsPage({
    params: Promise.resolve({ project: "prj_alias" }),
    searchParams: Promise.resolve({ budget }),
  });
  expect(readable).toHaveBeenCalledWith("prj_alias");
  expect(redirect).toHaveBeenCalledWith(destination);
});
