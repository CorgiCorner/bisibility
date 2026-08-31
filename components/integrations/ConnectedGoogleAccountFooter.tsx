import { Button } from "@/components/ui";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react";

type ConnectedGoogleAccountFooterProps = {
  accountEmail?: string;
  disconnectDisabled?: boolean;
  layout?: "compact" | "standalone";
  onDisconnect: () => void;
  switchAccountHref: string;
};

export function ConnectedGoogleAccountFooter({
  accountEmail,
  disconnectDisabled = false,
  layout = "compact",
  onDisconnect,
  switchAccountHref,
}: Readonly<ConnectedGoogleAccountFooterProps>) {
  const standalone = layout === "standalone";
  return (
    <div
      className={
        standalone
          ? "flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border bg-bg-sunken px-5 py-3.5 sm:px-7"
          : "flex items-center justify-between gap-3 border-t border-border-soft pt-3"
      }
      data-slot="connected-google-account-footer"
    >
      <p
        className={`m-0 flex min-w-0 items-center gap-2 text-[11.5px] text-fg-muted${standalone ? "" : " flex-1"}`}
      >
        <UserCircle aria-hidden className="shrink-0" size={15} weight="regular" />
        <span className="min-w-0 truncate">{accountEmail ?? "Google account connected"}</span>
      </p>
      <div
        className={
          standalone
            ? "flex flex-wrap items-center gap-x-4 gap-y-1"
            : "ml-auto flex shrink-0 items-center gap-x-3.5"
        }
      >
        <Button
          className="px-0 hover:underline focus-visible:underline"
          href={switchAccountHref}
          size="xs"
          variant="ghost"
        >
          Reconnect account
        </Button>
        <Button
          className="px-0 hover:underline focus-visible:underline"
          disabled={disconnectDisabled}
          onClick={onDisconnect}
          size="xs"
          sx={{
            "&:hover": { color: "var(--red)" },
            "&.Mui-focusVisible": { color: "var(--red)" },
          }}
          type="button"
          variant="ghost"
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}
