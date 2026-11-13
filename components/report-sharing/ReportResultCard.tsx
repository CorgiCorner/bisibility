"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { privateReportCardView } from "@/lib/report-sharing/projection";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ReportCardDialog } from "./ReportCardDialog";
import { ReportCardPreview } from "./ReportCardPreview";

export function ReportResultCard({
  body,
  cardUrl,
  domain,
  faviconDomain,
  title,
}: Readonly<{
  body: ChallengeReportBody;
  cardUrl: string;
  domain: string;
  faviconDomain: string | null;
  title: string;
}>) {
  const t = useTranslations("challengeReport.share");
  const anchor = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  return (
    <Card className="grid w-full min-w-0 gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-ui-section">{t("card")}</h2>
        <Button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={t("cardActions")}
          className="w-9 min-w-0 shrink-0 p-0"
          onClick={() => setMenuOpen(!menuOpen)}
          ref={anchor}
          size="sm"
          variant="ghost"
        >
          <DotsThreeIcon aria-hidden size={21} weight="regular" />
        </Button>
        <Menu
          align="end"
          anchorEl={anchor.current}
          onClose={() => setMenuOpen(false)}
          open={menuOpen}
          restoreFocus={!sharing}
        >
          <MenuItem
            className="gap-2"
            onSelect={() => {
              setMenuOpen(false);
              setSharing(true);
            }}
          >
            <ShareNetworkIcon aria-hidden size={16} weight="regular" />
            {t("shareCard")}
          </MenuItem>
          <MenuItem
            className="gap-2"
            onSelect={() => {
              setMenuOpen(false);
              window.location.assign(`${cardUrl}?download=1`);
            }}
          >
            <DownloadSimpleIcon aria-hidden size={16} weight="regular" />
            {t("download")}
          </MenuItem>
        </Menu>
      </div>
      <ReportCardPreview
        domain={domain}
        faviconDomain={faviconDomain}
        title={title}
        view={privateReportCardView(body)}
      />
      {sharing ? (
        <ReportCardDialog
          body={body}
          cardUrl={cardUrl}
          domain={domain}
          faviconDomain={faviconDomain}
          onClose={() => {
            setSharing(false);
            requestAnimationFrame(() => anchor.current?.focus());
          }}
          title={title}
        />
      ) : null}
    </Card>
  );
}
