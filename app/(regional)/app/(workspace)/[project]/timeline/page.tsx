import { appPath } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

type TimelineRedirectProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelineRedirect({
  params,
  searchParams,
}: Readonly<TimelineRedirectProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams ?? Promise.resolve({})]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") search.append(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    }
  }
  const suffix = search.toString();
  const path = appPath(project, "annotations");
  redirect(suffix ? `${path}?${suffix}` : path);
}
