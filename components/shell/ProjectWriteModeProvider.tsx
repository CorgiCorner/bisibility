"use client";

import {
  isProjectReadOnly,
  normalizeProjectWriteMode,
  type ProjectWriteMode,
} from "@/lib/deployment/project-write-mode";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

export type ProjectWriteModeReasons = Readonly<{
  migrated: string;
  migration_hold: string;
}>;

type ProjectWriteModeContextValue = {
  canEditProject: boolean;
  readOnly: boolean;
  readOnlyReason: string | null;
  projectRef: string | null;
  writeMode: ProjectWriteMode;
};

const defaultValue: ProjectWriteModeContextValue = {
  canEditProject: false,
  readOnly: false,
  readOnlyReason: null,
  projectRef: null,
  writeMode: "active",
};

const ProjectWriteModeContext = createContext<ProjectWriteModeContextValue>(defaultValue);

export function ProjectWriteModeProvider({
  canEditProject = false,
  children,
  projectRef,
  reasons,
  writeMode,
}: Readonly<{
  canEditProject?: boolean;
  children: ReactNode;
  projectRef: string;
  reasons?: ProjectWriteModeReasons;
  writeMode: ProjectWriteMode;
}>) {
  const normalizedWriteMode = normalizeProjectWriteMode(writeMode);
  const readOnly = isProjectReadOnly(normalizedWriteMode);
  const contextValue = useMemo(
    () => ({
      canEditProject,
      readOnly,
      readOnlyReason:
        normalizedWriteMode === "active" ? null : (reasons?.[normalizedWriteMode] ?? null),
      projectRef,
      writeMode: normalizedWriteMode,
    }),
    [canEditProject, normalizedWriteMode, projectRef, readOnly, reasons],
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
