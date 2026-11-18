"use client";

import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useRegisterCommands } from "@/components/shell/command-registry";
import { useOptionalSidebarCollapsed } from "@/components/shell/SidebarCollapsedState";
import { Tooltip } from "@/components/ui/Tooltip";
import { ASSISTANT_RESERVE_PX, assistantDockQuery } from "@/lib/assistant/dock";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useRef, useState } from "react";

type Context = {
  open: boolean;
  show: () => void;
  toggle: () => void;
  close: () => void;
  trigger: React.RefObject<HTMLButtonElement | null>;
};
const AssistantContext = createContext<Context | null>(null);
export function AssistantProvider({
  children,
  project,
}: Readonly<{ children: ReactNode; project: string }>) {
  const [open, setOpen] = useState(false);
  const [client] = useState(() => new QueryClient());
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <AssistantContext.Provider
      value={{ open, show: () => setOpen(true), toggle: () => setOpen((v) => !v), close, trigger }}
    >
      <QueryClientProvider client={client}>
        {children}
        <AssistantPanel close={close} open={open} project={project} />
      </QueryClientProvider>
    </AssistantContext.Provider>
  );
}
export function AssistantContentReserve({ children }: Readonly<{ children: ReactNode }>) {
  const context = useContext(AssistantContext);
  const collapsed = useOptionalSidebarCollapsed()?.collapsed ?? false;
  const docked = useMediaQuery(assistantDockQuery(collapsed));
  const reserve = Boolean(context?.open) && docked;
  // Docked: the page keeps the panel width plus the 12px inset on each side of the floating panel.
  return (
    <div
      className="flex min-w-0 flex-col"
      data-assistant-reserve={reserve || undefined}
      style={reserve ? { paddingRight: ASSISTANT_RESERVE_PX } : undefined}
    >
      {children}
    </div>
  );
}
export function AssistantTrigger() {
  const context = useContext(AssistantContext);
  const t = useTranslations("assistant");
  const register = useRegisterCommands([
    {
      id: "ask-assistant",
      scope: "assistant",
      label: t("ask"),
      hint: "",
      run: () => context?.show(),
    },
  ]);
  if (!context) return null;
  return (
    <span ref={register}>
      <Tooltip content={t("title")}>
        <button
          aria-expanded={context.open}
          aria-label={t("title")}
          className="grid h-11 w-11 place-items-center rounded-control text-fg-muted hover:bg-bg-sunken hover:text-fg"
          onClick={context.toggle}
          ref={context.trigger}
          type="button"
        >
          <ChatCircleDotsIcon aria-hidden size={19} weight="regular" />
        </button>
      </Tooltip>
    </span>
  );
}
