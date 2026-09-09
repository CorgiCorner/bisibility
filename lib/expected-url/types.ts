export type ExpectedUrlSource = "canonical" | "explicit" | "hreflang";

export type ExpectedUrlResolution = {
  source: ExpectedUrlSource | null;
  url: string | null;
};

export type ExpectedUrlRow = {
  canonicalKey: string;
  countryCode?: string | null;
  languageCode?: string | null;
  targetUrl: string | null;
};

export type ExpectedUrlDocument = {
  body: string;
  contentType: string;
  url: string;
};

export type ExpectedUrlLog = {
  error?: string;
  projectId?: string;
  reason: string;
  url?: string;
};

export type ExpectedUrlLogger = (entry: ExpectedUrlLog) => void;

export type ExpectedUrlResolverInput = {
  allowedHosts: readonly string[];
  canonicalBaseUrl?: string | null;
  canonicalRows: readonly ExpectedUrlRow[];
  defaultLocationKey: string | null | undefined;
  fetchDocument: (url: string) => Promise<ExpectedUrlDocument | null>;
  logger: ExpectedUrlLogger;
  row: ExpectedUrlRow;
};

export type ExpectedUrlCache = Map<
  string,
  { expiresAt: number; value: ExpectedUrlDocument | null }
>;
