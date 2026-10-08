import type { ComponentProps, ReactNode } from "react";
import type {
  ConnectedProviderMap,
  OnboardingSerpProviderId,
  ProviderTestResultMap,
} from "./StepConnectProvider.fields";
import { StepConnectProviderCards } from "./StepConnectProviderCards";
import { StepConnectProviderCredentials } from "./StepConnectProviderCredentials";
import { StepConnectProviderView } from "./StepConnectProviderView";

type Props = {
  actionError: string | null;
  analyticsNotice?: ReactNode;
  analyticsOption?: ReactNode;
  busy: boolean;
  connections: ConnectedProviderMap;
  currentTestResult: ComponentProps<typeof StepConnectProviderCredentials>["testResult"];
  dirtyProviders: Partial<Record<OnboardingSerpProviderId, boolean>>;
  errors: ComponentProps<typeof StepConnectProviderCredentials>["errors"];
  mode: "modal" | "step";
  onCredentialChange: () => void;
  onDataSourceConnected?: () => void;
  onSave: () => void;
  onSelect: (providerId: OnboardingSerpProviderId) => void;
  onTest: () => void;
  providerError: string | undefined;
  providerId: OnboardingSerpProviderId;
  providerLabel: string;
  projectId?: string;
  register: ComponentProps<typeof StepConnectProviderCredentials>["register"];
  saveDisabled: boolean;
  selectedProviderId: OnboardingSerpProviderId;
  testDisabled: boolean;
  testing: boolean;
  testResults: ProviderTestResultMap;
};

export function StepConnectProviderContent({
  actionError,
  analyticsNotice,
  analyticsOption,
  busy,
  connections,
  currentTestResult,
  dirtyProviders,
  errors,
  mode,
  onCredentialChange,
  onDataSourceConnected,
  onSave,
  onSelect,
  onTest,
  providerError,
  providerId,
  providerLabel,
  projectId,
  register,
  saveDisabled,
  selectedProviderId,
  testDisabled,
  testing,
  testResults,
}: Readonly<Props>) {
  return (
    <StepConnectProviderView
      actionError={actionError}
      analyticsNotice={analyticsNotice}
      analyticsOption={analyticsOption}
      cards={
        <StepConnectProviderCards
          connections={connections}
          dirtyProviders={dirtyProviders}
          onSelect={onSelect}
          selectedProviderId={selectedProviderId}
          testResults={testResults}
        />
      }
      credentials={
        <StepConnectProviderCredentials
          busy={busy}
          errors={errors}
          onCredentialChange={onCredentialChange}
          onSave={onSave}
          onTest={onTest}
          providerId={providerId}
          providerLabel={providerLabel}
          register={register}
          saveDisabled={saveDisabled}
          savedConnection={Boolean(connections[providerId]) && !dirtyProviders[providerId]}
          showSave={mode === "step"}
          testDisabled={testDisabled}
          testResult={currentTestResult}
          testing={testing}
        />
      }
      hidden={
        <>
          <input type="hidden" {...register("projectId")} />
          <input type="hidden" {...register("providerId")} />
        </>
      }
      onDataSourceConnected={onDataSourceConnected}
      providerError={providerError}
      projectId={projectId}
      showHeading={mode === "step"}
    />
  );
}
