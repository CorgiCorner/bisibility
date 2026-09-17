import "server-only";

import type { AbstractIntlMessages } from "next-intl";
import { createTranslator } from "use-intl/core";
import type { AppLocale } from "./config";
import { formats, type IntlTranslationContext } from "./formats";

/**
 * Creates a server translator from the same explicit locale and namespace
 * payload passed to client islands. This keeps feature pages independent from
 * the static-default request config at the root layout.
 */
export function createIntlTranslator<const Messages extends AbstractIntlMessages>(
  locale: AppLocale,
  messages: Messages,
  context: IntlTranslationContext,
) {
  return createTranslator({ formats, locale, messages, timeZone: context.timeZone });
}
