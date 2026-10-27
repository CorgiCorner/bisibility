import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/ui/cn";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/dist/csr/LockSimple";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function MigrateStepper({ step }: Readonly<{ step: number }>) {
  const t = useTranslations("projectSettingsMigration.wizard.step");
  const steps = [t("check"), t("transfer"), t("done")];
  return (
    <div className="flex items-center">
      {steps.map((label, index) => {
        const number = index + 1;
        const active = step >= number;
        const current = step === number;
        let labelClass = "text-fg-muted";
        if (current) labelClass = "text-accent-text";
        else if (active) labelClass = "text-fg";
        return (
          <div className="flex min-w-0 flex-1 items-center" key={label}>
            <span className="flex w-[58px] flex-none flex-col items-center gap-1.5">
              <span
                className={cn(
                  "grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] font-sans tabular-nums text-[11px] font-semibold",
                  active
                    ? "border-accent bg-accent-solid text-accent-on-solid"
                    : "border-border text-fg-muted",
                )}
              >
                {number}
              </span>
              <span className={cn("text-[10px] font-semibold", labelClass)}>{label}</span>
            </span>
            {number < steps.length ? (
              <span
                className={cn(
                  "mb-5 h-0.5 flex-1 rounded-control",
                  step > number ? "bg-accent" : "bg-border",
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ReadOnlyBanner({
  onCancelMigration,
  pending,
}: Readonly<{
  onCancelMigration?: () => void;
  pending?: boolean;
}>) {
  const t = useTranslations("projectSettingsMigration.hold");
  return (
    <div className="mt-3.5 flex items-center gap-2 rounded-control border border-yellow bg-yellow/10 px-[13px] py-[9px] text-xs font-medium text-yellow-text">
      <LockSimple aria-hidden className="flex-none" size={15} weight="regular" />
      <span className="min-w-0 flex-1">{t("banner")}</span>
      {onCancelMigration ? (
        <button
          className="flex-none rounded-control border border-yellow/40 bg-bg-elev px-2 py-1 font-semibold text-yellow-text disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
          disabled={pending}
          onClick={onCancelMigration}
          type="button"
        >
          {t("cancel")}
        </button>
      ) : null}
    </div>
  );
}

type MigrationConfirmationProps = Readonly<{
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}>;

type MigrationConfirmationCopy = {
  title: string;
  body: string;
  note: string;
} & (
  | { footer: ReactNode }
  | {
      keepLabel: string;
      loadingLabel: string;
      confirmLabel: string;
      variant: "primary" | "destructive";
    }
);

function renderMigrationConfirmation(
  { busy, error, onClose, onConfirm, open }: MigrationConfirmationProps,
  copy: MigrationConfirmationCopy,
) {
  return (
    <Modal
      footer={
        "footer" in copy ? (
          copy.footer
        ) : (
          <>
            <button
              className="p-0 text-[13px] font-semibold text-fg-muted hover:text-fg disabled:bg-bg-sunken disabled:text-fg-muted"
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              {copy.keepLabel}
            </button>
            <Button
              loading={busy}
              loadingLabel={copy.loadingLabel}
              onClick={onConfirm}
              style={{ minHeight: 40 }}
              type="button"
              variant={copy.variant}
            >
              {copy.confirmLabel}
            </Button>
          </>
        )
      }
      onClose={onClose}
      open={open}
      title={copy.title}
    >
      <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">{copy.body}</p>
      <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">{copy.note}</p>
      {error ? (
        <p className="m-0 mt-3 font-sans tabular-nums text-[11.5px] text-red-text">{error}</p>
      ) : null}
    </Modal>
  );
}

export function EnableReadOnlyConfirmModal(props: MigrationConfirmationProps) {
  const t = useTranslations("projectSettingsMigration.hold");
  return renderMigrationConfirmation(props, {
    keepLabel: t("enableKeep"),
    loadingLabel: t("enabling"),
    confirmLabel: t("enableConfirm"),
    variant: "primary",
    title: t("enableTitle"),
    body: t("enableBody"),
    note: t("enableNote"),
  });
}

export function MarkMigratedConfirmModal(props: MigrationConfirmationProps) {
  const t = useTranslations("projectSettingsMigration.hold");
  return renderMigrationConfirmation(props, {
    keepLabel: t("notYet"),
    loadingLabel: t("marking"),
    confirmLabel: t("mark"),
    variant: "primary",
    title: t("migratedTitle"),
    body: t("migratedBody"),
    note: t("migratedNote"),
  });
}

export function CancelMigrationConfirmModal({
  mode = "cancel",
  onKeepReadOnly,
  ...props
}: MigrationConfirmationProps &
  Readonly<{
    mode?: "cancel" | "close";
    onKeepReadOnly?: () => void;
  }>) {
  const closeMode = mode === "close";
  const t = useTranslations("projectSettingsMigration.hold");
  return renderMigrationConfirmation(props, {
    ...(closeMode
      ? {
          footer: (
            <>
              <button
                className="p-0 text-[13px] font-semibold text-red-text hover:opacity-80 disabled:bg-bg-sunken disabled:text-fg-muted"
                disabled={props.busy}
                onClick={props.onConfirm}
                type="button"
              >
                {props.busy ? t("cancelling") : t("cancelAndResume")}
              </button>
              <Button
                disabled={props.busy}
                onClick={onKeepReadOnly ?? props.onClose}
                style={{ minHeight: 40 }}
                type="button"
                variant="primary"
              >
                {t("keepReadOnlyClose")}
              </Button>
            </>
          ),
        }
      : {
          keepLabel: t("keepMigrating"),
          loadingLabel: t("cancelling"),
          confirmLabel: t("cancel"),
          variant: "destructive" as const,
        }),
    title: closeMode ? t("progressTitle") : t("cancelTitle"),
    body: closeMode ? t("progressBody") : t("cancelBody"),
    note: t("autoRelease"),
  });
}
