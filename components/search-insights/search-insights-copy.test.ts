import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { RETENTION_MONTHS } from "@/lib/search-insights/constants";
import { SEARCH_SYNC_STATUS_VOCABULARY } from "@/lib/search-insights/sync/control-model";
import { describe, expect, it } from "vitest";
import {
  backfillSyncTitle,
  FRESHNESS_ADJUSTMENT_TOOLTIP,
  FRESHNESS_CHECKED_PREFIX,
  FRESHNESS_FINAL_PREFIX,
  importDoneCopy,
  importRunningOwnershipCopy,
  NEUTRAL_COPY,
  OWNERSHIP_COPY,
  ownershipCopy,
  SYNC_LABEL,
} from "./search-insights-copy";

const OWNED = /your database/i;
const SOURCE_FILE = /\.(?:ts|tsx)$/;
const IGNORED_SOURCE_FILE = /\.(?:stories|test)\./;
const repositoryRoot = resolve(import.meta.dirname, "../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_FILE.test(entry.name) && !IGNORED_SOURCE_FILE.test(entry.name) ? [path] : [];
  });
}

const moduleFiles = [
  ...sourceFiles(join(repositoryRoot, "components/search-insights")),
  ...sourceFiles(join(repositoryRoot, "app/app/(workspace)/[project]/search-console")),
  ...sourceFiles(join(repositoryRoot, "lib/search-insights")),
  ...sourceFiles(join(repositoryRoot, "lib/actions")).filter((path) =>
    /^search-insights.*\.ts$/.test(basename(path)),
  ),
  ...sourceFiles(join(repositoryRoot, "lib/temporal")).filter((path) =>
    /^search-insights-.*\.ts$/.test(basename(path)),
  ),
];

function filesContaining(pattern: RegExp) {
  return moduleFiles
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(repositoryRoot, path));
}

describe("search insights ownership copy", () => {
  // Structural guard, not a per-string review: a cloud workspace is not the customer's
  // database, so the phrase may only appear in the self-host branch. Anything else that says
  // it is a bug in the copy, not a typo.
  it.each(Object.entries(OWNERSHIP_COPY))("keeps %s honest on cloud", (_key, pair) => {
    expect(OWNED.test(pair[1])).toBe(false);
  });

  it("still says it on self-host, where the database really is the customer's", () => {
    expect(OWNED.test(OWNERSHIP_COPY.retention[0])).toBe(true);
    expect(OWNED.test(OWNERSHIP_COPY.importRunning[0])).toBe(true);
  });

  it.each(Object.entries(NEUTRAL_COPY))("keeps the neutral string %s deployment free", (_k, v) => {
    expect(OWNED.test(v)).toBe(false);
  });

  it("picks the branch from the deployment mode", () => {
    expect(ownershipCopy(OWNERSHIP_COPY.retention, "self-host")).toBe(OWNERSHIP_COPY.retention[0]);
    expect(ownershipCopy(OWNERSHIP_COPY.retention, "cloud")).toBe(OWNERSHIP_COPY.retention[1]);
  });

  it.each([
    [
      3,
      "self-host",
      "We are copying the planned 3 months of Google history into your database now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
    [
      3,
      "cloud",
      "We are copying the planned 3 months of Google history into your workspace now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
    [
      6,
      "self-host",
      "We are copying the planned 6 months of Google history into your database now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
    [
      6,
      "cloud",
      "We are copying the planned 6 months of Google history into your workspace now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
    [
      12,
      "self-host",
      "We are copying the planned 12 months of Google history into your database now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
    [
      12,
      "cloud",
      "We are copying the planned 12 months of Google history into your workspace now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
    [
      16,
      "self-host",
      "Google only keeps 16 months, so we are copying all of it into your database now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
    [
      16,
      "cloud",
      "Google only keeps 16 months, so we are saving all of it to your workspace now. The first look opens with the first finalized day, the 7-day view follows as its days finalize, and older months keep loading in the background.",
    ],
  ] as const)("uses exact import copy for %s months on %s", (months, mode, expected) => {
    expect(importRunningOwnershipCopy(months, mode)).toBe(expected);
  });

  it.each([3, 6, 12, 16])("keeps %s-month cloud tooltip deployment-safe", (months) => {
    expect(importRunningOwnershipCopy(months, "cloud")).not.toMatch(OWNED);
    expect(importRunningOwnershipCopy(months, "self-host")).toMatch(OWNED);
  });

  it("keeps the static 16-month pair aligned with generated copy", () => {
    expect(importRunningOwnershipCopy(16, "self-host")).toBe(OWNERSHIP_COPY.importRunning[0]);
    expect(importRunningOwnershipCopy(16, "cloud")).toBe(OWNERSHIP_COPY.importRunning[1]);
  });

  it("keeps importDone aligned with importDoneCopy at Google's max window", () => {
    expect(NEUTRAL_COPY.importDone).toBe(importDoneCopy(RETENTION_MONTHS));
  });

  it.each([
    [
      3,
      "The 3-month import is still running. A manual sync queues behind it and would spend load quota twice.",
    ],
    [
      6,
      "The 6-month import is still running. A manual sync queues behind it and would spend load quota twice.",
    ],
    [
      12,
      "The 12-month import is still running. A manual sync queues behind it and would spend load quota twice.",
    ],
    [
      16,
      "The 16-month import is still running. A manual sync queues behind it and would spend load quota twice.",
    ],
  ] as const)(
    "uses planned depth in the backfill sync tooltip for %s months",
    (months, expected) => {
      expect(backfillSyncTitle(months)).toBe(expected);
    },
  );

  it("keeps forbidden wording out of every module source file", () => {
    expect(filesContaining(/\u2014/u)).toEqual([]);
    expect(filesContaining(/striking distance/i)).toEqual([]);
    expect(filesContaining(/sampled/i)).toEqual([]);
    expect(filesContaining(/Finalized through/i)).toEqual([]);
    expect(filesContaining(/Opened already|SeenDot/)).toEqual([]);
  });

  it("keeps database wording in the ownership copy and its self-host branches only", () => {
    expect(filesContaining(OWNED)).toEqual(["components/search-insights/search-insights-copy.ts"]);

    for (const pair of Object.values(OWNERSHIP_COPY)) {
      expect(OWNED.test(pair[0])).toBe(true);
      expect(OWNED.test(pair[1])).toBe(false);
    }
  });
});

describe("search import status copy", () => {
  it("exposes only the closed status vocabulary", () => {
    expect(SEARCH_SYNC_STATUS_VOCABULARY).toEqual([
      "Queued",
      "Importing",
      "Paused",
      "Waiting for Google",
      "Reconnect required",
      "Waiting for data",
      "Delayed",
      "Failed",
      "Completed",
      "Status unavailable",
    ]);
    expect(new Set(SEARCH_SYNC_STATUS_VOCABULARY).size).toBe(10);
  });

  it("keeps Sync now as the control label while an import is running", () => {
    expect(SYNC_LABEL).toBe("Sync now");
  });

  it("keeps freshness compact and moves mutability into the tooltip", () => {
    expect([FRESHNESS_FINAL_PREFIX, FRESHNESS_CHECKED_PREFIX]).toEqual([
      "Final through",
      "checked",
    ]);
    expect(FRESHNESS_ADJUSTMENT_TOOLTIP).toBe("Google may adjust recent data until it finalizes.");
  });
});
