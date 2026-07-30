import type { CreateIngestHookInput, MutateIngestHookInput } from "@/lib/schemas/ingestHook";

export type DeployHookData = {
  createdLabel: string;
  disabled: boolean;
  id: string;
  label: string;
  lastUsedLabel: string;
};

export type IssuedDeployHook = {
  id: string;
  label: string;
  maskedValue: string;
  raw: string;
};

export type CreateDeployHookAction = (input: CreateIngestHookInput) => Promise<IssuedDeployHook>;
export type MutateDeployHookAction = (input: MutateIngestHookInput) => Promise<unknown>;
export type RotateDeployHookAction = (input: MutateIngestHookInput) => Promise<IssuedDeployHook>;
export type SendDeployHookTestResult = {
  signalHref: string;
  signalId: string;
};
export type SendDeployHookTestAction = (
  input: MutateIngestHookInput,
) => Promise<SendDeployHookTestResult>;
