#!/usr/bin/env -S node --experimental-transform-types

import { pathToFileURL } from "node:url";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { lintDataMigrationReleaseBoundaries } from "./boundary";

export async function checkDataMigrationBoundary(root = process.cwd()) {
  await lintDataMigrationReleaseBoundaries(root, dataMigrationManifest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDataMigrationBoundary().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
