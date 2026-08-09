"use client";

import { PackageTransferPanel } from "@/components/cloud/PackageTransferPanel";
import { Checkbox, SegmentedControl, type SegmentedControlOption } from "@/components/ui";
import type { MigrationImportCompletion } from "@/lib/migration/result";
import { appRootPath } from "@/lib/routing/app-path";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
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

const modeOptions = [
  { hint: "Direct", label: "Push", value: "push" },
  { hint: "Manual", label: "Download", value: "download" },
] satisfies SegmentedControlOption<MigrationMode>[];

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
  const targetLabel = direction === "to-cloud" ? "hosted instance" : "self-host";

  function handleModeChange(nextMode: MigrationMode) {
    setMode(nextMode);
    onDownloadConfirmedChange(false);
  }

  return (
    <>
      <StepHeading
        body={`Choose a direct push or move the project package manually through the ${targetLabel} import page.`}
        title={`Transfer to ${targetLabel}`}
      />
      <SegmentedControl
        ariaLabel="Transfer mode"
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
  const rawToken = form.watch("token")?.trim() || null;
  const transfer = useChunkedTransfer();
  const targetLabel = direction === "to-cloud" ? "hosted instance" : "self-host";

  if (!projectId) {
    return <InfoBox>A project is required before a package can be transferred.</InfoBox>;
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
      <StepLabel index={2} title="Paste the migration token here" />
      <form className="mt-2 flex flex-col gap-3">
        <label className="flex flex-col gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {"Migration token "}
          <input
            className="min-h-11 rounded-[9px] border border-accent bg-transparent px-[13px] font-mono text-[13px] font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
            placeholder="mig_************"
            {...form.register("token")}
          />
        </label>
        {form.formState.errors.token ? (
          <div className="text-[11.5px] font-medium text-red-text">
            {form.formState.errors.token.message}
          </div>
        ) : null}
      </form>
      <StepLabel index={3} title="Transfer the package" />
      <PackageTransferPanel
        exportPackageAction={exportActiveCloudImportPackage}
        missingTokenMessage={`Paste the ${targetLabel}-issued migration token before transferring.`}
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
        Destination preflight runs during transfer before import starts. REST import endpoint:{" "}
        <code className="font-mono text-fg">{handoff?.apiImportUrl ?? "/api/cloud/import"}</code>
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
  const canConfirm = exported;
  const targetLabel = direction === "to-cloud" ? "hosted instance" : "self-host";
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
      <StepLabel index={2} title="Export the project package" />
      {projectId ? (
        <ExportPackageCard
          onExportSuccess={onExportSuccess}
          projectId={projectId}
          successMessage="Package exported and downloaded. Upload it on the destination instance."
        />
      ) : (
        <InfoBox>A project is required before a package can be exported.</InfoBox>
      )}
      <StepLabel index={3} title="Upload it on the destination" />
      <div className="mt-2 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
        <a
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent-text"
          href={handoff?.cloudImportUrl ?? importUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open destination import page
          <CaretRight aria-hidden size={13} weight="bold" />
        </a>
        <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">
          Upload the downloaded project package there and paste the migration token from step 1 when
          asked. The destination validates the token, schema, package counts and target
          compatibility before import.
        </p>
      </div>
      <Checkbox
        checked={confirmed}
        containerClassName="mt-4 rounded-[11px] border border-border bg-bg px-3.5 py-3"
        description={
          canConfirm
            ? "Confirm only after the destination import page accepts the uploaded package."
            : "Export the project package before confirming the manual upload."
        }
        disabled={!canConfirm}
        label="I uploaded the package; await confirmation on the destination"
        onChange={(event) => onConfirmedChange(event.currentTarget.checked)}
      />
      <InfoBox>
        Manual transfer cannot verify the remote import from this source. The final screen will
        remain awaiting external confirmation until you verify the destination separately.
      </InfoBox>
    </>
  );
}
