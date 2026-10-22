export type ProviderAccessSurface = "rank" | "keywords" | "backlinks" | "domain" | "ai";

export type ProviderAccessScope = Readonly<{
  canManageProviders: boolean;
  projectRef: string;
  readOnly: boolean;
}>;
