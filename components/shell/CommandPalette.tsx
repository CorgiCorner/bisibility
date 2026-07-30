"use client";

import { handleShellKeyDown } from "@/components/shell/command-keyboard";
import {
  type CommandItem,
  commandGroups,
  filterGroups,
} from "@/components/shell/command-palette-groups";
import { KeywordCommandActionBridge } from "@/components/shell/keyword-command-actions";
import { useKeywordSearch } from "@/components/shell/use-keyword-search";
import { useColorScheme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
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

export function CommandPaletteTrigger() {
  const { openPalette } = useCommandPalette();

  return (
    <Tooltip title="Search (⌘K)">
      <button
        aria-label="Search"
        className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] border border-border-strong bg-bg-elev text-fg-muted outline-none transition-colors hover:border-accent focus-visible:border-accent"
        onClick={openPalette}
        type="button"
      >
        <MagnifyingGlass aria-hidden size={17} />
      </button>
    </Tooltip>
  );
}

export type CommandPaletteProviderProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  projectId: string;
  projectRef: string;
};

export function CommandPaletteProvider({
  children,
  defaultOpen = false,
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
      <div
        className="contents"
        onKeyDownCapture={(event) =>
          handleShellKeyDown(event, { closePalette, paletteOpen: open, togglePalette })
        }
      >
        {children}
        <CommandPalette
          onClose={closePalette}
          open={open}
          projectId={projectId}
          projectRef={projectRef}
          query={query}
          setQuery={setQuery}
        />
        <KeywordCommandActionBridge projectRef={projectRef} />
      </div>
    </CommandPaletteContext.Provider>
  );
}

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectRef: string;
  query: string;
  setQuery: (query: string) => void;
};

function CommandPalette({
  open,
  onClose,
  projectId,
  projectRef,
  query,
  setQuery,
}: Readonly<CommandPaletteProps>) {
  const router = useRouter();
  const { setMode } = useColorScheme();
  const { keywordHits, search } = useKeywordSearch(projectId);
  const groups = filterGroups(
    commandGroups(projectRef, router.push, setMode, keywordHits),
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
        className="relative m-0 flex max-h-[calc(100dvh-4.5rem)] w-full max-w-[600px] flex-col overflow-hidden rounded-[15px] border border-border-strong bg-bg-elev p-0 text-fg sm:max-h-[70vh]"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        open
      >
        <div className="border-b border-border p-3">
          <div className="flex min-h-[46px] items-center gap-[11px] rounded-[11px] border border-border-strong bg-bg-sunken px-3 transition-colors focus-within:border-accent">
            <MagnifyingGlass
              aria-hidden
              className="flex-none text-accent"
              size={18}
              weight="bold"
            />
            <input
              className="min-w-0 flex-1 bg-transparent py-2 text-[16px] font-medium text-fg outline-none focus-visible:outline-none sm:text-[15px]"
              data-cmdk-input
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search keywords, views and actions…"
              ref={(node) => node?.focus()}
              value={query}
            />
            <span className="hidden flex-none rounded-md border border-border bg-bg-elev px-[7px] py-0.5 font-mono text-[10.5px] uppercase text-fg-faint sm:inline-flex">
              esc
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="px-2.5 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-fg-faint">
                {group.title}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className="flex w-full items-center gap-3 rounded-[9px] px-[11px] py-[9px] text-left text-fg outline-none hover:bg-nav-active focus-visible:bg-nav-active"
                    key={`${group.title}-${item.label}`}
                    onClick={() => void runItem(item)}
                    type="button"
                  >
                    <Icon aria-hidden className="flex-none text-fg-muted" size={16} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {item.label}
                    </span>
                    <span className="flex-none font-mono text-[10.5px] text-fg-faint">
                      {item.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {hasResults ? null : (
            <div className="flex flex-col items-center gap-[7px] px-4 py-[34px] text-fg-faint">
              <MagnifyingGlass aria-hidden size={20} />
              <span className="text-[13px]">No matches</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3.5 border-t border-border px-4 py-[9px] font-mono text-[10.5px] text-fg-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-[5px] bg-bg-sunken px-[5px] py-px">↵</span>open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-[5px] bg-bg-sunken px-[5px] py-px">esc</span>close
          </span>
        </div>
      </dialog>
    </div>
  );
}
