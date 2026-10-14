import type { Actor } from "@/lib/auth/authorize";
import { readMeasurementSettingsHost } from "@/lib/measurement-settings/host/read";
import { MeasurementSettingsHost } from "./MeasurementSettingsHost";
/** Installed Tracking RSC caller. It reads only; configuration and paid I/O require explicit actions. */
export async function MeasurementSettingsHostSection({
  actor,
  projectId,
}: Readonly<{ actor: Actor; projectId: string }>) {
  const initial = await readMeasurementSettingsHost({ actor }, projectId);
  return <MeasurementSettingsHost projectId={projectId} initial={initial} />;
}
