import type { CostCatalogEntry } from "./catalog";
import type { CostRow } from "./present";
import type { CostTiles } from "./tiles";

export type UsageCostsView = {
  canEdit: boolean;
  catalog: readonly CostCatalogEntry[];
  month: string;
  projectPublicId: string;
  projects: readonly { name: string; publicId: string }[];
  rows: readonly CostRow[];
  suggestHref: string | null;
  tiles: CostTiles;
  today: string;
};
