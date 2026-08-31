import type { ActiveIntegrationKind } from "@/lib/integrations/category-copy";
import type { ProviderRateFeature, ProviderRateSource } from "@/lib/provider-rates/resolver";
import type { ProviderFailureClass } from "@/lib/providers/failure-class";
import type {
  ConnectProviderInput,
  ProviderConnectionRefInput,
  TestProviderConnectionInput,
  UpdateProviderCostInput,
  UpdateProviderRateInput,
} from "@/lib/schemas/provider";
import type { SerpDepth, SerpDevice, SerpMarketName } from "@/lib/serp/markets";
import type { StatusKind } from "@/lib/ui/status-kind";

export type ProviderStatusKind = Extract<
  StatusKind,
  "connected" | "needs_reauth" | "ready" | "planned" | "optional"
>;

export type ProviderIconName =
  | "chart"
  | "database"
  | "globe"
  | "link"
  | "magnifier"
  | "table"
  | "trend";

export type CredentialField = {
  description?: string;
  label: string;
  name: "endpoint" | "login" | "secret";
  optional?: boolean;
  placeholder: string;
  type?: "password" | "text";
};

export type ProviderMetaRow = { label: string; value: string };

export type ProviderConsumerStatus = {
  detail?: string;
  state:
    | "backfill_running"
    | "first_view_ready"
    | "kept_current"
    | "last_synced"
    | "needs_reauth"
    | "never_synced"
    | "not_configured"
    | "paused_by_user"
    | "ready"
    | "sync_failed";
  summary: string;
};

export type ProviderConsumerStatuses = {
  searchModule: ProviderConsumerStatus;
  trafficEnrichment: ProviderConsumerStatus;
};

type ProviderRateDataBase = {
  amountCents?: number;
  checkedAt?: string;
  fallbackSource?: Exclude<ProviderRateSource, "manual" | "unknown">;
  label: string;
  sampleSize?: number;
  source: ProviderRateSource;
  unit: string;
};

export type ProviderRateData =
  | (ProviderRateDataBase & { editable?: true; feature: ProviderRateFeature })
  | (ProviderRateDataBase & {
      editable: false;
      feature: "domain_rank_overview" | "historical_rank_overview" | "relevant_pages";
    });

export type GooglePropertyOption = {
  kind: "domain" | "ga4" | "url-prefix";
  label: string;
  permissionLevel: string;
  value: string;
};

export type ArchivedGoogleProperty = GooglePropertyOption & {
  lastSyncedDate: string;
};

export type GoogleOAuthSetup = {
  accountEmail?: string;
  archivedProperties?: readonly ArchivedGoogleProperty[];
  error?: string;
  failureClass?: ProviderFailureClass;
  preferredProperty?: string;
  projectDomain?: string;
  properties: readonly GooglePropertyOption[];
  provider?: "ga4" | "gsc";
  requiresReauth?: boolean;
};

export type GooglePropertySaveResult =
  | { property: string; status: "saved" }
  | { status: "reauth_required" };

export type DrawerDefaults = {
  costPerCheck?: number;
  depth: `Top ${SerpDepth}`;
  device: Capitalize<SerpDevice>;
  endpoint: string;
  language: string;
  location: SerpMarketName;
  login: string;
  secret: string;
};

export type ProviderConnectionReadState = {
  readonly enabled?: boolean;
  readonly primary?: boolean;
  readonly priority?: number;
};

export type IntegrationProviderData = ProviderConnectionReadState & {
  credentialIssue?: "unreadable";
  consumerStatuses?: ProviderConsumerStatuses;
  description: string;
  drawer: {
    accountEmail?: string;
    activities: readonly ProviderMetaRow[];
    costHelp: string;
    credentialFields: readonly CredentialField[];
    defaults: DrawerDefaults;
    envHint?: string;
    googleOAuth?: GoogleOAuthSetup;
    rates?: readonly ProviderRateData[];
  };
  icon: ProviderIconName;
  id: string;
  kind: ActiveIntegrationKind;
  logoDomain?: string;
  meta: readonly ProviderMetaRow[];
  name: string;
  neverSynced?: boolean;
  syncFailure?: {
    consecutiveFailures: number;
    errorClass: string;
    since: string;
  };
  secondaryAction?: string;
  status: ProviderStatusKind;
  tint: string;
};

export type IntegrationCategoryData = {
  description: string;
  eyebrow: string;
  id: string;
  providers: readonly IntegrationProviderData[];
  title: string;
};

export type ProviderTestResult = {
  ok: boolean;
  message: string;
  balance?: number;
  availabilityTotal?: number;
};

export type ProviderTrafficSyncResult = {
  connections: number;
  keywordSnapshots: number;
  pageSnapshots: number;
  runs: readonly { status: string }[];
};

export type ConnectProviderActionInput = ConnectProviderInput & {
  enabled?: boolean;
};

export type ProviderConnectionSettingsInput = ProviderConnectionRefInput & {
  enabled?: boolean;
  priority?: number;
};

export type DisconnectProviderInput = ProviderConnectionRefInput;

export type ProviderActionHandlers = {
  completeGooglePropertySelection?(input: {
    projectId: string;
    property: string;
  }): Promise<{ property: string }>;
  loadStoredGoogleProperties?(input: {
    projectId: string;
    provider: "ga4" | "gsc";
  }): Promise<GoogleOAuthSetup>;
  saveStoredGoogleProperty?(input: {
    projectId: string;
    property: string;
    provider: "ga4" | "gsc";
  }): Promise<GooglePropertySaveResult>;
  connectProvider(input: ConnectProviderActionInput): Promise<unknown>;
  disconnectProvider?(input: DisconnectProviderInput): Promise<unknown>;
  updateProviderSettings(input: ProviderConnectionSettingsInput): Promise<unknown>;
  syncProjectTraffic?(input: { projectId: string }): Promise<ProviderTrafficSyncResult>;
  testProviderConnection(input: TestProviderConnectionInput): Promise<ProviderTestResult>;
  updateProviderCost(input: UpdateProviderCostInput): Promise<unknown>;
  updateProviderRate?(input: UpdateProviderRateInput): Promise<unknown>;
};
