import type { HelpTranslator } from "@/lib/measurement-help/types";
import type { useTranslations } from "next-intl";

/** Keeps the core callable contract backed by the actual host catalog translator. */
export function createHelpTranslator(
  t: ReturnType<typeof useTranslations<"shared.measurementHelp">>,
): HelpTranslator {
  return (key, values) => {
    if (key === "explain" || key === "glossary") {
      const title = values?.title;
      if (typeof title !== "string") throw new Error(`Missing measurement help title for ${key}`);
      return t(key, { title });
    }
    return t(key);
  };
}
