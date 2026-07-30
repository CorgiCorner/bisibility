import type { KeywordLocation, KeywordRow } from "@/lib/queries/keywords";

// The keyword-list "lens": a single location + device the table is viewed through
// (design §6). View state lives in the URL (?location=<locationId>&device=<...>)
// and is resolved server-side (RSC), so there is no client view-state and no
// useEffect. Selecting a lens is a navigation, not local state.

export type LensDevice = "all" | "desktop" | "mobile";

export type ActiveLens = {
  locationId: string | null; // null = all locations (default landing view)
  device: LensDevice;
};

export type LensLocationOption = {
  id: string;
  displayName: string;
  kind: KeywordLocation["kind"];
  count: number;
};

const DEVICE_VALUES = new Set<LensDevice>(["all", "desktop", "mobile"]);
export const DEFAULT_LENS_DEVICE: LensDevice = "desktop";

function rowDevice(value: string): "desktop" | "mobile" | null {
  const lowered = value.toLowerCase();
  return lowered === "desktop" || lowered === "mobile" ? lowered : null;
}

export function resolveDefaultLensDevice(rows: KeywordRow[] = []): LensDevice {
  const devices = new Set<"desktop" | "mobile">();
  for (const row of rows) {
    const device = rowDevice(row.device);
    if (device) {
      devices.add(device);
    }
  }
  if (devices.size === 0) {
    return DEFAULT_LENS_DEVICE;
  }
  if (devices.size === 1) {
    return devices.values().next().value ?? DEFAULT_LENS_DEVICE;
  }
  return "all";
}

function normalizeDevice(value: string | null | undefined, defaultDevice: LensDevice): LensDevice {
  const lowered = (value ?? "").toLowerCase();
  return DEVICE_VALUES.has(lowered as LensDevice) ? (lowered as LensDevice) : defaultDevice;
}

/**
 * Invalid URL lens values fall back safely; callers drop unused locations to "all".
 */
export function resolveActiveLens(
  params: {
    location?: string | null;
    device?: string | null;
  },
  rows: KeywordRow[] = [],
): ActiveLens {
  const locationId = params.location?.trim() ? params.location.trim() : null;
  return { device: normalizeDevice(params.device, resolveDefaultLensDevice(rows)), locationId };
}

/** Distinct locations present in the rows, most-tracked first, for the selector. */
export function lensLocationOptions(rows: KeywordRow[]): LensLocationOption[] {
  const byId = new Map<string, LensLocationOption>();
  for (const row of rows) {
    const { id, displayName, kind } = row.location;
    if (!id) {
      continue;
    }
    const existing = byId.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      byId.set(id, { count: 1, displayName, id, kind });
    }
  }
  return [...byId.values()].sort(
    (a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName),
  );
}

/**
 * Device always filters rows; a null location includes every location.
 */
export function applyLens(rows: KeywordRow[], lens: ActiveLens): KeywordRow[] {
  return rows.filter((row) => {
    if (lens.device !== "all" && row.device.toLowerCase() !== lens.device) {
      return false;
    }
    if (lens.locationId && row.location.id !== lens.locationId) {
      return false;
    }
    return true;
  });
}

/** Build a keywords URL preserving the current view id and lens params. */
export function lensHref(base: string, lens: ActiveLens, viewId?: string | null): string {
  const params = new URLSearchParams();
  if (viewId) {
    params.set("view", viewId);
  }
  if (lens.locationId) {
    params.set("location", lens.locationId);
  }
  params.set("device", lens.device);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
