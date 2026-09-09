import { createHash } from "node:crypto";

export const DATA_TABLE_PERF_USER = {
  email: "data-table-perf@example.org",
  id: "data_table_perf_user_20260905",
  name: "Data table performance fixture",
  publicId: seededPublicId("usr", "user"),
};
export const DATA_TABLE_PERF_PROJECT = {
  domain: "example.com",
  id: "data_table_perf_project_20260905",
  name: "Data table performance fixture",
  publicId: seededPublicId("prj", "project"),
};
export const DATA_TABLE_PERF_COUNTS = { groups: 1_000, targets: 5_000 } as const;

type ScheduleFrequency = "manual";
export type DataTablePerfLocation = {
  canonicalKey: string;
  cityName: null;
  countryCode: string;
  displayName: string;
  gl: string;
  hl: string;
  id: string;
  kind: "country";
  status: "active" | "paused";
};
export type DataTablePerfTarget = {
  checkScheduleId: string;
  device: "desktop" | "mobile";
  id: string;
  intent: "commercial" | "informational";
  keyword: string;
  locationId: string;
  marketStatus: "active" | "paused";
  publicId: string;
  rankHistory: Array<{
    checkedAt: string;
    position: number;
    previousPosition: number | null;
    rankingUrl: string;
  }>;
  schedule: {
    frequency: ScheduleFrequency;
    lastCheckedAt: string;
    nextCheckAt: string | null;
    timezone: "UTC";
  };
  sparkline: number[];
  tags: string[];
  targetUrl: string;
  topic: "Docs" | "Product";
};

export type DataTablePerfFixture = {
  locations: DataTablePerfLocation[];
  schedules: Array<{
    enabled: boolean;
    frequency: "manual";
    id: string;
    name: string;
    publicId: string;
  }>;
  targets: DataTablePerfTarget[];
};

const locations: DataTablePerfLocation[] = [
  {
    canonicalKey: "fixture-dt-perf-us:en",
    cityName: null,
    countryCode: "US",
    displayName: "Fixture United States",
    gl: "us",
    hl: "en",
    id: "fixture_dt_perf_location_us_20260905",
    kind: "country",
    status: "active",
  },
  {
    canonicalKey: "fixture-dt-perf-gb:en",
    cityName: null,
    countryCode: "GB",
    displayName: "Fixture United Kingdom",
    gl: "gb",
    hl: "en",
    id: "fixture_dt_perf_location_gb_20260905",
    kind: "country",
    status: "active",
  },
  {
    canonicalKey: "fixture-dt-perf-pl:pl",
    cityName: null,
    countryCode: "PL",
    displayName: "Fixture Poland",
    gl: "pl",
    hl: "pl",
    id: "fixture_dt_perf_location_pl_20260905",
    kind: "country",
    status: "active",
  },
  {
    canonicalKey: "fixture-dt-perf-de:de",
    cityName: null,
    countryCode: "DE",
    displayName: "Fixture Germany",
    gl: "de",
    hl: "de",
    id: "fixture_dt_perf_location_de_20260905",
    kind: "country",
    status: "active",
  },
  {
    canonicalKey: "fixture-dt-perf-au:en",
    cityName: null,
    countryCode: "AU",
    displayName: "Fixture Australia",
    gl: "au",
    hl: "en",
    id: "fixture_dt_perf_location_au_20260905",
    kind: "country",
    status: "paused",
  },
];

export function dataTablePerfLocations() {
  return locations;
}

export function seededPublicId(
  prefix: "check" | "kw" | "mbr" | "pmkt" | "prj" | "sch" | "tag" | "usr",
  key: string,
) {
  return `${prefix}_a${createHash("sha256").update(`data-table-perf:${key}`).digest("hex").slice(0, 23)}`;
}

function keywordFor(group: number, target: number) {
  const term = `rank tracker performance ${String(group).padStart(4, "0")}`;
  if (target === 1) return ` ${term.toUpperCase()} `;
  if (target === 3) return `${term.toUpperCase()}`;
  return term;
}

function rankHistory(target: number, url: string) {
  const current = (target % 90) + 1;
  return Array.from({ length: 6 }, (_, index) => {
    const position = current + 5 - index;
    return {
      checkedAt: `2026-08-${String(26 + index).padStart(2, "0")}T12:00:00.000Z`,
      position,
      previousPosition: index === 0 ? null : position + 1,
      rankingUrl: url,
    };
  });
}

export function buildDataTablePerfFixture(): DataTablePerfFixture {
  const manualScheduleId = "dt_perf_schedule_manual_inactive_20260905";
  const targets: DataTablePerfTarget[] = [];
  for (let group = 1; group <= DATA_TABLE_PERF_COUNTS.groups; group += 1) {
    for (let member = 0; member < locations.length; member += 1) {
      const location = locations[member];
      if (!location) throw new Error("Data table performance fixture location is missing.");
      const target = (group - 1) * locations.length + member + 1;
      const host = target % 2 === 0 ? "example.com" : "example.org";
      const targetUrl = `https://${host}/rank-tracker/${group}/${member + 1}`;
      const history = rankHistory(target, targetUrl);
      const scheduleFrequency: ScheduleFrequency = "manual";
      targets.push({
        checkScheduleId: manualScheduleId,
        device: member % 2 === 0 ? "desktop" : "mobile",
        id: `dt_perf_keyword_${target}`,
        intent: target % 2 === 0 ? "commercial" : "informational",
        keyword: keywordFor(group, member),
        locationId: location.id,
        marketStatus: location.status,
        publicId: seededPublicId("kw", `keyword:${target}`),
        rankHistory: history,
        schedule: {
          frequency: scheduleFrequency,
          lastCheckedAt: history.at(-1)?.checkedAt ?? "2026-08-31T12:00:00.000Z",
          nextCheckAt: null,
          timezone: "UTC",
        },
        sparkline: history.map((check) => check.position),
        tags: target % 3 === 0 ? ["Performance"] : ["Rank tracker"],
        targetUrl,
        topic: target % 2 === 0 ? "Product" : "Docs",
      });
    }
  }
  return {
    locations,
    schedules: [
      {
        enabled: false,
        frequency: "manual",
        id: manualScheduleId,
        name: "Manual inactive performance fixture",
        publicId: seededPublicId("sch", "manual-inactive"),
      },
    ],
    targets,
  };
}
