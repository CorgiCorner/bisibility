import type {
  MeasurementQuote,
  MeasurementSelection,
  ScheduleDraft,
  SettingsSnapshot,
} from "./contracts";

export type MeasurementDraft = Readonly<{
  baseline: SettingsSnapshot;
  selection: MeasurementSelection;
  schedule: ScheduleDraft | null;
  quote: MeasurementQuote | null;
  acknowledgement: "manual" | "schedule" | "intent" | null;
}>;
