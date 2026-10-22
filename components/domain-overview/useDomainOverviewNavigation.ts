"use client";

import type {
  DomainOverviewReport,
  DomainOverviewScope,
  DomainRecentTarget,
} from "@/lib/domain-overview/types";
import type { ResearchScope } from "@/lib/research/scope";
import { researchScopeKey } from "@/lib/research/scope";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { reportUrl } from "./domain-overview-workspace-model";

export function useDomainOverviewNavigation({
  projectRef,
  target,
  domainScope,
  researchScope,
  activeResearchScope,
  setTarget,
  setScope,
}: {
  projectRef: string;
  target: string;
  domainScope?: DomainOverviewScope;
  researchScope: ResearchScope | null;
  activeResearchScope: ResearchScope | null;
  setTarget: (target: string) => void;
  setScope: (scope: DomainOverviewScope | undefined) => void;
}) {
  const router = useRouter();
  function acceptReport(result: DomainOverviewReport) {
    setTarget(result.target);
    setScope(result.scope === "root" ? undefined : result.scope);
    if (activeResearchScope)
      window.history.replaceState(
        null,
        "",
        reportUrl({
          domainScope: result.scope,
          projectRef,
          researchScope: activeResearchScope,
          target: result.target,
        }),
      );
  }
  function openRecent(recent: DomainRecentTarget) {
    if (activeResearchScope)
      router.push(
        reportUrl({
          domainScope: recent.scope,
          projectRef,
          researchScope: activeResearchScope,
          target: recent.target,
        }),
      );
  }
  function changeResearchScope(next: ResearchScope) {
    if (researchScope && researchScopeKey(next) === researchScopeKey(researchScope)) return;
    const params = new URLSearchParams({ researchScope: researchScopeKey(next) });
    if (target.trim()) params.set("domain", target.trim());
    if (domainScope) params.set("scope", domainScope);
    router.push(`${appPath(projectRef, "domain-overview")}?${params.toString()}`);
  }
  return { acceptReport, openRecent, changeResearchScope };
}
