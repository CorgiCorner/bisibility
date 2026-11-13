/** Module tabs for Pages, in the final product order. */
export const projectPagesTabOrder = ["all", "by-tag", "existing-vs-new", "compare"] as const;

export type ProjectPagesTabSlot = (typeof projectPagesTabOrder)[number];

export const projectPagesTabs = [
  { id: "all" },
  { id: "by-tag" },
  { id: "existing-vs-new" },
  { id: "compare" },
] as const satisfies readonly { id: ProjectPagesTabSlot }[];

export type ProjectPagesTabId = (typeof projectPagesTabs)[number]["id"];

export function defaultProjectPagesTab(): ProjectPagesTabId {
  for (const id of projectPagesTabOrder) {
    const match = projectPagesTabs.find((tab) => tab.id === id);
    if (match) return match.id;
  }
  return projectPagesTabs[0].id;
}

export function resolveProjectPagesTab(value: string | null | undefined): ProjectPagesTabId {
  const match = projectPagesTabs.find((tab) => tab.id === value);
  return match?.id ?? defaultProjectPagesTab();
}
