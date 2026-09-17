import type { useTranslations } from "next-intl";

type ConsentTranslator = ReturnType<typeof useTranslations<"shared.analyticsConsent">>;

/** Creates the visible consent content at the client render boundary. */
export function localizedConsentCopy(t: ConsentTranslator) {
  return {
    banner: {
      body: t("banner.body"),
      update: t("banner.update"),
      title: t("title"),
    },
    modal: {
      essential: {
        body: t("modal.essential.body"),
        title: t("modal.essential.title"),
      },
      footer: t("modal.footer"),
      intro: t("modal.intro"),
      replay: {
        body: t("modal.replay.body"),
        title: t("modal.replay.title"),
      },
      title: t("title"),
      usage: {
        body: t("modal.usage.body"),
        title: t("modal.usage.title"),
      },
      visitCounts: t("modal.visitCounts"),
    },
  };
}
