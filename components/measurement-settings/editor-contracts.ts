import type {
  MeasurementChoices,
  MeasurementPermissions,
  MeasurementPorts,
  MeasurementTranslator,
  SettingsSnapshot,
} from "./contracts";
import type { MeasurementDraft, previewRequest } from "./draft";

export type MeasurementSettingsEditorProps = {
  projectId: string;
  spec: Parameters<typeof previewRequest>[2];
  draft: MeasurementDraft;
  currentSnapshot: SettingsSnapshot;
  choices: MeasurementChoices;
  currentRateVersion: string | null;
  permissions: MeasurementPermissions;
  ports: MeasurementPorts;
  onBusyChange?: (busy: boolean) => void;
  onChange: (draft: MeasurementDraft) => void;
  onSaved: (value: SettingsSnapshot) => void;
  onStarted: (result: Awaited<ReturnType<MeasurementPorts["launch"]>>) => void;
  onRequestCurrent: () => void;
  onCancel: () => void;
  onFocusReturn: () => void;
  translate: MeasurementTranslator;
  now: () => Date;
  formatDate: (iso: string, timezone?: string) => string;
  formatCount: (count: number) => string;
};
