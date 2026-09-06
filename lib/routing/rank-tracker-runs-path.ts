import { appPath, type ProjectRef } from "./app-path";

export function rankTrackerRunsPath(projectRef: ProjectRef, publicId?: string): string {
  return appPath(projectRef, "rank-tracker", "runs", publicId ?? "");
}
