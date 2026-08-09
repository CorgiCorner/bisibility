const encoder = new TextEncoder();

export type ZipEntryInput = { bytes: Uint8Array; name: string };

function csvCell(value: unknown) {
  const text =
    value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvBytes(payload: Record<string, unknown>, key: string, headers: readonly string[]) {
  const rows = Array.isArray(payload[key]) ? (payload[key] as Record<string, unknown>[]) : [];
  return encoder.encode(
    [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ].join("\n"),
  );
}

export function cloudWorkspacePackageEntries(content: string): ZipEntryInput[] {
  const payload = JSON.parse(content) as Record<string, unknown>;
  const readme = [
    "bisibility project package",
    "",
    "To restore this project, upload this .zip file as it is, under",
    "Settings > Import from another instance. Do not unpack it first.",
    "",
    "manifest.json holds the data that gets imported.",
    "The CSV files under data/ are reading copies only and are ignored during import.",
  ].join("\n");
  return [
    { bytes: encoder.encode(content), name: "manifest.json" },
    { bytes: encoder.encode(readme), name: "README.txt" },
    {
      bytes: csvBytes(payload, "keywords", [
        "id",
        "project_id",
        "keyword",
        "text",
        "target_url",
        "tags",
        "country",
        "location",
        "device",
        "latest_position",
        "ranking_url",
        "created_at",
        "updated_at",
      ]),
      name: "data/keywords.csv",
    },
    {
      bytes: csvBytes(payload, "rank_checks", [
        "id",
        "keyword_id",
        "checked_at",
        "position",
        "previous_position",
        "ranking_url",
        "provider",
        "cost_cents",
      ]),
      name: "data/rank-checks.csv",
    },
    {
      bytes: csvBytes(payload, "competitors", ["id", "domain", "label"]),
      name: "data/competitors.csv",
    },
  ];
}
