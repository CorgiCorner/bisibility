import "server-only";
import type { ImportedShadowEvidenceHandler } from "@/lib/metering/shadow-engine";

export const recordImportedShadowEvidence: ImportedShadowEvidenceHandler = async () => {
  throw new Error("Trusted imported shadow evidence is unavailable");
};
