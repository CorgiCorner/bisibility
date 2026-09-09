"use client";

import { handleShellKeyDown } from "@/components/shell/command-keyboard";
import {
  type CommandGroup,
  type CommandItem,
  commandGroups,
  filterGroups,
  type PaletteMarket,
} from "@/components/shell/command-palette-groups";
import {
  CommandRegistryProvider,
  useRegisteredCommands,
} from "@/components/shell/command-registry";
import { useKeywordSearch } from "@/components/shell/use-keyword-search";
import { Tooltip } from "@/components/ui/Tooltip";
import { navContextFromPathname } from "@/lib/nav/nav-items";
import type { ExperimentalModuleKey } from "@/lib/settings/experimental-modules";
import { applyTheme } from "@/lib/theme/browser-theme";
import { CursorIcon as Cursor } from "@phosphor-icons/react/dist/csr/Cursor";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type CommandPaletteContextValue = {
  closePalette: () => void;
  openPalette: () => void;
  togglePalette: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  closePalette: () => undefined,
  openPalette: () => undefined,
  togglePalette: () => undefined,
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

type CommandPaletteTriggerProps = {
  variant?: "header" | "sidebar";
};

export function CommandPaletteTrigger({ variant }: Readonly<CommandPaletteTriggerProps>) {
  const { openPalette } = useCommandPalette();
  const className =
    variant === "sidebar"
      ? "grid h-[30px] w-[30px] flex-none place-items-center rounded-control p-0 text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:-outline-offset-2"
      : variant === "header"
        ? "grid h-9 w-9 flex-none place-items-center rounded-control border-0 bg-transparent p-0 text-fg-muted shadow-none transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
        : "grid h-8 w-8 flex-none place-items-center rounded-control border border-border-control bg-bg-elev text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid";

  return (
    <Tooltip content="Search (⌘K)">
      <button aria-label="Search" className={className} onClick={openPalette} type="button">
        <MagnifyingGlass aria-hidden size={17} weight="regular" />
      </button>
    </Tooltip>
  );
}

export type CommandPaletteProviderProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  enabledExperimentalModules?: readonly ExperimentalModuleKey[];
  /** The project's markets, resolved on the server. A project with none gets no Markets group. */
  markets?: readonly PaletteMarket[];
  projectId: string;
  projectRef: string;
};

const NO_MARKETS: readonly PaletteMarket[] = [];

export function CommandPaletteProvider({
  children,
  defaultOpen = false,
  enabledExperimentalModules = [],
  markets = NO_MARKETS,
  projectId,
  projectRef,
}: Readonly<CommandPaletteProviderProps>) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  const openPalette = useCallback(() => {
    setQuery("");
    setOpen(true);
  }, []);

  const togglePalette = useCallback(() => {
    setOpen((isOpen) => !isOpen);
  }, []);
  const contextValue = useMemo(
    () => ({ closePalette, openPalette, togglePalette }),
    [closePalette, openPalette, togglePalette],
  );

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      <CommandRegistryProvider>
        <div
          className="contents"
          onKeyDownCapture={(event) =>
            handleShellKeyDown(event, { closePalette, paletteOpen: open, togglePalette })
          }
        >
          {children}
          <CommandPalette
            markets={markets}
            enabledExperimentalModules={enabledExperimentalModules}
            onClose={closePalette}
            open={open}
            projectId={projectId}
            projectRef={projectRef}
            query={query}
            setQuery={setQuery}
          />
        </div>
      </CommandRegistryProvider>
    </CommandPaletteContext.Provider>
  );
}

type CommandPaletteProps = {
  markets: readonly PaletteMarket[];
  enabledExperimentalModules: readonly ExperimentalModuleKey[];
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectRef: string;
  query: string;
  setQuery: (query: string) => void;
};

function CommandPalette({
  markets,
  enabledExperimentalModules,
  open,
  onClose,
  projectId,
  projectRef,
  query,
  setQuery,
}: Readonly<CommandPaletteProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const { keywordHits, search } = useKeywordSearch(projectId);
  const registeredCommands = useRegisteredCommands();

  const contextual: CommandGroup[] =
    registeredCommands.length > 0
      ? [
          {
            title: "On this page",
            items: registeredCommands.map((cmd) => ({
              id: cmd.id,
              icon: Cursor,
              label: cmd.label,
              hint: cmd.hint,
              run: cmd.run,
            })),
          },
        ]
      : [];

  const groups = filterGroups(
    [
      ...contextual,
      ...commandGroups(
        projectRef,
        router.push,
        applyTheme,
        keywordHits,
        markets,
        navContextFromPathname(pathname),
        enabledExperimentalModules,
      ),
    ],
    query,
  ).filter((group) => group.items.length > 0);
  const hasResults = groups.length > 0;

  function handleQueryChange(value: string) {
    setQuery(value);
    search(value);
  }

  async function runItem(item: CommandItem) {
    onClose();
    await item.run();
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-90 flex items-start justify-center px-3 pb-3 pt-14 sm:px-6 sm:pb-6 sm:pt-20">
      <button
        aria-label="Close command palette"
        aria-hidden
        className="absolute inset-0 touch-none overscroll-none bg-[rgba(20,16,8,.42)]"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <dialog
        aria-label="Command palette"
        className="relative m-0 flex max-h-[calc(100dvh-4.5rem)] w-full max-w-[600px] flex-col overflow-hidden rounded-card border border-border bg-bg-elev p-0 text-fg sm:max-h-[70vh]"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        open
      >
        <div className="border-b border-border p-3">
          <div className="flex min-h-[46px] items-center gap-[11px] rounded-control border border-border-control bg-transparent px-3 transition-colors focus-within:border-accent">
            <MagnifyingGlass
              aria-hidden
              className="flex-none text-accent-text"
              size={18}
              weight="regular"
            />
            <input
              className="min-w-0 flex-1 bg-transparent py-2 text-[16px] font-medium text-fg outline-none placeholder:text-[12px] placeholder:leading-4 focus-visible:outline-none sm:text-[15px]"
              data-cmdk-input
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search keywords, views and actions…"
              ref={(node) => node?.focus()}
              value={query}
            />
            <span className="hidden flex-none rounded-control border border-border bg-bg-elev px-[7px] py-0.5 text-[10.5px] uppercase text-fg-muted sm:inline-flex">
              esc
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="px-2.5 pb-1 pt-2 text-[9.5px] uppercase tracking-[0.6px] text-fg-muted">
                {group.title}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon ?? Cursor;
                return (
                  <button
                    className="flex w-full items-center gap-3 rounded-control px-[11px] py-[9px] text-left text-fg outline-none hover:bg-bg-sunken focus-visible:bg-bg-sunken"
                    key={item.id ?? `${group.title}-${item.label}`}
                    onClick={() => void runItem(item)}
                    type="button"
                  >
                    <Icon
                      aria-hidden
                      className="flex-none text-fg-muted"
                      size={16}
                      weight="regular"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {item.label}
                    </span>
                    <span className="flex-none text-[10.5px] text-fg-muted">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {hasResults ? null : (
            <div className="flex flex-col items-center gap-[7px] px-4 py-[34px] text-fg-muted">
              <MagnifyingGlass aria-hidden size={20} weight="regular" />
              <span className="text-[13px]">No matches</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3.5 border-t border-border px-4 py-[9px] text-[10.5px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-control bg-bg-sunken px-[5px] py-px">↵</span>open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-control bg-bg-sunken px-[5px] py-px">esc</span>close
          </span>
        </div>
      </dialog>
    </div>
  );
}
