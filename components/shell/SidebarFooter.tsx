import { SidebarUserButton } from "@/components/shell/SidebarUserButton";
import type { ShellUser } from "@/components/shell/types";

export type { ShellUser };

export type SidebarFooterProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  showHostedLinks?: boolean;
  user?: ShellUser;
};

export function SidebarFooter({
  collapsed = false,
  onNavigate,
  showHostedLinks = false,
  user,
}: Readonly<SidebarFooterProps>) {
  return (
    <div className="mt-auto pt-2">
      <SidebarUserButton
        collapsed={collapsed}
        onNavigate={onNavigate}
        showHostedLinks={showHostedLinks}
        user={user}
      />
    </div>
  );
}
