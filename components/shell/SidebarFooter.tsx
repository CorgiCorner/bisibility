export type { ShellUser } from "@/components/shell/types";

import type { ShellUser } from "@/components/shell/types";

export type SidebarFooterProps = {
  collapsed?: boolean;
  /** Kept so callers do not have to change; the account control now lives in AppHeader. */
  onNavigate?: () => void;
  showHostedLinks?: boolean;
  user?: ShellUser;
  version?: string;
};

export function SidebarFooter({ collapsed = false, version }: Readonly<SidebarFooterProps>) {
  if (!version) {
    return null;
  }

  return (
    // The version shows in both rail states: it is the one line that tells a self-hosted
    // operator what they are running, and hiding it collapsed hid it from the default state.
    // Collapsed it centres in the 80px rail and drops a step in size rather than disappearing.
    // h-4 with a matching leading, not an auto-height line: the two states use different font
    // sizes, so an auto line box made this block ~2px shorter collapsed - and because the
    // utility group above is pinned with mt-auto, that difference pushed the whole second
    // section up the moment the rail was toggled.
    <div className="flex-none pt-2">
      <p
        className={`m-0 flex h-4 items-center font-mono leading-4 text-fg-muted ${
          collapsed ? "justify-center text-[9px]" : "justify-end pr-1 text-[10px]"
        }`}
      >
        v{version}
      </p>
    </div>
  );
}
