class NoopError extends Error {}

export class ApplicationFailure extends NoopError {}

export class WorkflowExecutionAlreadyStartedError extends NoopError {}

export const WorkflowIdConflictPolicy = {
  FAIL: "FAIL",
  TERMINATE_EXISTING: "TERMINATE_EXISTING",
  USE_EXISTING: "USE_EXISTING",
};

export const WorkflowIdReusePolicy = {
  ALLOW_DUPLICATE: "ALLOW_DUPLICATE",
  ALLOW_DUPLICATE_FAILED_ONLY: "ALLOW_DUPLICATE_FAILED_ONLY",
  REJECT_DUPLICATE: "REJECT_DUPLICATE",
  TERMINATE_IF_RUNNING: "TERMINATE_IF_RUNNING",
};

export const SearchAttributeType = {
  BOOL: "BOOL",
  DATETIME: "DATETIME",
  DOUBLE: "DOUBLE",
  INT: "INT",
  KEYWORD: "KEYWORD",
  KEYWORD_LIST: "KEYWORD_LIST",
  TEXT: "TEXT",
};

export function defineSearchAttributeKey(name: string, type: string) {
  return { name, type };
}

export function msToNumber(value: number | string) {
  return Number(value);
}

export class Client {
  connection = new Connection();
  schedule = {
    create: asyncNoop,
    getHandle: () => ({
      delete: asyncNoop,
      describe: asyncNoop,
      trigger: asyncNoop,
      update: asyncNoop,
    }),
    list: async function* () {},
  };
  workflow = { start: asyncNoop };
}

export class Connection {
  static async connect() {
    return new Connection();
  }

  async close() {}
}

export class NativeConnection extends Connection {}

export class ScheduleAlreadyRunning extends NoopError {}

export class ScheduleNotFoundError extends NoopError {}

export const ScheduleOverlapPolicy = {
  ALLOW_ALL: "ALLOW_ALL",
  BUFFER_ALL: "BUFFER_ALL",
  BUFFER_ONE: "BUFFER_ONE",
  CANCEL_OTHER: "CANCEL_OTHER",
  SKIP: "SKIP",
  TERMINATE_OTHER: "TERMINATE_OTHER",
};

export class Worker {
  static async create() {
    return new Worker();
  }

  async run() {}
}

export const Context = {
  current: () => ({
    cancellationSignal: new AbortController().signal,
    cancelled: Promise.resolve(),
    heartbeat: noop,
    info: {},
  }),
};

export const ParentClosePolicy = { ABANDON: "ABANDON" };

export const workflowInfo = () => ({ workflowId: "storybook-workflow" });

export const uuid4 = () => "00000000-0000-4000-8000-000000000000";

export const log = { error: noop, info: noop, warn: noop };

export const proxyActivities = () => new Proxy({}, { get: () => asyncNoop });

export const continueAsNew = asyncNoop;

export const sleep = asyncNoop;

export const startChild = asyncNoop;

function noop() {
  return undefined;
}

async function asyncNoop() {
  return undefined;
}
