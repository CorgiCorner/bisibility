import { appPath } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

type LegacySearchConsolePageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function searchParamsSuffix(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const entry of value) params.append(key, entry);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Preserves bookmarked legacy links without exposing the retired route in app navigation. */
export default async function LegacySearchConsolePage({
  params,
  searchParams,
}: Readonly<LegacySearchConsolePageProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  redirect(`${appPath(project, "search-console")}${searchParamsSuffix(query)}`);
}
