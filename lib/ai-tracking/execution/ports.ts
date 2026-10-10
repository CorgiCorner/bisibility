import type {
  CostReceipt,
  DispatchState,
  PersistTrackingResultInput,
  SamplePlan,
} from "@/lib/ai-tracking/contract";
import type { TrackingEnvelope } from "@/lib/ai-tracking/providers/envelope";
import type { ProviderUsageObserver } from "@/lib/providers/usage";

export { TrackingDispatchDeniedError } from "@/lib/ai-tracking/providers/dispatch-error";

export type ExecutableSample = {
  plan: SamplePlan;
  dispatch: DispatchState;
  providerTaskId: string | null;
  receipt: CostReceipt | null;
  cancelled: boolean;
  nextPollAt?: string | null;
};
export type TrackingExecutionPorts = {
  load(projectId: string, sampleId: string): Promise<ExecutableSample | null>;
  claim(plan: SamplePlan): Promise<boolean>;
  transition(
    plan: SamplePlan,
    expected: DispatchState,
    next: DispatchState,
    taskId?: string,
    receipt?: CostReceipt,
  ): Promise<boolean>;
  prepare(
    plan: SamplePlan,
  ): Promise<{ observer: ProviderUsageObserver; submit(): Promise<TrackingEnvelope> }>;
  collect(plan: SamplePlan, taskId: string): Promise<TrackingEnvelope>;
  deferPoll?(plan: SamplePlan): Promise<void>;
  settle(plan: SamplePlan, receipt: CostReceipt, failed: boolean, taskId?: string): Promise<void>;
  persist(plan: SamplePlan, input: PersistTrackingResultInput): Promise<boolean>;
};
