import { capturedObservationSelect } from "@/lib/observation/select";

export const keywordCheckSelect = {
  checkedAt: true,
  degradedToCountry: true,
  errorCode: true,
  expectedUrlAtCheck: true,
  id: true,
  normalizationVersion: true,
  observationRun: { select: capturedObservationSelect },
  position: true,
  provider: true,
  previousPosition: true,
  requestedDepth: true,
  rankingUrl: true,
  status: true,
} as const;
