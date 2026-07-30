"use client";

import { AlertBanner } from "@/components/ui";
import {
  isProjectReadOnly,
  normalizeProjectWriteMode,
  type ProjectWriteMode,
} from "@/lib/deployment/project-write-mode";
import { appPath } from "@/lib/routing/app-path";
import Tooltip from "@mui/material/Tooltip";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

export const PROJECT_READ_ONLY_REASON = "Read-only during migration hold";
export const PROJECT_MIGRATED_REASON = "Project migrated and disabled";

function readOnlyReasonFor(writeMode: ProjectWriteMode) {
  return writeMode === "migrated" ? PROJECT_MIGRATED_REASON : PROJECT_READ_ONLY_REASON;
}

type ProjectWriteModeContextValue = {
  readOnly: boolean;
  readOnlyReason: string;
  projectRef: string | null;
  writeMode: ProjectWriteMode;
};

const defaultValue: ProjectWriteModeContextValue = {
  readOnly: false,
  readOnlyReason: PROJECT_READ_ONLY_REASON,
  projectRef: null,
  writeMode: "active",
};

const ProjectWriteModeContext = createContext<ProjectWriteModeContextValue>(defaultValue);

export function ProjectWriteModeProvider({
  children,
  projectRef,
  writeMode,
}: Readonly<{
  children: ReactNode;
  projectRef: string;
  writeMode: ProjectWriteMode;
}>) {
  const normalizedWriteMode = normalizeProjectWriteMode(writeMode);
  const contextValue = useMemo(
    () => ({
      readOnly: isProjectReadOnly(normalizedWriteMode),
      readOnlyReason: readOnlyReasonFor(normalizedWriteMode),
      projectRef,
      writeMode: normalizedWriteMode,
    }),
    [normalizedWriteMode, projectRef],
  );

  return (
    <ProjectWriteModeContext.Provider value={contextValue}>
      {children}
    </ProjectWriteModeContext.Provider>
  );
}

export function useProjectWriteMode() {
  return useContext(ProjectWriteModeContext);
}

export function ProjectReadOnlyTooltip({
  children,
  className = "inline-flex",
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  const { readOnly, readOnlyReason } = useProjectWriteMode();
  // Always render the wrapper span so callers can rely on it for layout (flex
  // containers, flex-1 sizing) in both the writable and read-only states.
  const wrapped = (
    <span aria-label={readOnly ? readOnlyReason : undefined} className={className}>
      {children}
    </span>
  );
  if (!readOnly) {
    return wrapped;
  }

  return <Tooltip title={readOnlyReason}>{wrapped}</Tooltip>;
}

export function ProjectWriteModeBanner() {
  const { projectRef, readOnly, writeMode } = useProjectWriteMode();
  if (!readOnly) {
    return null;
  }

  if (writeMode === "migrated") {
    return (
      <AlertBanner
        action={{
          href: projectRef ? `${appPath(projectRef, "settings")}#migration` : undefined,
          icon: "arrow",
          label: "Migration settings",
        }}
        detail="This project moved to another bisibility instance. Writes and rank checks stay off until you reactivate it in settings."
        tint="yellow"
        title="Project migrated - disabled on this instance."
      />
    );
  }

  return (
    <AlertBanner
      action={{
        href: projectRef ? `${appPath(projectRef, "settings")}#migration` : undefined,
        icon: "arrow",
        label: "Migration settings",
      }}
      detail="Reads still work. Writes, imports, provider changes, and rank-check starts are paused. Cancel the migration in settings to resume writes; unattended holds release after 24 hours."
      tint="yellow"
      title="Project is read-only - migration in progress."
    />
  );
}
