import {
  settingsContentColumnClassName,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import {
  type SettingsSectionId,
  settingsSectionGroups,
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
  withSearch?: boolean;
};

export function SettingsLoadingBar({ className }: Readonly<SettingsLoadingBarProps>) {
  return (
    <div
      className={cn("max-w-full motion-safe:animate-pulse rounded-control bg-bg-sunken", className)}
      data-settings-loading-bar=""
    />
  );
}

function SettingsLoadingMobileMenu({ withSearch }: Readonly<{ withSearch: boolean }>) {
  return (
    <div className="mb-5 lg:hidden" data-settings-loading-mobile-menu="">
      {withSearch ? <SettingsLoadingBar className="mb-3 h-8.5 w-full" /> : null}
      <SettingsLoadingBar className="h-8.5 w-full" />
    </div>
  );
}

function SettingsLoadingSubnav({
  activeSection,
  withSearch,
}: Readonly<{ activeSection: SettingsSectionId; withSearch: boolean }>) {
  return (
    <nav
      aria-hidden
      className="sticky top-6 hidden w-[200px] self-start flex-col gap-0.5 pl-3.5 lg:flex"
      data-settings-loading-active-section={activeSection}
      data-settings-loading-subnav=""
    >
      <div className="min-w-0">
        {withSearch ? <SettingsLoadingBar className="mb-3 h-8.5 w-full" /> : null}
        <div className="space-y-3">
          {settingsSectionGroups.map((group) => (
            <section key={group.id} data-settings-loading-group={group.id}>
              <div className="h-[19.5px] px-[11px] pb-1">
                <SettingsLoadingBar className="h-[15.5px] w-20" />
              </div>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {settingsSections
                  .filter((section) => group.sections.some((id) => id === section.id))
                  .map((section) => {
                    const current = section.id === activeSection;

                    return (
                      <li key={section.id}>
                        <div
                          className="relative flex h-10 items-center gap-2.5 rounded-control px-[11px]"
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
            </section>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function SettingsRouteLoading({
  activeSection,
  children,
  withSearch = true,
}: Readonly<SettingsRouteLoadingProps>) {
  return (
    <div
      aria-hidden
      aria-busy="true"
      className="mx-auto w-full max-w-[1040px]"
      data-settings-loading-boundary={activeSection}
      data-settings-route-loading=""
    >
      <div className={settingsShellGridClassName} data-settings-loading-grid="">
        <SettingsLoadingSubnav activeSection={activeSection} withSearch={withSearch} />
        <div className={settingsContentColumnClassName}>
          <SettingsLoadingMobileMenu withSearch={withSearch} />
          {children}
        </div>
      </div>
    </div>
  );
}
