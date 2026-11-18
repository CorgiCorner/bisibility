"use client";
import {
  createServerModelPlaygroundService,
  serverModelCatalogLoader,
} from "@/lib/model-playground/client-service";
import { type ComponentProps, useMemo } from "react";
import { LegacyModelPlayground } from "./LegacyModelPlayground";
import { NativeModelPlayground, type NativeModelPlaygroundConfig } from "./NativeModelPlayground";

/** Only the server page can opt in. Omission keeps the original legacy action and form. */
export function ModelPlayground(
  props: ComponentProps<typeof LegacyModelPlayground> & {
    nativeComposer?:
      | (Omit<NativeModelPlaygroundConfig, "service"> & {
          service?: NativeModelPlaygroundConfig["service"];
        })
      | { enabled: false };
  },
) {
  const suppliedLoader = props.nativeComposer?.enabled
    ? props.nativeComposer.loadCatalog
    : undefined;
  const suppliedService = props.nativeComposer?.enabled ? props.nativeComposer.service : undefined;
  const loadCatalog = useMemo(
    () =>
      suppliedLoader ?? (suppliedService ? undefined : serverModelCatalogLoader(props.projectId)),
    [props.projectId, suppliedLoader, suppliedService],
  );
  const service = useMemo(
    () => suppliedService ?? createServerModelPlaygroundService(props.projectId),
    [props.projectId, suppliedService],
  );
  if (!props.nativeComposer?.enabled) return <LegacyModelPlayground {...props} />;
  return (
    <NativeModelPlayground
      config={{
        ...props.nativeComposer,
        service,
        loadCatalog,
      }}
      canRun={props.canRun ?? true}
      canTrack={props.canTrack}
      projectId={props.projectId}
      entities={props.entities}
      topics={props.topics}
      sourceOverrides={props.sourceOverrides}
    />
  );
}
