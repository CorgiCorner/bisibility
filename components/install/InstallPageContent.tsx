import { AgentInstallList } from "@/components/install/AgentInstallList";
import { curlExample, SKILLS } from "@/components/install/install-catalog";
import { CopyButton } from "@/components/ui";
import type { InstallApiKeySummary } from "@/lib/queries/install";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { HighlightedInstallCode } from "./CommandHighlight";

type InstallPageContentProps = {
  apiKey: InstallApiKeySummary | null;
  isCloudHosted: boolean;
  mcpUrl: string;
  origin: string;
  projectRef: string;
};

// CopyButton is a MUI IconButton: emotion injects its rules outside any cascade layer, so a
// Tailwind "absolute" on the button itself loses. Position a plain wrapper instead.
const codeCopyWrapperClassName = "absolute right-[7px] top-[7px]";
const codeCopyClassName =
  "!h-7 !min-h-7 !min-w-7 !w-7 !rounded-control !bg-transparent !p-0 text-code-faint";
const codeCopySx = { color: "var(--code-faint)" };

export function capitalizeFirst(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function CodeBlock({ label, text }: Readonly<{ label: string; text: string }>) {
  return (
    <div className="relative mt-3">
      <pre className="m-0 whitespace-pre-wrap break-words rounded-[8px] bg-code-bg py-2.5 pl-3 pr-10 font-mono text-[11.5px] leading-[1.65] text-code-fg [word-break:break-word]">
        <HighlightedInstallCode code={text} />
      </pre>
      <span className={codeCopyWrapperClassName}>
        <CopyButton
          className={codeCopyClassName}
          label={label}
          size="sm"
          sx={codeCopySx}
          text={text}
        />
      </span>
    </div>
  );
}

export function InstallPageContent({
  apiKey,
  isCloudHosted,
  mcpUrl,
  origin,
  projectRef,
}: Readonly<InstallPageContentProps>) {
  const curl = curlExample(origin);
  const apiKeyCreatedLabel = apiKey ? capitalizeFirst(apiKey.createdLabel) : null;

  return (
    <div className="max-w-[1000px]">
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-card border border-border bg-bg-elev px-5 py-[18px]">
          <h2 className="m-0 mb-0.5 text-[15px] font-semibold">AI agents</h2>
          <p className="m-0 mb-2 text-[12.5px] text-fg-muted">
            Pick your tool, copy one command, paste it in your terminal. That is the whole setup.
          </p>
          <AgentInstallList mcpUrl={mcpUrl} />
        </section>

        <div className="flex min-w-0 flex-col gap-3">
          <section className="rounded-card border border-border bg-bg-elev px-5 py-[18px]">
            <h2 className="m-0 mb-0.5 text-[15px] font-semibold">MCP endpoint</h2>
            <p className="m-0 mb-3 text-[12.5px] text-fg-muted">
              Using a tool that is not on the list? Paste this address into it and sign in with your
              bisibility account.
            </p>
            <div className="flex min-h-[42px] items-center gap-2.5 rounded-control border border-border-control bg-transparent pl-3 pr-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{mcpUrl}</span>
              <CopyButton
                className="ml-auto shrink-0 !h-8 !min-h-8 !min-w-8 !w-8 !rounded-control !p-0"
                label="Copy MCP URL"
                size="sm"
                text={mcpUrl}
              />
            </div>
            {isCloudHosted ? (
              <p className="m-0 mt-2 font-mono text-[10.5px] text-fg-muted">
                self-hosting? use your own address instead: &lt;your-instance&gt;/api/mcp
              </p>
            ) : null}
          </section>

          <section className="rounded-card border border-border bg-bg-elev px-5 py-[18px]">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="m-0 mb-0.5 text-[15px] font-semibold">API key</h2>
              {apiKey ? (
                <span className="ml-auto font-mono text-[10.5px] text-fg-muted">
                  scope: {apiKey.scopeLabel}
                </span>
              ) : null}
            </div>
            <p className="m-0 mb-3 text-[12.5px] text-fg-muted">
              Use this when something has to run without you, like a nightly script.
              {apiKeyCreatedLabel ? ` ${apiKeyCreatedLabel}.` : null}
            </p>
            {apiKey ? (
              <>
                <div className="flex min-h-[42px] items-center gap-1.5 rounded-control border border-border-control bg-transparent pl-3 pr-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                    {apiKey.maskedValue}
                  </span>
                </div>
                <Link
                  className="mt-2.5 inline-flex text-[12.5px] font-semibold text-accent-text no-underline hover:underline"
                  href={appPath(projectRef, "settings", "developers")}
                >
                  Manage in Settings, Developers
                </Link>
              </>
            ) : (
              <p className="m-0 text-[12.5px] text-fg-muted">
                No API key yet.{" "}
                <Link
                  className="text-accent-text no-underline hover:underline"
                  href={appPath(projectRef, "settings", "developers")}
                >
                  Create one in Settings, Developers.
                </Link>
              </p>
            )}
            <CodeBlock label="Copy curl example" text={curl} />
          </section>
        </div>
      </div>

      <section className="mb-3 rounded-card border border-border bg-bg-elev px-5 py-[18px]">
        <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
          <h2 className="m-0 text-[15px] font-semibold">Skills</h2>
          {/* nav-active is #EDEAE1, the exact value the design calls surface-hover; bg-sunken is
              a 30% alpha that composites to near-invisible on the card. */}
          <span className="ml-auto inline-flex items-center rounded-full bg-nav-active px-[9px] py-[3px] font-mono text-[10px] font-semibold text-yellow-text">
            planned
          </span>
        </div>
        <p className="m-0 mb-3 text-[12.5px] text-fg-muted">
          Ready-made SEO tasks your agent will be able to run for you. None are live yet, so this
          list is what is coming next.
        </p>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
          {SKILLS.map((skill) => (
            <div
              className="flex min-h-[44px] w-full flex-col gap-0.5 border-t border-border-soft px-2 py-[9px]"
              key={skill.name}
            >
              <span className="truncate font-mono text-[12px] font-semibold text-fg">
                {skill.name}
              </span>
              <span className="text-[11.5px] text-fg-muted">{skill.note}</span>
            </div>
          ))}
        </div>
        <p className="m-0 mt-3.5 font-mono text-[10.5px] text-fg-muted">
          the install command appears here once the first skill is ready
        </p>
      </section>
    </div>
  );
}
