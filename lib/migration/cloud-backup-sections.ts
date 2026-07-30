type CloudBackupSectionContract = {
  countable: boolean;
  countKey: string | null;
  description: string;
  label: string;
  payloadKey: string;
};

export const CLOUD_BACKUP_SECTIONS = [
  {
    countable: true,
    countKey: "keywords",
    description: "Names, tags and target URLs",
    label: "Keywords & tags",
    payloadKey: "keywords",
  },
  {
    countable: true,
    countKey: "rankChecks",
    description: "Every retained position and ranking URL",
    label: "Rank history",
    payloadKey: "rank_checks",
  },
  {
    countable: true,
    countKey: "competitors",
    description: "Tracked domains and their labels",
    label: "Competitors",
    payloadKey: "competitors",
  },
  {
    countable: true,
    countKey: "alertRules",
    description: "Thresholds, targets and delivery channels",
    label: "Alert rules",
    payloadKey: "alert_rules",
  },
  {
    countable: true,
    countKey: "savedViews",
    description: "Names and workspace filter configurations",
    label: "Saved views",
    payloadKey: "saved_views",
  },
  {
    countable: true,
    countKey: "notificationPreferences",
    description: "Workspace notification choices",
    label: "Notification preferences",
    payloadKey: "notification_preferences",
  },
  {
    countable: false,
    countKey: null,
    description: "Name, domain and import metadata",
    label: "Workspace details",
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
      throw new Error(`${section.label} is countable but has no export count key.`);
    }
    if (!section.countable && section.countKey) {
      throw new Error(`${section.label} is non-countable but has an export count key.`);
    }
    if (section.countKey && countKeys.has(section.countKey)) {
      throw new Error(`${section.label} duplicates export count key ${section.countKey}.`);
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
