import { AGENTS, SKILLS } from "@/components/install/install-catalog";
import { PageContent } from "@/components/shell/PageContent";
import { isCloud } from "@/lib/deployment/deployment";
import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

function Bar({ className, ...props }: Readonly<ComponentPropsWithoutRef<"div">>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} {...props} />;
}

// Derived from the catalogue the settled page renders, so a row added there cannot leave
// the skeleton a row short.
const agentRows = AGENTS.map((agent) => agent.id);
const skillRows = SKILLS.map((skill) => skill.name);

const cardClassName = "rounded-card border border-border bg-bg-elev px-5 py-[18px]";

export default function InstallLoading() {
  return (
    <PageContent aria-hidden>
      <div className="max-w-[1000px]">
        <Bar className="mb-[22px] h-5 w-full max-w-[720px]" />

        <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className={cardClassName}>
            <Bar className="mb-0.5 h-4 w-[88px]" />
            <Bar className="mb-2 h-3.5 w-full max-w-[390px]" />
            <div>
              {agentRows.map((row, index) => (
                <div className="border-t border-border" data-agent-row key={row}>
                  <div className="flex min-h-[44px] items-center gap-2.5 py-[11px]">
                    <Bar className="h-4 w-4 shrink-0" />
                    <Bar className="h-3.5 w-[110px]" />
                    <Bar className="ml-auto h-2.5 w-[42px]" />
                    <Bar className="h-3 w-3" />
                  </div>
                  {index === 0 ? (
                    <div className="pb-3">
                      <div className="rounded-[8px] bg-code-bg p-[10px_40px_10px_12px]">
                        <Bar className="h-[38px] w-full bg-bg-sunken" />
                      </div>
                      <Bar className="mt-2 h-3 w-[250px]" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-3">
            <section className={cardClassName}>
              <Bar className="mb-0.5 h-4 w-[120px]" />
              <Bar className="mb-3 h-3.5 w-full max-w-[420px]" />
              <div className="flex h-[42px] items-center rounded-control border border-border px-3">
                <Bar className="h-3 w-full" />
              </div>
              {isCloud ? <Bar className="mt-2 h-2.5 w-[310px]" data-self-host-hint /> : null}
            </section>

            <section className={cardClassName}>
              <div className="mb-0.5 flex items-baseline gap-2.5">
                <Bar className="h-4 w-[64px]" />
                <Bar className="ml-auto h-2.5 w-[98px]" />
              </div>
              <Bar className="mb-3 h-3.5 w-full max-w-[400px]" />
              <div className="flex h-[42px] items-center rounded-control border border-border px-3">
                <Bar className="h-3 w-[180px]" />
              </div>
              <Bar className="mt-2.5 min-h-9 w-[220px] rounded-control border border-border-control" />
              <div className="mt-3 rounded-[8px] bg-code-bg p-[10px_40px_10px_12px]">
                <Bar className="h-[38px] w-full bg-bg-sunken" />
              </div>
            </section>
          </div>
        </div>

        <section className={`${cardClassName} mb-3`}>
          <div className="mb-1 flex items-baseline gap-2.5">
            <Bar className="h-4 w-[54px]" />
            <Bar className="ml-auto h-5 w-[56px] rounded-full" />
          </div>
          <Bar className="mb-3 h-3.5 w-full max-w-[690px]" />
          <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
            {skillRows.map((row) => (
              <div
                className="flex min-h-[44px] flex-col gap-0.5 border-t border-border px-2 py-[9px]"
                data-skill-row
                key={row}
              >
                <Bar className="h-3 w-[130px]" />
                <Bar className="h-2.5 w-[170px]" />
              </div>
            ))}
          </div>
          <Bar className="mt-3.5 h-2.5 w-[330px]" />
        </section>
      </div>
    </PageContent>
  );
}
