import { Button, Modal } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react";

const steps = ["Check", "Transfer", "Done"] as const;

export function MigrateStepper({ step }: Readonly<{ step: number }>) {
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
                  "grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] font-mono text-[11px] font-semibold",
                  active
                    ? "border-accent bg-accent-solid text-primary-contrast"
                    : "border-border-strong text-fg-muted",
                )}
              >
                {number}
              </span>
              <span className={cn("text-[10px] font-semibold", labelClass)}>{label}</span>
            </span>
            {number < steps.length ? (
              <span
                className={cn(
                  "mb-5 h-0.5 flex-1 rounded-sm",
                  step > number ? "bg-accent" : "bg-border-strong",
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
  return (
    <div className="mt-3.5 flex items-center gap-2 rounded-[9px] border border-yellow bg-yellow/10 px-[13px] py-[9px] text-xs font-medium text-yellow-text">
      <LockSimple aria-hidden className="flex-none" size={15} weight="fill" />
      <span className="min-w-0 flex-1">
        Read-only mode is on. Writes and rank checks stay paused while this migration is in
        progress. It releases only when you cancel the migration, or automatically after 24 hours of
        inactivity.
      </span>
      {onCancelMigration ? (
        <button
          className="flex-none rounded-md border border-yellow/40 bg-bg-elev px-2 py-1 font-semibold text-yellow-text disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
          disabled={pending}
          onClick={onCancelMigration}
          type="button"
        >
          Cancel migration
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
            Keep writes active
          </button>
          <Button
            loading={busy}
            loadingLabel="Enabling read-only..."
            onClick={onConfirm}
            sx={{ minHeight: 40 }}
            type="button"
            variant="primary"
          >
            Pause writes and continue
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Pause writes and rank checks?"
    >
      <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">
        Continuing puts this project into read-only mode for everyone. Writes and scheduled rank
        checks are paused so the data cannot change while it transfers.
      </p>
      <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">
        Read-only mode stays on until you cancel the migration - it cannot be switched off from the
        next steps. If nothing happens for 24 hours it releases automatically.
      </p>
      {error ? <p className="m-0 mt-3 font-mono text-[11.5px] text-red-text">{error}</p> : null}
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
            Not yet
          </button>
          <Button
            loading={busy}
            loadingLabel="Marking..."
            onClick={onConfirm}
            sx={{ minHeight: 40 }}
            type="button"
            variant="primary"
          >
            Mark as migrated
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Mark this project as migrated?"
    >
      <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">
        This disables the source project for good: writes and rank checks stay off and the state
        does not auto-release. Do this once you've verified the destination project.
      </p>
      <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">
        You can reactivate the project later from Settings if you ever need it again.
      </p>
      {error ? <p className="m-0 mt-3 font-mono text-[11.5px] text-red-text">{error}</p> : null}
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
              {busy ? "Cancelling..." : "Cancel migration and resume writes"}
            </button>
            <Button
              disabled={busy}
              onClick={onKeepReadOnly ?? onClose}
              sx={{ minHeight: 40 }}
              type="button"
              variant="primary"
            >
              Keep read-only and close
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
              Keep migrating
            </button>
            <Button
              loading={busy}
              loadingLabel="Cancelling..."
              onClick={onConfirm}
              sx={{ minHeight: 40 }}
              type="button"
              variant="destructive"
            >
              Cancel migration
            </Button>
          </>
        )
      }
      onClose={onClose}
      open={open}
      title={closeMode ? "Migration in progress" : "Cancel this migration?"}
    >
      <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">
        {closeMode
          ? "This project stays read-only while the migration is in progress. You can close this window and come back later - or cancel the migration to resume writes."
          : "This releases the migration hold and resumes writes and rank checks on this project. If any data already reached the destination, the two instances will drift apart from this point."}
      </p>
      <p className="m-0 mt-2 text-xs leading-5 text-fg-muted">
        Migration holds also auto-release after 24 hours of inactivity.
      </p>
      {error ? <p className="m-0 mt-3 font-mono text-[11.5px] text-red-text">{error}</p> : null}
    </Modal>
  );
}
