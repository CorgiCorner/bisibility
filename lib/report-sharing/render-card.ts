import "server-only";

import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { formats } from "@/i18n/formats";
import { createTranslator } from "use-intl/core";
import { reportCardContent } from "./card-content";
import { reportCardFavicon } from "./favicon";
import { shareReportImage } from "./image";
import type { PublicReport } from "./projection";

export async function renderReportCard(input: {
  domain: string;
  download: boolean;
  faviconDomain?: string | null;
  theme: "dark" | "light";
  title: string;
  view: PublicReport;
}) {
  const [runtime, favicon] = await Promise.all([
    resolveRegionalDocumentLocale(),
    reportCardFavicon(input.faviconDomain),
  ]);
  const messages = await loadCoreMessages(runtime.locale, ["challengeReport"]);
  const t = createTranslator({ ...runtime, formats, messages, namespace: "challengeReport" });
  return shareReportImage({
    ...reportCardContent(input, t, runtime.locale, runtime.timeZone),
    domain: input.domain,
    download: input.download,
    favicon,
    theme: input.theme,
  });
}
