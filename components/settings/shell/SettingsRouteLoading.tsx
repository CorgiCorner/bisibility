import {
  settingsContentColumnClassName,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import {
  type SettingsSectionId,
  settingsSections,
} from "@/components/settings/shell/settings-sections";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

type SettingsLoadingBarProps = {
  className?: string;
};

type SettingsRouteLoadingProps = {
  activeSection: SettingsSectionId;
  children: ReactNode;
};

export function SettingsLoadingBar({ className }: Readonly<SettingsLoadingBarProps>) {
  return (
    <div
      className={cn("animate-pulse rounded-[6px] bg-bg-sunken", className)}
      data-settings-loading-bar=""
    />
  );
}

function SettingsLoadingMobileMenu() {
  return (
    <div className="mb-5 lg:hidden" data-settings-loading-mobile-menu="">
      <SettingsLoadingBar className="h-8.5 w-full" />
    </div>
  );
}

function SettingsLoadingSubnav({ activeSection }: Readonly<{ activeSection: SettingsSectionId }>) {
  return (
    <nav
      aria-hidden
      className="sticky top-6 hidden w-[200px] self-start flex-col gap-0.5 pl-3.5 lg:flex"
      data-settings-loading-active-section={activeSection}
      data-settings-loading-subnav=""
    >
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {settingsSections.map((section) => {
          const current = section.id === activeSection;

          return (
            <li key={section.id}>
              <div
                className="relative flex h-10 items-center gap-2.5 rounded-[9px] px-[11px]"
                data-settings-loading-subnav-active={current ? "true" : "false"}
                data-settings-loading-subnav-row={section.id}
              >
                {current ? (
                  <span
                    className="absolute -left-2.5 h-1.5 w-1.5 rounded-full bg-accent-solid"
                    data-settings-loading-subnav-active-dot=""
                  />
                ) : null}
                <span
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center"
                  data-settings-loading-subnav-icon-slot={section.id}
                >
                  <SettingsLoadingBar className="h-4 w-4" />
                </span>
                <SettingsLoadingBar className="h-3 w-20" />
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsRouteLoading({
  activeSection,
  children,
}: Readonly<SettingsRouteLoadingProps>) {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-[1040px]"
      data-settings-loading-boundary={activeSection}
      data-settings-route-loading=""
    >
      <SettingsLoadingMobileMenu />
      <div className={settingsShellGridClassName} data-settings-loading-grid="">
        <SettingsLoadingSubnav activeSection={activeSection} />
        <div className={settingsContentColumnClassName}>{children}</div>
      </div>
    </div>
  );
}
