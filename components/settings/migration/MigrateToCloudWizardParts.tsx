import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/ui/cn";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/dist/csr/LockSimple";
import { useTranslations } from "next-intl";

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

export function EnableReadOnlyConfirmModal({
  busy,
  error,
  onClose,
  onConfirm,
  open,
}: Readonly<{
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}>) {
  const t = useTranslations("projectSettingsMigration.hold");
  return (
    <Modal
      footer={
        <>
          <button
            className="p-0 text-[13px] font-semibold text-fg-muted hover:text-fg disabled:bg-bg-sunken disabled:text-fg-muted"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            {t("enableKeep")}
          </button>
          <Button
            loading={busy}
            loadingLabel={t("enabling")}
            onClick={onConfirm}
            style={{ minHeight: 40 }}
            type="button"
            variant="primary"
          >
            {t("enableConfirm")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={t("enableTitle")}
    >
      <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">{t("enableBody")}</p>
      <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">{t("enableNote")}</p>
      {error ? (
        <p className="m-0 mt-3 font-sans tabular-nums text-[11.5px] text-red-text">{error}</p>
      ) : null}
    </Modal>
  );
}

export function MarkMigratedConfirmModal({
  busy,
  error,
  onClose,
  onConfirm,
  open,
}: Readonly<{
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}>) {
  const t = useTranslations("projectSettingsMigration.hold");
  return (
    <Modal
      footer={
        <>
          <button
            className="p-0 text-[13px] font-semibold text-fg-muted hover:text-fg disabled:bg-bg-sunken disabled:text-fg-muted"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            {t("notYet")}
          </button>
          <Button
            loading={busy}
            loadingLabel={t("marking")}
            onClick={onConfirm}
            style={{ minHeight: 40 }}
            type="button"
            variant="primary"
          >
            {t("mark")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={t("migratedTitle")}
    >
      <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">{t("migratedBody")}</p>
      <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">{t("migratedNote")}</p>
      {error ? (
        <p className="m-0 mt-3 font-sans tabular-nums text-[11.5px] text-red-text">{error}</p>
      ) : null}
    </Modal>
  );
}

export function CancelMigrationConfirmModal({
  busy,
  error,
  mode = "cancel",
  onClose,
  onConfirm,
  onKeepReadOnly,
  open,
}: Readonly<{
  busy?: boolean;
  error?: string | null;
  mode?: "cancel" | "close";
  onClose: () => void;
  onConfirm: () => void;
  onKeepReadOnly?: () => void;
  open: boolean;
}>) {
  const closeMode = mode === "close";
  const t = useTranslations("projectSettingsMigration.hold");
  return (
    <Modal
      footer={
        closeMode ? (
          <>
            <button
              className="p-0 text-[13px] font-semibold text-red-text hover:opacity-80 disabled:bg-bg-sunken disabled:text-fg-muted"
              disabled={busy}
              onClick={onConfirm}
              type="button"
            >
              {busy ? t("cancelling") : t("cancelAndResume")}
            </button>
            <Button
              disabled={busy}
              onClick={onKeepReadOnly ?? onClose}
              style={{ minHeight: 40 }}
              type="button"
              variant="primary"
            >
              {t("keepReadOnlyClose")}
            </Button>
          </>
        ) : (
          <>
            <button
              className="p-0 text-[13px] font-semibold text-fg-muted hover:text-fg disabled:bg-bg-sunken disabled:text-fg-muted"
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              {t("keepMigrating")}
            </button>
            <Button
              loading={busy}
              loadingLabel={t("cancelling")}
              onClick={onConfirm}
              style={{ minHeight: 40 }}
              type="button"
              variant="destructive"
            >
              {t("cancel")}
            </Button>
          </>
        )
      }
      onClose={onClose}
      open={open}
      title={closeMode ? t("progressTitle") : t("cancelTitle")}
    >
      <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">
        {closeMode ? t("progressBody") : t("cancelBody")}
      </p>
      <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">{t("autoRelease")}</p>
      {error ? (
        <p className="m-0 mt-3 font-sans tabular-nums text-[11.5px] text-red-text">{error}</p>
      ) : null}
    </Modal>
  );
}
