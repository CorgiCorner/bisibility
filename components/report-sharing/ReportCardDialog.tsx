"use client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/toast-context";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { CHALLENGE_TILE_IDS, type ChallengeTileId } from "@/lib/challenge-report/tile-state";
import { privateReportCardView } from "@/lib/report-sharing/projection";
import { DEFAULT_VISIBLE_TILES } from "@/lib/report-sharing/settings";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ReportCardPreview } from "./ReportCardPreview";

export function ReportCardDialog({
  body,
  cardUrl,
  domain,
  faviconDomain,
  onClose,
  title,
}: Readonly<{
  body: ChallengeReportBody;
  cardUrl: string;
  domain: string;
  faviconDomain: string | null;
  onClose: () => void;
  title: string;
}>) {
  const t = useTranslations("challengeReport");
  const { showToast } = useToast();
  const [sharing, setSharing] = useState(false);
  const available = CHALLENGE_TILE_IDS.filter((id) => body.tiles[id].state === "ok");
  const journey = Boolean(body.journey);
  const [theme, setTheme] = useState<"light" | "dark">(journey ? "dark" : "light");
  const [tiles, setTiles] = useState<ChallengeTileId[]>(() => {
    const preferred: ChallengeTileId[] = journey
      ? ["activeDays", ...DEFAULT_VISIBLE_TILES]
      : [...DEFAULT_VISIBLE_TILES];
    const selected = preferred.filter((id) => available.includes(id)).slice(0, 4);
    return selected.length ? selected : available.slice(0, 4);
  });
  const src = `${cardUrl}?${new URLSearchParams({ theme, tiles: tiles.join(",") })}`;
  async function shareImage() {
    setSharing(true);
    try {
      const filename = "bisibility-report.png";
      const supportsShare = navigator.canShare?.({
        files: [new File([], filename, { type: "image/png" })],
      });
      const supportsCopy = typeof ClipboardItem !== "undefined" && navigator.clipboard?.write;
      if (!supportsShare && !supportsCopy) {
        showToast(t("share.imageShareFailed"), { severity: "error" });
        return;
      }
      const png = fetch(src).then((response) => {
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) {
          throw new Error("Report image unavailable");
        }
        return response.blob();
      });
      if (supportsShare) {
        await navigator.share({ files: [new File([await png], filename, { type: "image/png" })] });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        showToast(t("share.imageCopied"), { severity: "success" });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        showToast(t("share.imageShareFailed"), { severity: "error" });
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button href={`${src}&download=1`} size="input" variant="secondary">
            {t("share.download")}
          </Button>
          <Button loading={sharing} onClick={() => void shareImage()} size="input">
            {t("share.shareImage")}
          </Button>
        </div>
      }
      onClose={onClose}
      open
      size="lg"
      title={t("share.shareCard")}
    >
      <div className="grid gap-4">
        <div className="rounded-card bg-bg-elev p-3" data-theme={theme}>
          <ReportCardPreview
            domain={domain}
            faviconDomain={faviconDomain}
            title={title}
            view={privateReportCardView(body, tiles)}
          />
        </div>
        <SegmentedControl
          ariaLabel={t("share.theme")}
          fitContent
          onChange={setTheme}
          options={[
            { value: "light", label: t("share.themeLight") },
            { value: "dark", label: t("share.themeDark") },
          ]}
          size="field"
          value={theme}
        />
        {available.length ? (
          <fieldset className="grid min-w-0 gap-2 border-0 p-0 sm:grid-cols-2">
            <legend className="mb-2 text-ui-body">{t("share.cardValues")}</legend>
            {available.map((id) => (
              <Checkbox
                checked={tiles.includes(id)}
                disabled={!tiles.includes(id) && tiles.length >= 4}
                key={id}
                label={t(`tiles.${id}`)}
                onChange={(event) =>
                  setTiles(
                    event.currentTarget.checked
                      ? [...tiles, id]
                      : tiles.filter((value) => value !== id),
                  )
                }
              />
            ))}
          </fieldset>
        ) : null}
      </div>
    </Modal>
  );
}
