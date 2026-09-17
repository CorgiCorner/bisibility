"use client";

import { PackageTransferPanel } from "@/components/cloud/PackageTransferPanel";
import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import type { MigrationImportCompletion } from "@/lib/migration/result";
import { appRootPath } from "@/lib/routing/app-path";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { useTranslations } from "next-intl";
import { ExportPackageCard, exportActiveCloudImportPackage } from "./MigrateToCloudExportPackage";
import { HandoffPanel } from "./MigrateToCloudHandoff";
import { InfoBox, StepHeading, StepLabel, TokenSourceStep } from "./MigrateToCloudTransferParts";
import type {
  CloudMigrationHandoff,
  MigrationDirection,
  MigrationMode,
  MigrationTokenFormApi,
} from "./MigrateToCloudWizard.types";
import { useChunkedTransfer } from "./useChunkedTransfer";

type TransferStepProps = {
  direction: MigrationDirection;
  downloadConfirmed: boolean;
  exported: boolean;
  form: MigrationTokenFormApi;
  handoff: CloudMigrationHandoff | null;
  mode: MigrationMode;
  onDownloadConfirmedChange: (confirmed: boolean) => void;
  onExportSuccess: () => void;
  onHandoff: (handoff: CloudMigrationHandoff) => void;
  onTransferEnd: () => Promise<void>;
  onTransferStart: () => Promise<boolean>;
  onTransferSuccess: (completion: MigrationImportCompletion) => void;
  projectId?: string;
  setMode: (mode: MigrationMode) => void;
  targetOrigin?: string;
};

export function TransferStep({
  direction,
  downloadConfirmed,
  exported,
  form,
  handoff,
  mode,
  onDownloadConfirmedChange,
  onExportSuccess,
  onHandoff,
  onTransferEnd,
  onTransferStart,
  onTransferSuccess,
  projectId,
  setMode,
  targetOrigin,
}: Readonly<TransferStepProps>) {
  const t = useTranslations("projectSettingsMigration.transfer");
  const targetLabel = direction === "to-cloud" ? t("target.hosted") : t("target.selfHost");
  const modeOptions = [
    { hint: t("pushHint"), label: t("push"), value: "push" },
    { hint: t("downloadHint"), label: t("download"), value: "download" },
  ] satisfies SegmentedControlOption<MigrationMode>[];

  function handleModeChange(nextMode: MigrationMode) {
    setMode(nextMode);
    onDownloadConfirmedChange(false);
  }

  return (
    <>
      <StepHeading
        body={t("body", { target: targetLabel })}
        title={t("title", { target: targetLabel })}
      />
      <SegmentedControl
        ariaLabel={t("mode")}
        className="mt-4"
        onChange={handleModeChange}
        options={modeOptions}
        value={mode}
      />
      {mode === "push" ? (
        <PushTransferPanel
          form={form}
          handoff={handoff}
          direction={direction}
          onExportSuccess={onExportSuccess}
          onHandoff={onHandoff}
          onTransferEnd={onTransferEnd}
          onTransferStart={onTransferStart}
          onTransferSuccess={onTransferSuccess}
          projectId={projectId}
          targetOrigin={targetOrigin}
        />
      ) : (
        <DownloadTransferPanel
          confirmed={downloadConfirmed}
          direction={direction}
          exported={exported}
          handoff={handoff}
          onConfirmedChange={onDownloadConfirmedChange}
          onExportSuccess={onExportSuccess}
          onHandoff={onHandoff}
          projectId={projectId}
          targetOrigin={targetOrigin}
        />
      )}
    </>
  );
}

function PushTransferPanel({
  form,
  handoff,
  direction,
  onExportSuccess,
  onHandoff,
  onTransferEnd,
  onTransferStart,
  onTransferSuccess,
  projectId,
  targetOrigin,
}: Readonly<
  Pick<
    TransferStepProps,
    | "direction"
    | "form"
    | "handoff"
    | "onExportSuccess"
    | "onHandoff"
    | "onTransferEnd"
    | "onTransferStart"
    | "onTransferSuccess"
    | "projectId"
    | "targetOrigin"
  >
>) {
  const t = useTranslations("projectSettingsMigration.transfer");
  const rawToken = form.watch("token")?.trim() || null;
  const transfer = useChunkedTransfer();
  const targetLabel = direction === "to-cloud" ? t("target.hosted") : t("target.selfHost");

  if (!projectId) {
    return <InfoBox>{t("projectRequiredTransfer")}</InfoBox>;
  }

  return (
    <>
      <TokenSourceStep step={1} targetLabel={targetLabel}>
        <HandoffPanel
          direction={direction}
          handoff={handoff}
          onHandoff={onHandoff}
          projectId={projectId}
          targetOrigin={targetOrigin}
        />
      </TokenSourceStep>
      <StepLabel index={2} title={t("pasteToken")} />
      <form className="mt-2 flex flex-col gap-3">
        <label className="flex flex-col gap-[7px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {t("token")}{" "}
          <input
            className="min-h-11 rounded-control border border-accent bg-transparent px-[13px] font-sans tabular-nums text-[13px] font-medium text-fg placeholder:text-[12px] placeholder:leading-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
            placeholder={t("tokenPlaceholder")}
            {...form.register("token")}
          />
        </label>
        {form.formState.errors.token ? (
          <div className="text-[11.5px] font-medium text-red-text">
            {form.formState.errors.token.message}
          </div>
        ) : null}
      </form>
      <StepLabel index={3} title={t("transferPackage")} />
      <PackageTransferPanel
        exportPackageAction={exportActiveCloudImportPackage}
        missingTokenMessage={t("missingToken", { target: targetLabel })}
        onExportSuccess={onExportSuccess}
        onStatusRefresh={async () => null}
        onTransferEnd={onTransferEnd}
        onTransferStart={onTransferStart}
        onTransferSuccess={onTransferSuccess}
        packageSource="server"
        progress={transfer.progress}
        projectId={projectId}
        rawToken={rawToken}
        serverTransferAction={(input) => transfer.runChunkedTransfer({ ...input, targetOrigin })}
      />
      <InfoBox icon="terminal">
        {t("preflight")}{" "}
        <code className="font-sans tabular-nums text-fg">
          {handoff?.apiImportUrl ?? "/api/v1/cloud/import"}
        </code>
      </InfoBox>
    </>
  );
}

function DownloadTransferPanel({
  confirmed,
  direction,
  exported,
  handoff,
  onConfirmedChange,
  onExportSuccess,
  onHandoff,
  projectId,
  targetOrigin,
}: Pick<
  TransferStepProps,
  "direction" | "handoff" | "onExportSuccess" | "onHandoff" | "projectId"
> & {
  confirmed: boolean;
  exported: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  targetOrigin?: string;
}) {
  const t = useTranslations("projectSettingsMigration.transfer");
  const canConfirm = exported;
  const targetLabel = direction === "to-cloud" ? t("target.hosted") : t("target.selfHost");
  const importUrl = targetOrigin
    ? new URL(appRootPath(), targetOrigin).toString()
    : "https://bisibility.com/cloud/import?ctx=onboard";

  return (
    <>
      <TokenSourceStep step={1} targetLabel={targetLabel}>
        <HandoffPanel
          direction={direction}
          handoff={handoff}
          onHandoff={onHandoff}
          projectId={projectId}
          targetOrigin={targetOrigin}
        />
      </TokenSourceStep>
      <StepLabel index={2} title={t("exportPackage")} />
      {projectId ? (
        <ExportPackageCard
          onExportSuccess={onExportSuccess}
          projectId={projectId}
          successMessage={t("exportedSuccess")}
        />
      ) : (
        <InfoBox>{t("projectRequiredExport")}</InfoBox>
      )}
      <StepLabel index={3} title={t("uploadDestination")} />
      <div className="mt-2 rounded-control border border-border bg-bg-sunken px-3.5 py-3">
        <a
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent-text"
          href={handoff?.cloudImportUrl ?? importUrl}
          rel="noreferrer"
          target="_blank"
        >
          {t("openDestination")}
          <CaretRight aria-hidden size={13} weight="regular" />
        </a>
        <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">{t("uploadDescription")}</p>
      </div>
      <Checkbox
        checked={confirmed}
        containerClassName="mt-4 rounded-control border border-border bg-bg px-3.5 py-3"
        description={canConfirm ? t("confirmReady") : t("confirmPending")}
        disabled={!canConfirm}
        label={t("confirmLabel")}
        onChange={(event) => onConfirmedChange(event.currentTarget.checked)}
      />
      <InfoBox>{t("manualNote")}</InfoBox>
    </>
  );
}
