"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

const ImportCsvWizard = dynamic(
  () => import("./ImportCsvWizard").then((mod) => mod.ImportCsvWizard),
  { ssr: false },
);

type KeywordImportContextValue = {
  openKeywordImport: (projectId: string) => void;
};

const KeywordImportContext = createContext<KeywordImportContextValue | null>(null);

export function useKeywordImport() {
  const context = useContext(KeywordImportContext);
  if (!context) {
    throw new Error("useKeywordImport must be used within KeywordImportProvider");
  }
  return context;
}

type KeywordImportProviderProps = {
  activeProjectId?: string;
  children: ReactNode;
};

function KeywordImportProviderState({ children }: Readonly<{ children: ReactNode }>) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const visibleChildren = useRef(children);

  // Hold the server-fed grid steady until the user dismisses the import result.
  if (!projectId) visibleChildren.current = children;

  const openKeywordImport = useCallback((nextProjectId: string) => {
    setProjectId(nextProjectId);
  }, []);
  const closeKeywordImport = useCallback(() => {
    setProjectId(null);
  }, []);
  const contextValue = useMemo(() => ({ openKeywordImport }), [openKeywordImport]);

  return (
    <KeywordImportContext.Provider value={contextValue}>
      {visibleChildren.current}
      {projectId ? (
        <ImportCsvWizard key={projectId} onClose={closeKeywordImport} open projectId={projectId} />
      ) : null}
    </KeywordImportContext.Provider>
  );
}

export function KeywordImportProvider({
  activeProjectId,
  children,
}: Readonly<KeywordImportProviderProps>) {
  const pathname = usePathname();
  return (
    <KeywordImportProviderState key={`${activeProjectId ?? "root"}:${pathname}`}>
      {children}
    </KeywordImportProviderState>
  );
}
