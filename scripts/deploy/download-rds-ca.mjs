#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_RDS_CA_URL = "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem";
const DEFAULT_RDS_CA_PATH = "prisma/rds-ca.pem";

export async function downloadRdsCaBundle({
  url = process.env.RDS_CA_BUNDLE_URL || DEFAULT_RDS_CA_URL,
  outputPath = process.env.RDS_CA_BUNDLE_PATH || DEFAULT_RDS_CA_PATH,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!fetchImpl) throw new Error("fetch is not available in this Node.js runtime");

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Failed to download RDS CA bundle: HTTP ${response.status}`);

  const body = await response.text();
  if (!body.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("Downloaded RDS CA bundle does not look like a PEM certificate bundle");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, body, { mode: 0o644 });
  return outputPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const outputPath = await downloadRdsCaBundle();
    console.log(`Downloaded AWS RDS CA bundle to ${outputPath}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
