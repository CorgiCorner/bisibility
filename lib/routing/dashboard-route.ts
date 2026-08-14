import { appPath, asProjectRef } from "./app-path";

export function dashboardRoute(
  project: string,
  search: Record<string, string | string[] | undefined> | undefined,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) query.append(key, item);
  }
  const path = appPath(asProjectRef(project), "dashboard");
  return query.size ? `${path}?${query.toString()}` : path;
}
