import type { DataMigrationDefinition } from "./types";

export const dataMigrationRegistry = [] as const satisfies readonly DataMigrationDefinition[];
