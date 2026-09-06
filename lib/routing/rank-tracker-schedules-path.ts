import { appPath, type ProjectRef } from "./app-path";

export function rankTrackerSchedulesPath(projectRef: ProjectRef, publicId?: string): string {
  return appPath(projectRef, "rank-tracker", "schedules", publicId ?? "");
}
