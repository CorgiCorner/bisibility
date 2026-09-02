import type { PublicIdForPrefix } from "@/lib/db/public-id";

export type SetupStepId = "create_project" | "add_keywords" | "connect_source" | "first_check";

export type SetupCta = {
  id: "add_keywords" | "connect_source" | "create_project" | "run_first_check";
  label: string;
};

export type SetupStepState =
  | { family: "done" }
  // Settled like done. No current definition emits this; the competitors skip will.
  | { family: "skipped" }
  | { cta: SetupCta; family: "action" }
  | {
      accelerate?: SetupCta;
      family: "waiting";
      when: { nextRunAt: Date; timezone: string };
    }
  | { family: "running"; progress: { completed: number; total: number } }
  | { family: "blocked"; reason: string; unblockedBy: SetupStepId };

export type SetupContext = {
  completedCheckCount: number;
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
  title: string;
  videoRef: string;
  resolve(ctx: SetupContext): SetupStepState;
};

const done = (): SetupStepState => ({ family: "done" });
const action = (id: SetupCta["id"], label: string): SetupStepState => ({
  cta: { id, label },
  family: "action",
});

function resolveFirstCheck(ctx: SetupContext): SetupStepState {
  if (ctx.completedCheckCount > 0) return done();
  if (!ctx.providerExists) {
    return {
      family: "blocked",
      reason: "Needs a data source first",
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
      reason: "Needs keywords first",
      unblockedBy: "add_keywords",
    };
  }
  if (ctx.schedule.mode === "manual") return action("run_first_check", "Run first check");
  return {
    accelerate: { id: "run_first_check", label: "Run it now instead" },
    family: "waiting",
    when: { nextRunAt: ctx.schedule.nextRunAt, timezone: ctx.schedule.timezone },
  };
}

export const SETUP_STEP_DEFINITIONS = [
  {
    id: "create_project",
    resolve: (ctx) => (ctx.project.exists ? done() : action("create_project", "Create project")),
    title: "Create your project",
    videoRef: "create-project",
  },
  {
    id: "add_keywords",
    resolve: (ctx) => (ctx.keywordCount > 0 ? done() : action("add_keywords", "Add keywords")),
    title: "Track your first keywords",
    videoRef: "add-keywords",
  },
  {
    id: "connect_source",
    resolve: (ctx) =>
      ctx.providerExists ? done() : action("connect_source", "Connect data source"),
    title: "Connect a data source",
    videoRef: "connect-source",
  },
  {
    id: "first_check",
    resolve: resolveFirstCheck,
    title: "Run your first rank check",
    videoRef: "first-check",
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
