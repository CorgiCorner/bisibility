import type { ErrorEvent } from "@sentry/nextjs";

const INJECTED_PREFIXES = [
  "app:///frame_ant/",
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "safari-web-extension://",
];

export function isInjectedScriptEvent(event: Partial<ErrorEvent>): boolean {
  return (
    event.exception?.values?.some((exception) =>
      exception.stacktrace?.frames?.some((frame) =>
        INJECTED_PREFIXES.some((prefix) => frame.filename?.startsWith(prefix)),
      ),
    ) ?? false
  );
}
