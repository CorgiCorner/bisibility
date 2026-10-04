import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/execution-extension", () => ({}));
vi.mock("@/lib/providers/rate-limit", () => ({}));
vi.mock("@/lib/providers/serp/dataforseo", () => ({}));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({}));

import { deploymentEstimate } from "@/lib/provider-lookups/paid-call-deployment";
import { modelAdmissionBound } from "./cost";
import { PROMPT_MODELS } from "./schema";

describe("hosted AI admission precision", () => {
  it.each(PROMPT_MODELS)(
    "serializes the conservative %s bound without financial truncation",
    (model) => {
      expect(() => deploymentEstimate(modelAdmissionBound(model), 4)).not.toThrow();
    },
  );
});
