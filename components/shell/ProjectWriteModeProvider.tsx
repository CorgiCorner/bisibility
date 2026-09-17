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
  readOnly: boolean;
  readOnlyReason: string | null;
  projectRef: string | null;
  writeMode: ProjectWriteMode;
};

const defaultValue: ProjectWriteModeContextValue = {
  readOnly: false,
  readOnlyReason: null,
  projectRef: null,
  writeMode: "active",
};

const ProjectWriteModeContext = createContext<ProjectWriteModeContextValue>(defaultValue);

export function ProjectWriteModeProvider({
  children,
  projectRef,
  reasons,
  writeMode,
}: Readonly<{
  children: ReactNode;
  projectRef: string;
  reasons?: ProjectWriteModeReasons;
  writeMode: ProjectWriteMode;
}>) {
  const normalizedWriteMode = normalizeProjectWriteMode(writeMode);
  const readOnly = isProjectReadOnly(normalizedWriteMode);
  const contextValue = useMemo(
    () => ({
      readOnly,
      readOnlyReason:
        normalizedWriteMode === "active" ? null : (reasons?.[normalizedWriteMode] ?? null),
      projectRef,
      writeMode: normalizedWriteMode,
    }),
    [normalizedWriteMode, projectRef, readOnly, reasons],
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
