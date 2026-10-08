"use client";

import { AgentInstallList } from "@/components/install/AgentInstallList";
import { curlExample, SKILLS } from "@/components/install/install-catalog";
import { CopyButton } from "@/components/ui/CopyButton";
import type { InstallApiKeySummary } from "@/lib/queries/install";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ChatGptIconDownload } from "./ChatGptIconDownload";
import { HighlightedInstallCode } from "./CommandHighlight";
import { InstallGettingStarted } from "./InstallGettingStarted";

type InstallPageContentProps = {
  apiKey: InstallApiKeySummary | null;
  hasKeywordAndCheck: boolean;
  isCloudHosted: boolean;
  mcpToolCounts: Readonly<{ readOnly: number; total: number }>;
  mcpUrl: string;
  origin: string;
  projectRef: string;
};

// Position the copy control independently of its inline tooltip wrapper.
const codeCopyWrapperClassName = "absolute right-[7px] top-[7px]";
const codeCopyClassName =
  "!h-7 !min-h-7 !min-w-7 !w-7 !rounded-control !bg-transparent !p-0 text-code-faint";
const codeCopyStyle = { "--control-color": "var(--code-faint)" };

function scopeMessageKey(scope: NonNullable<InstallApiKeySummary>["scope"]) {
  if (scope === "read") return "apiKey.scopeRead";
  if (scope === "write") return "apiKey.scopeWrite";
  return "apiKey.scopeAdmin";
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
          style={codeCopyStyle}
          text={text}
        />
      </span>
    </div>
  );
}

export function InstallPageContent({
  apiKey,
  hasKeywordAndCheck,
  isCloudHosted,
  mcpToolCounts,
  mcpUrl,
  origin,
  projectRef,
}: Readonly<InstallPageContentProps>) {
  const format = useFormatter();
  const t = useTranslations("projectInstall");
  const curl = curlExample(origin);
  const apiKeyCreated = apiKey
    ? t("apiKey.created", {
        date: format.dateTime(apiKey.createdAt, { dateStyle: "medium" }),
      })
    : "none";

  return (
    <div className="max-w-[1000px]">
      <ChatGptIconDownload origin={origin} />
      <InstallGettingStarted hasKeywordAndCheck={hasKeywordAndCheck} mcpUrl={mcpUrl} />
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-card border border-border bg-bg-elev px-5 py-[18px]">
          <h2 className="m-0 mb-0.5 text-[15px] font-semibold">{t("agents.heading")}</h2>
          <p className="m-0 mb-2 text-[12.5px] text-fg-muted">{t("agents.description")}</p>
          <AgentInstallList mcpUrl={mcpUrl} />
        </section>

        <div className="flex min-w-0 flex-col gap-3">
          <section className="rounded-card border border-border bg-bg-elev px-5 py-[18px]">
            <h2 className="m-0 mb-0.5 text-[15px] font-semibold">{t("endpoint.heading")}</h2>
            <p className="m-0 mb-3 text-[12.5px] text-fg-muted">{t("endpoint.description")}</p>
            <div className="flex min-h-[42px] items-center gap-2.5 rounded-control border border-border-control bg-transparent pl-3 pr-1.5">
              <span className="min-w-0 flex-1 truncate font-sans text-[12.5px]">{mcpUrl}</span>
              <CopyButton
                className="ml-auto shrink-0 !h-8 !min-h-8 !min-w-8 !w-8 !rounded-control !p-0"
                label={t("endpoint.copy")}
                size="sm"
                text={mcpUrl}
              />
            </div>
            <p className="m-0 mt-2 text-[12.5px] text-fg-muted">
              {t("endpoint.toolScope", {
                readOnly: String(mcpToolCounts.readOnly),
                total: String(mcpToolCounts.total),
              })}
            </p>
            {isCloudHosted ? (
              <p className="m-0 mt-2 font-sans text-[10.5px] text-fg-muted">
                {t("endpoint.selfHosted")}
              </p>
            ) : null}
          </section>

          <section className="rounded-card border border-border bg-bg-elev px-5 py-[18px]">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="m-0 mb-0.5 text-[15px] font-semibold">{t("apiKey.heading")}</h2>
              {apiKey ? (
                <span className="ml-auto font-sans text-[10.5px] text-fg-muted">
                  {t("apiKey.scope", { scope: t(scopeMessageKey(apiKey.scope)) })}
                </span>
              ) : null}
            </div>
            <p className="m-0 mb-3 text-[12.5px] text-fg-muted">
              {t("apiKey.description", { created: apiKeyCreated })}
            </p>
            {apiKey ? (
              <>
                <div className="flex min-h-[42px] items-center gap-1.5 rounded-control border border-border-control bg-transparent pl-3 pr-1.5">
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px]">
                    {apiKey.maskedValue}
                  </span>
                </div>
                <Link
                  className="mt-2.5 inline-flex text-[12.5px] font-semibold text-accent-text no-underline hover:underline"
                  href={appPath(projectRef, "settings", "developers")}
                >
                  {t("apiKey.manage")}
                </Link>
              </>
            ) : (
              <p className="m-0 text-[12.5px] text-fg-muted">{t("apiKey.none")}</p>
            )}
            <CodeBlock label={t("apiKey.copyCurl")} text={curl} />
          </section>
        </div>
      </div>

      <section className="mb-3 rounded-card border border-border bg-bg-elev px-5 py-[18px]">
        <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
          <h2 className="m-0 text-[15px] font-semibold">{t("skills.heading")}</h2>
          {/* nav-active is #EDEAE1, the exact value the design calls surface-hover; bg-sunken is
              a 30% alpha that composites to near-invisible on the card. */}
          <span className="ml-auto inline-flex items-center rounded-full bg-nav-active px-[9px] py-[3px] font-sans text-[10px] font-semibold text-yellow-text">
            {t("skills.availableCount")}
          </span>
        </div>
        <p className="m-0 mb-3 text-[12.5px] text-fg-muted">{t("skills.description")}</p>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
          {SKILLS.map((skill) => (
            <div
              className="flex min-h-[44px] w-full flex-col gap-0.5 border-t border-border px-2 py-[9px]"
              key={skill.name}
            >
              {skill.archivePath ? (
                <a
                  className="truncate font-sans text-[12px] font-semibold text-accent-text underline"
                  href={skill.archivePath}
                  download
                >
                  {skill.name}
                </a>
              ) : (
                <span className="truncate font-sans text-[12px] font-semibold text-fg">
                  {skill.name}
                </span>
              )}
              <span className="text-[11.5px] text-fg-muted">{t(`skills.${skill.name}`)}</span>
              <span className="text-[10.5px] text-fg-muted">
                {t(skill.archivePath ? "skills.available" : "skills.planned")}
              </span>
            </div>
          ))}
        </div>
        <p className="m-0 mt-3.5 font-sans text-[10.5px] text-fg-muted">{t("skills.footer")}</p>
      </section>
    </div>
  );
}
