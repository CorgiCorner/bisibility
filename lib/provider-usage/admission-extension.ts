import "server-only";
import type { OwnAdmissionPort } from "@/lib/provider-usage/admission-extension-types";

export const ownAdmission: OwnAdmissionPort = {
  reserve: async () => [],
  fence: async () => {},
  acknowledge: async () => false,
  cancel: async () => {},
  owns: async () => false,
  assertRetrieval: async () => false,
  recover: async () => {},
};
export type {
  OwnAttemptGrant,
  OwnAttemptInput,
} from "@/lib/provider-usage/admission-extension-types";
