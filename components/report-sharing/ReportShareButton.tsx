"use client";

import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import type { ReportShareSummary } from "@/lib/report-sharing/model";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ReportCardDialog } from "./ReportCardDialog";
import { ReportShareDialog } from "./ReportShareDialog";

export function ReportShareButton({
  canEdit,
  body,
  domain,
  faviconDomain,
  openCard,
  projectId,
  summary,
  title,
}: Readonly<{
  canEdit: boolean;
  body?: ChallengeReportBody;
  domain?: string;
  faviconDomain?: string | null;
  openCard?: boolean;
  projectId: string;
  summary: ReportShareSummary;
  title: string;
}>) {
  const router = useRouter();
  const t = useTranslations("challengeReport.share");
  const workspace = useTranslations("agentWorkspace");
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"report" | "card" | null>(openCard && body ? "card" : null);
  function open(value: "report" | "card") {
    setMenu(false);
    if (value === "card" && !body) {
      router.push(`${appPath(projectId, "agent-reports", summary.reportId)}?share=card`);
      return;
    }
    setDialog(value);
  }
  function closeDialog() {
    setDialog(null);
    requestAnimationFrame(() => anchor.current?.focus());
  }
  return (
    <>
      <Button
        aria-expanded={menu}
        aria-haspopup="menu"
        onClick={() => setMenu(!menu)}
        ref={anchor}
        size="sm"
        variant="secondary"
      >
        {workspace("share")}
      </Button>
      <Menu
        align="end"
        anchorEl={anchor.current}
        onClose={() => setMenu(false)}
        open={menu}
        restoreFocus={!dialog}
      >
        <MenuItem onSelect={() => open("report")}>{t("fullReport")}</MenuItem>
        <MenuItem onSelect={() => open("card")}>{t("card")}</MenuItem>
      </Menu>
      {dialog === "report" ? (
        <ReportShareDialog
          body={body}
          canEdit={canEdit}
          onClose={closeDialog}
          open
          projectId={projectId}
          summary={summary}
          title={title}
        />
      ) : dialog === "card" && body ? (
        <ReportCardDialog
          body={body}
          cardUrl={appPath(projectId, "agent-reports", summary.reportId, "card")}
          domain={domain ?? ""}
          faviconDomain={faviconDomain ?? null}
          onClose={closeDialog}
          title={title}
        />
      ) : null}
    </>
  );
}
