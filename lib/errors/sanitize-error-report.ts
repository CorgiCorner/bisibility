import { appRootPath, appSectionPath } from "@/lib/routing/app-path";

type ErrorReportContent = {
  message: string;
  pathname: string;
  stack?: string;
};

const ABSOLUTE_URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu;
const SEARCH_CONSOLE_DOMAIN_PATTERN = /\bsc-domain:[^\s"'<>),;\]}]+/giu;
const PROJECT_PATH_PREFIX = "/app/prj_";

function stripUrlQueryAndFragment(value: string) {
  const suffixIndex = value.search(/[?#]/u);
  return suffixIndex === -1 ? value : value.slice(0, suffixIndex);
}

function sanitizeProjectPath(value: string) {
  const pathname = stripUrlQueryAndFragment(value);
  if (!pathname.startsWith(PROJECT_PATH_PREFIX)) {
    return pathname;
  }

  return appRootPath("<project>", appSectionPath(pathname));
}

function sanitizeUrl(value: string) {
  const withoutPrivateSuffix = stripUrlQueryAndFragment(value);
  const projectPathIndex = withoutPrivateSuffix.indexOf(PROJECT_PATH_PREFIX);
  if (projectPathIndex === -1) {
    return withoutPrivateSuffix;
  }

  return (
    withoutPrivateSuffix.slice(0, projectPathIndex) +
    sanitizeProjectPath(withoutPrivateSuffix.slice(projectPathIndex))
  );
}

function sanitizeErrorText(value: string) {
  return value
    .replace(ABSOLUTE_URL_PATTERN, sanitizeUrl)
    .replace(SEARCH_CONSOLE_DOMAIN_PATTERN, "sc-domain:<redacted>");
}

/** Removes customer-identifying route and integration data from a report that leaves the app. */
export function sanitizeErrorReport<T extends ErrorReportContent>(details: T) {
  return {
    ...details,
    message: sanitizeErrorText(details.message),
    pathname: sanitizeProjectPath(details.pathname),
    stack: details.stack ? sanitizeErrorText(details.stack) : undefined,
  };
}
