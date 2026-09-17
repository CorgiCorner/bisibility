import type { PublicIdForPrefix } from "@/lib/db/public-id";
import type { SetupVideoRef } from "@/lib/getting-started/video-manifest";

export type SetupStepId =
  | "create_project"
  | "add_keywords"
  | "connect_source"
  | "first_check"
  | "confirm_competitors";

export type CompetitorSuggestionEvidence = {
  kind?: "competitor" | "other" | "platform";
  nonBrandSeenOn?: number;
  bestPosition: number;
  domain: string;
  of: number;
  seenOn: number;
};

export type SetupCta = {
  id: "add_keywords" | "connect_source" | "create_project" | "run_first_check";
};

export type SetupStepState =
  | { family: "done" }
  | { family: "skipped" }
  | { family: "ready" }
  | { cta: SetupCta; family: "action" }
  | {
      accelerate?: SetupCta;
      family: "waiting";
      when: { nextRunAt: Date; timezone: string };
    }
  | { family: "running"; progress: { completed: number; total: number } }
  | {
      family: "blocked";
      reason: "needs_data_source" | "needs_first_check" | "needs_keywords";
      unblockedBy: SetupStepId;
    };

export type SetupContext = {
  completedCheckCount: number;
  competitorSetupOutcome: "confirmed" | "skipped" | null;
  competitorSuggestions: CompetitorSuggestionEvidence[];
  inFlightBatch: {
    completed: number;
    rankCheckIds: PublicIdForPrefix<"check">[];
    total: number;
  } | null;
  keywordCount: number;
  keywordIds: PublicIdForPrefix<"kw">[];
  project: {
    exists: boolean;
    name: string | null;
    publicRef: PublicIdForPrefix<"prj"> | null;
  };
  providerExists: boolean;
  schedule: { mode: "manual" } | { mode: "scheduled"; nextRunAt: Date; timezone: string };
};

export type StepDefinition = {
  id: SetupStepId;
  videoRef: SetupVideoRef;
  resolve(ctx: SetupContext): SetupStepState;
};

const done = (): SetupStepState => ({ family: "done" });
const action = (id: SetupCta["id"]): SetupStepState => ({
  cta: { id },
  family: "action",
});

function resolveFirstCheck(ctx: SetupContext): SetupStepState {
  if (ctx.completedCheckCount > 0) return done();
  if (!ctx.providerExists) {
    return {
      family: "blocked",
      reason: "needs_data_source",
      unblockedBy: "connect_source",
    };
  }
  if (ctx.inFlightBatch) {
    return {
      family: "running",
      progress: { completed: ctx.inFlightBatch.completed, total: ctx.inFlightBatch.total },
    };
  }
  if (ctx.keywordCount === 0) {
    return {
      family: "blocked",
      reason: "needs_keywords",
      unblockedBy: "add_keywords",
    };
  }
  if (ctx.schedule.mode === "manual") return action("run_first_check");
  return {
    accelerate: { id: "run_first_check" },
    family: "waiting",
    when: { nextRunAt: ctx.schedule.nextRunAt, timezone: ctx.schedule.timezone },
  };
}

function resolveCompetitorConfirmation(ctx: SetupContext): SetupStepState {
  if (ctx.completedCheckCount === 0) {
    return {
      family: "blocked",
      reason: "needs_first_check",
      unblockedBy: "first_check",
    };
  }
  if (ctx.competitorSetupOutcome === "confirmed") return done();
  if (ctx.competitorSetupOutcome === "skipped") return { family: "skipped" };
  return { family: "ready" };
}

export const SETUP_STEP_DEFINITIONS = [
  {
    id: "create_project",
    resolve: (ctx) => (ctx.project.exists ? done() : action("create_project")),
    videoRef: "create-project",
  },
  {
    id: "connect_source",
    resolve: (ctx) => (ctx.providerExists ? done() : action("connect_source")),
    videoRef: "connect-source",
  },
  {
    id: "add_keywords",
    resolve: (ctx) => (ctx.keywordCount > 0 ? done() : action("add_keywords")),
    videoRef: "add-keywords",
  },
  {
    id: "first_check",
    resolve: resolveFirstCheck,
    videoRef: "first-check",
  },
  {
    id: "confirm_competitors",
    resolve: resolveCompetitorConfirmation,
    videoRef: "confirm-competitors",
  },
] as const satisfies readonly StepDefinition[];

export type ResolvedSetupStep = {
  definition: StepDefinition;
  state: SetupStepState;
};

export function isStepSettled(state: SetupStepState): boolean {
  return state.family === "done" || state.family === "skipped";
}

export function isSetupComplete(steps: readonly Pick<ResolvedSetupStep, "state">[]): boolean {
  return steps.length > 0 && steps.every(({ state }) => isStepSettled(state));
}

export function resolveSetupProgress(ctx: SetupContext) {
  const steps = SETUP_STEP_DEFINITIONS.map((definition) => ({
    definition,
    state: definition.resolve(ctx),
  }));
  return {
    completed: isSetupComplete(steps),
    doneCount: steps.filter(({ state }) => state.family === "done").length,
    settledCount: steps.filter(({ state }) => isStepSettled(state)).length,
    steps,
    totalCount: steps.length,
  };
}
