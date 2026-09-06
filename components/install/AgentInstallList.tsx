"use client";

import { CopyButton } from "@/components/ui";
import {
  CaretDownIcon as CaretDown,
  CaretUpIcon as CaretUp,
  CubeIcon as Cube,
  DotsThreeIcon as DotsThree,
  MonitorIcon as Monitor,
  TerminalIcon as Terminal,
} from "@phosphor-icons/react";
import { useState } from "react";
import { HighlightedInstallCode } from "./CommandHighlight";
import { AGENTS, type AgentInstall } from "./install-catalog";

type AgentInstallListProps = { mcpUrl: string };

function AgentIcon({ icon }: Readonly<Pick<AgentInstall, "icon">>) {
  const className = "shrink-0 text-fg-muted";

  if (icon === "cube") return <Cube aria-hidden className={className} size={16} weight="regular" />;
  if (icon === "monitor")
    return <Monitor aria-hidden className={className} size={16} weight="regular" />;
  if (icon === "dots-three")
    return <DotsThree aria-hidden className={className} size={16} weight="regular" />;
  return <Terminal aria-hidden className={className} size={16} weight="regular" />;
}

export function AgentInstallList({ mcpUrl }: Readonly<AgentInstallListProps>) {
  const [openId, setOpenId] = useState<AgentInstall["id"] | null>("claude-code");

  return (
    <div>
      {AGENTS.map((agent) => {
        const expanded = openId === agent.id;
        const command = agent.command(mcpUrl);
        const Caret = expanded ? CaretUp : CaretDown;
        const panelId = `install-agent-${agent.id}`;

        return (
          <div className="border-t border-border" key={agent.id}>
            <button
              aria-controls={panelId}
              aria-expanded={expanded}
              className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-0 py-[11px] text-left text-[13.5px] text-fg"
              onClick={() => setOpenId(expanded ? null : agent.id)}
              type="button"
            >
              <AgentIcon icon={agent.icon} />
              <span className="font-medium">{agent.label}</span>
              <span className="ml-auto font-sans text-[10.5px] text-fg-muted">{agent.hint}</span>
              <Caret aria-hidden className="shrink-0 text-fg-muted" size={12} weight="regular" />
            </button>
            <div
              aria-hidden={!expanded}
              className={`grid overflow-hidden transition-none motion-safe:[transition:grid-template-rows_.24s_cubic-bezier(.32,.72,0,1),opacity_.18s_ease] ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              id={panelId}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pb-3">
                  <div className="relative">
                    <pre
                      aria-hidden={!expanded}
                      className="m-0 whitespace-pre-wrap break-words rounded-[8px] bg-code-bg py-2.5 pl-3 pr-10 font-mono text-[11.5px] leading-[1.65] text-code-fg [word-break:break-word]"
                    >
                      <HighlightedInstallCode code={command} />
                    </pre>
                    {/* The button is a MUI IconButton, whose emotion styles beat a Tailwind
                        "absolute" on the same element - position this wrapper instead. */}
                    <span className="absolute right-[7px] top-[7px]">
                      <CopyButton
                        aria-hidden={!expanded}
                        className="!h-7 !min-h-7 !min-w-7 !w-7 !rounded-control !bg-transparent !p-0 text-code-faint"
                        label={expanded ? `Copy ${agent.label} command` : undefined}
                        tabIndex={expanded ? undefined : -1}
                        size="sm"
                        sx={{ color: "var(--code-faint)" }}
                        text={command}
                      />
                    </span>
                  </div>
                  <p className="m-0 mt-2 text-[11.5px] text-fg-muted">{agent.note}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
