import { redirect } from "@/tests/next-navigation";
import { expect, it, vi } from "vitest";
import UsageSettingsPage from "./page";

vi.mock("@/components/settings/usage/account-extension", () => ({
  renderAccountUsageExtension: vi.fn(async () => null),
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: vi.fn(async () => ({ locale: "en", timeZone: "UTC" })),
}));

const readable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: readable }));

it.each([
  [undefined, "/app/prj_canonical/usage"],
  ["edit", "/app/prj_canonical/usage?budget=edit"],
  ["other", "/app/prj_canonical/usage"],
])("redirects legacy usage with budget=%s", async (budget, destination) => {
  readable.mockResolvedValue({ project: { publicId: "prj_canonical" } });
  await UsageSettingsPage({
    params: Promise.resolve({ project: "prj_alias" }),
    searchParams: Promise.resolve({ budget }),
  });
  expect(readable).toHaveBeenCalledWith("prj_alias");
  expect(redirect).toHaveBeenCalledWith(destination);
});
