import type { ArchivedGoogleProperty, GooglePropertyOption } from "@/lib/integrations/types";

export function googlePropertyDisplayName(value: string) {
  return value.startsWith("sc-domain:") ? value.slice("sc-domain:".length) : value;
}

function normalizedHost(value: string) {
  if (value.startsWith("sc-domain:")) return value.slice("sc-domain:".length).toLowerCase();
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function googlePropertyMatchesDomain(value: string, domain: string) {
  const projectDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const host = normalizedHost(value).replace(/^www\./, "");
  return Boolean(
    projectDomain && host && (host === projectDomain || host.endsWith(`.${projectDomain}`)),
  );
}

export function groupGoogleProperties(input: {
  activeValue?: string;
  archived: readonly ArchivedGoogleProperty[];
  options: readonly GooglePropertyOption[];
  projectDomain: string;
}) {
  const liveByValue = new Map(input.options.map((option) => [option.value, option]));
  const used = new Set<string>();
  const active = input.activeValue ? liveByValue.get(input.activeValue) : undefined;
  if (input.activeValue) used.add(input.activeValue);
  const archived = input.archived.flatMap((entry) => {
    if (used.has(entry.value)) return [];
    used.add(entry.value);
    const live = liveByValue.get(entry.value);
    return [
      {
        ...entry,
        available: Boolean(live),
        ...(live ? { permissionLevel: live.permissionLevel } : {}),
      },
    ];
  });
  const available = input.options.filter((option) => {
    if (used.has(option.value)) return false;
    used.add(option.value);
    return true;
  });
  return {
    active,
    archived,
    matching: available.filter((option) =>
      googlePropertyMatchesDomain(option.value, input.projectDomain),
    ),
    other: available.filter(
      (option) => !googlePropertyMatchesDomain(option.value, input.projectDomain),
    ),
  };
}
