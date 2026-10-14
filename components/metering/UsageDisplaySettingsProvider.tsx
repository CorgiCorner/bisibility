"use client";
import { updateProjectUsageDisplay } from "@/lib/actions/project-usage-display";
import {
  type ProjectUsageDisplaySettings,
  usageDisplayOptionsSchema,
} from "@/lib/project-usage-display/schema";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { type DisplayContext, UsageDisplaySettingsContext } from "./usage-display-context";
import type { UsagePresentationOptions } from "./usage-number-format";
/** One project authority wraps shell and page; browser preferences are never imported. */
export function UsageDisplaySettingsProvider({
  children,
  initial,
}: Readonly<{ children: ReactNode; initial: ProjectUsageDisplaySettings }>) {
  const [saved, setSaved] = useState<ProjectUsageDisplaySettings | null>(null);
  const [errorState, setErrorState] = useState<{
    kind: NonNullable<DisplayContext["error"]>;
    authority: ProjectUsageDisplaySettings;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const current =
    saved?.projectId === initial.projectId && saved.revision > initial.revision
      ? { ...saved, canEdit: initial.canEdit && saved.canEdit }
      : initial;
  const error =
    errorState?.kind === "forbidden" && errorState.authority !== initial
      ? null
      : (errorState?.kind ?? null);
  function setError(kind: DisplayContext["error"]) {
    setErrorState(kind ? { kind, authority: initial } : null);
  }
  function setOptions(update: UsagePresentationOptions) {
    if (!current.canEdit || error === "forbidden" || pending) return;
    const options = usageDisplayOptionsSchema.safeParse({ ...current.options, ...update });
    if (!options.success) {
      setError("invalid");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateProjectUsageDisplay({
          projectId: current.projectId,
          expectedRevision: current.revision,
          options: options.data,
        });
        if (result.kind === "saved" || result.kind === "conflict") {
          if (result.value.projectId !== current.projectId) {
            setError("failed");
            return;
          }
          setSaved(result.value);
          setError(result.kind === "saved" ? null : "conflict");
          router.refresh();
        } else {
          setError(result.kind);
          if (result.kind === "forbidden") router.refresh();
        }
      } catch {
        setError("failed");
      }
    });
  }
  return (
    <UsageDisplaySettingsContext
      value={{
        options: current.options,
        canEdit: current.canEdit && error !== "forbidden",
        pending,
        error,
        setOptions,
      }}
    >
      {children}
    </UsageDisplaySettingsContext>
  );
}
