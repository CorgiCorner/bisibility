import { makePublicId, type PublicIdPrefix, parsePublicId } from "./public-id.ts";

const prefixByModel = {
  AlertRule: "alr",
  ApiKey: "key",
  AuditLog: "audit",
  CloudImportJob: "imp",
  Competitor: "cmp",
  IngestHook: "dwh",
  Invite: "inv",
  Keyword: "kw",
  Membership: "mbr",
  MigrationToken: "ferry",
  Notification: "ntf",
  PersonalAccessToken: "pat",
  Project: "prj",
  ProjectMarket: "pmkt",
  ProviderConnection: "conn",
  RankCheck: "check",
  SavedKeyword: "svkw",
  SavedView: "viw",
  Session: "sid",
  Signal: "sig",
  Tag: "tag",
  TriggeredAlert: "al",
  User: "usr",
  WebhookEndpoint: "we",
} as const satisfies Record<string, PublicIdPrefix>;

const nestedModels: Partial<
  Record<keyof typeof prefixByModel, Record<string, keyof typeof prefixByModel>>
> = {
  AlertRule: { triggered: "TriggeredAlert" },
  CloudImportJob: {},
  Keyword: { rankChecks: "RankCheck", signals: "Signal", triggeredAlerts: "TriggeredAlert" },
  MigrationToken: { importJobs: "CloudImportJob" },
  Project: {
    alertRules: "AlertRule",
    apiKeys: "ApiKey",
    cloudImportJobs: "CloudImportJob",
    competitors: "Competitor",
    ingestHooks: "IngestHook",
    invites: "Invite",
    keywords: "Keyword",
    markets: "ProjectMarket",
    members: "Membership",
    migrationTokens: "MigrationToken",
    notifications: "Notification",
    providerConnections: "ProviderConnection",
    savedKeywords: "SavedKeyword",
    savedViews: "SavedView",
    signals: "Signal",
    tags: "Tag",
    webhookEndpoints: "WebhookEndpoint",
  },
  RankCheck: { triggeredAlerts: "TriggeredAlert" },
  User: {
    createdAlertRules: "AlertRule",
    createdIngestHooks: "IngestHook",
    createdMigrationTokens: "MigrationToken",
    memberships: "Membership",
    notifications: "Notification",
    personalAccessTokens: "PersonalAccessToken",
    projects: "Project",
    savedViews: "SavedView",
    sentInvites: "Invite",
    sessions: "Session",
    signalsCreated: "Signal",
  },
};

type WriteRecord = Record<string, unknown>;

function isRecord(value: unknown): value is WriteRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapRows(value: unknown, mapper: (row: WriteRecord) => WriteRecord): unknown {
  if (Array.isArray(value)) return value.map((row) => (isRecord(row) ? mapper(row) : row));
  return isRecord(value) ? mapper(value) : value;
}

function rewriteNestedOperation(value: unknown, model: keyof typeof prefixByModel): unknown {
  if (!isRecord(value)) return value;
  const next = { ...value };
  if ("create" in next) next.create = mapRows(next.create, (row) => addPublicIdsToData(model, row));
  if ("createMany" in next && isRecord(next.createMany)) {
    next.createMany = {
      ...next.createMany,
      data: mapRows(next.createMany.data, (row) => addPublicIdsToData(model, row)),
    };
  }
  if ("connectOrCreate" in next) {
    next.connectOrCreate = mapRows(next.connectOrCreate, (row) =>
      isRecord(row.create) ? { ...row, create: addPublicIdsToData(model, row.create) } : row,
    );
  }
  if ("upsert" in next) {
    next.upsert = mapRows(next.upsert, (row) => ({
      ...row,
      ...(isRecord(row.create) ? { create: addPublicIdsToData(model, row.create) } : {}),
      ...(isRecord(row.update) ? { update: addNestedPublicIds(model, row.update) } : {}),
    }));
  }
  if ("update" in next) next.update = mapRows(next.update, (row) => addNestedPublicIds(model, row));
  if ("updateMany" in next) {
    next.updateMany = mapRows(next.updateMany, (row) =>
      isRecord(row.data) ? { ...row, data: addNestedPublicIds(model, row.data) } : row,
    );
  }
  return next;
}

export function addPublicIdsToData(
  model: keyof typeof prefixByModel,
  data: WriteRecord,
): WriteRecord {
  const prefix = prefixByModel[model];
  const providedPublicId = data.publicId;
  if (
    providedPublicId != null &&
    (typeof providedPublicId !== "string" || parsePublicId(providedPublicId)?.prefix !== prefix)
  ) {
    throw new Error(`${model}.publicId must be a strict ${prefix}_ v3 public ID.`);
  }
  const next: WriteRecord = {
    ...data,
    ...(data.publicId == null ? { publicId: makePublicId(prefix) } : {}),
  };
  for (const [field, nestedModel] of Object.entries(nestedModels[model] ?? {}) as Array<
    [string, keyof typeof prefixByModel]
  >) {
    if (field in next) next[field] = rewriteNestedOperation(next[field], nestedModel);
  }
  return next;
}

function addNestedPublicIds(model: keyof typeof prefixByModel, data: WriteRecord): WriteRecord {
  const next: WriteRecord = { ...data };
  for (const [field, nestedModel] of Object.entries(nestedModels[model] ?? {}) as Array<
    [string, keyof typeof prefixByModel]
  >) {
    if (field in next) next[field] = rewriteNestedOperation(next[field], nestedModel);
  }
  return next;
}

export function addPublicIdsToArgs(
  model: keyof typeof prefixByModel,
  operation: string,
  args: unknown,
) {
  if (!isRecord(args)) return args;
  const next = { ...args };
  if (["create", "createMany", "createManyAndReturn"].includes(operation) && "data" in next) {
    next.data = mapRows(next.data, (row) => addPublicIdsToData(model, row));
  }
  if ("create" in next && isRecord(next.create))
    next.create = addPublicIdsToData(model, next.create);
  if (["update", "updateMany"].includes(operation) && isRecord(next.data))
    next.data = addNestedPublicIds(model, next.data);
  if ("update" in next && isRecord(next.update))
    next.update = addNestedPublicIds(model, next.update);
  return next;
}

function modelName(property: PropertyKey): keyof typeof prefixByModel | null {
  const model =
    typeof property === "string"
      ? `${property.slice(0, 1).toUpperCase()}${property.slice(1)}`
      : null;
  return model && model in prefixByModel ? (model as keyof typeof prefixByModel) : null;
}

function wrapDelegate(delegate: object, model: keyof typeof prefixByModel) {
  return new Proxy(delegate, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (
        !["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert"].includes(
          String(property),
        )
      ) {
        return value.bind(target);
      }
      return (args: unknown) =>
        value.call(target, addPublicIdsToArgs(model, String(property), args));
    },
  });
}

/** Adds v3 IDs at every Prisma write boundary, including interactive transactions. */
export function withPublicIdWrites<Client extends object>(client: Client): Client {
  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "$transaction" && typeof value === "function") {
        return (input: unknown, ...rest: unknown[]) => {
          if (typeof input !== "function") return value.call(target, input, ...rest);
          return value.call(
            target,
            (transaction: object) => input(withPublicIdWrites(transaction)),
            ...rest,
          );
        };
      }
      const model = modelName(property);
      return model && value && typeof value === "object"
        ? wrapDelegate(value, model)
        : typeof value === "function"
          ? value.bind(target)
          : value;
    },
  }) as Client;
}
