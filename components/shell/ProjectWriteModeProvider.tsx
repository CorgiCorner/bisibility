"use client";

import {
  isProjectReadOnly,
  normalizeProjectWriteMode,
  type ProjectWriteMode,
} from "@/lib/deployment/project-write-mode";
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
