import "server-only";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { notFound, permanentRedirect } from "next/navigation";
import { legacyAdminDestination } from "./legacy-extension";
import type { AdminSearch } from "./page-data";

const shared: Record<string, string> = {
  "": "/app/admin/overview/status",
  administration: "/app/admin/users/accounts",
  metering: "/app/admin/overview/status",
  "metering/recovery": "/app/admin/operations/tasks",
};

/** Authorize before resolving edition-specific destinations or reading query input. */
export async function redirectLegacyAdmin(path: string, searchParams?: Promise<AdminSearch>) {
  await requireInstanceAdmin();
  const params = (await searchParams) ?? {};
  const fallback = path === "administration" && params.usagePeriod ? shared.metering : shared[path];
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const recovery = path === "metering/recovery" || (path === "metering" && tab === "incidents");
  const destination = recovery
    ? "/app/admin/operations/tasks"
    : (legacyAdminDestination(path, params) ?? fallback);
  if (!destination) notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  // The survey filter was renamed when the current page replaced the old insights page.
  if (!query.has("period") && query.has("surveyPeriod")) {
    query.set("period", query.get("surveyPeriod") ?? "all");
  }
  permanentRedirect(`${destination}${query.size ? `?${query}` : ""}`);
}
