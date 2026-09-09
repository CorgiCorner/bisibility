export type TestDataTableRow = {
  id: string;
  kind?: "row" | "group" | "section";
  label: string;
  score: number;
  subRows?: readonly TestDataTableRow[];
};

export const testDataTableRows: readonly TestDataTableRow[] = [
  {
    id: "section",
    kind: "section",
    label: "Section",
    score: 0,
    subRows: [{ id: "section-leaf", label: "Section leaf", score: 3 }],
  },
  {
    id: "group",
    kind: "group",
    label: "Group",
    score: 5,
    subRows: [
      { id: "group-leaf-a", label: "Group leaf A", score: 2 },
      { id: "group-leaf-b", label: "Group leaf B", score: 2 },
    ],
  },
  { id: "standalone", label: "Standalone", score: 1 },
];
