import { appPath, type ProjectRef } from "./app-path";

export function projectSchedulesPath(projectRef: ProjectRef, publicId?: string): string {
  return appPath(projectRef, "runs", "schedules", publicId ?? "");
}
