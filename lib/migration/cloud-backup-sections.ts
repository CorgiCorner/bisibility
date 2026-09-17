type CloudBackupSectionContract = {
  countable: boolean;
  countKey: string | null;
  payloadKey: string;
};

export const CLOUD_BACKUP_SECTIONS = [
  {
    countable: true,
    countKey: "keywords",
    payloadKey: "keywords",
  },
  {
    countable: true,
    countKey: "rankChecks",
    payloadKey: "rank_checks",
  },
  {
    countable: true,
    countKey: "competitors",
    payloadKey: "competitors",
  },
  {
    countable: true,
    countKey: "alertRules",
    payloadKey: "alert_rules",
  },
  {
    countable: true,
    countKey: "savedViews",
    payloadKey: "saved_views",
  },
  {
    countable: true,
    countKey: "notificationPreferences",
    payloadKey: "notification_preferences",
  },
  {
    countable: false,
    countKey: null,
    payloadKey: "projects",
  },
] as const satisfies readonly CloudBackupSectionContract[];

type CountableCloudBackupSection = Extract<
  (typeof CLOUD_BACKUP_SECTIONS)[number],
  { countable: true }
>;

export type CloudBackupCountKey = CountableCloudBackupSection["countKey"];
export type CloudBackupCounts = Record<CloudBackupCountKey, number>;

export const CLOUD_BACKUP_COUNT_KEYS: readonly CloudBackupCountKey[] =
  CLOUD_BACKUP_SECTIONS.flatMap((section) => (section.countable ? [section.countKey] : []));

export function assertCloudBackupSectionContract(sections: readonly CloudBackupSectionContract[]) {
  const countKeys = new Set<string>();
  for (const section of sections) {
    if (section.countable && !section.countKey) {
      throw new Error(`${section.payloadKey} is countable but has no export count key.`);
    }
    if (!section.countable && section.countKey) {
      throw new Error(`${section.payloadKey} is non-countable but has an export count key.`);
    }
    if (section.countKey && countKeys.has(section.countKey)) {
      throw new Error(`${section.payloadKey} duplicates export count key ${section.countKey}.`);
    }
    if (section.countKey) countKeys.add(section.countKey);
  }
}

assertCloudBackupSectionContract(CLOUD_BACKUP_SECTIONS);

export function countCloudBackupPayload(payload: Record<string, unknown>): CloudBackupCounts {
  const entries = CLOUD_BACKUP_SECTIONS.flatMap((section) => {
    if (!section.countable) return [];
    const rows = payload[section.payloadKey];
    if (!Array.isArray(rows)) {
      throw new Error(`Cloud backup payload is missing ${section.payloadKey}.`);
    }
    return [[section.countKey, rows.length] as const];
  });
  return Object.fromEntries(entries) as CloudBackupCounts;
}
