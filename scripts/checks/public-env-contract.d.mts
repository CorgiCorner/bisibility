export type DocsNames = {
  specific: Set<string>;
  wildcards: Set<string>;
};

export function parseStarterNames(source: string): Set<string>;
export function parseDocsNames(source: string): DocsNames;
export function docsCoversName(docs: DocsNames, name: string): boolean;
export function validateContract(options: {
  runtimeNames: Set<string>;
  starterNames: Set<string>;
  registryNames?: Set<string> | null;
  docsNames: DocsNames;
}): string[];
export function checkPublicEnvContract(options?: {
  starterRelativePath?: string;
  registryRelativePath?: string | null;
}): Promise<void>;
export function registryPathFromArgs(args: string[]): string | null;
