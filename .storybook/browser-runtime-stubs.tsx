import type { ReactNode } from "react";
import React from "react";

type LinkProps = {
  children?: ReactNode;
  href?: string;
  [key: string]: unknown;
};

function noop() {
  return undefined;
}

async function asyncNoop() {
  return undefined;
}

export async function installSampleData() {
  return { projectId: "project_sample", publicId: "prj_sample_preview" };
}

export async function removeSampleData() {
  return { projectId: "project_sample", publicId: "prj_sample_preview" };
}

export async function loadCloudBackupCounts() {
  return {
    alertRules: 3,
    competitors: 2,
    keywords: 24,
    notificationPreferences: 1,
    rankChecks: 180,
    savedViews: 4,
  };
}

export async function updatePresenceInspectionBudget(input: {
  inspectionDailyLimit: number;
  projectId: string;
}) {
  return {
    city: null,
    country: "Poland",
    cronExpression: null,
    device: "desktop",
    frequency: "daily",
    inspectionDailyLimit: input.inspectionDailyLimit,
    jitterMinutes: 60,
    locationKey: "PL",
    projectId: input.projectId,
    serpDepth: 100,
    serpStopOnMatch: true,
    timezone: "Europe/Warsaw",
  };
}

export default function Link({ children, href = "#", ...props }: LinkProps) {
  return React.createElement("a", { ...props, href }, children);
}

export function useRouter() {
  return {
    back: noop,
    forward: noop,
    prefetch: asyncNoop,
    push: noop,
    refresh: noop,
    replace: noop,
  };
}

export function usePathname() {
  return "/app/overview";
}

export function useParams() {
  return {};
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function redirect() {
  return undefined;
}

export function notFound() {
  return undefined;
}

export function revalidatePath() {
  return undefined;
}

export function revalidateTag() {
  return undefined;
}

export function unstable_cache<T extends (...args: never[]) => unknown>(callback: T) {
  return callback;
}

export function cookies() {
  return {
    delete: noop,
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: noop,
  };
}

export function headers() {
  return new Headers();
}

export function createHash() {
  return {
    digest: () => "preview_hash",
    update() {
      return this;
    },
  };
}

export function createHmac() {
  return {
    digest: () => "preview_hmac",
    update() {
      return this;
    },
  };
}

function createCipherStub() {
  return {
    final: () => "",
    getAuthTag: () => new Uint8Array(16),
    setAAD() {
      return this;
    },
    setAuthTag() {
      return this;
    },
    update() {
      return "";
    },
  };
}

export function createCipheriv() {
  return createCipherStub();
}

export function createDecipheriv() {
  return createCipherStub();
}

export function isIP() {
  return 0;
}

export function isIPv6(value = "") {
  return value.includes(":");
}

export async function lookup(hostname: string, options?: { all?: boolean }) {
  const result = { address: hostname, family: isIPv6(hostname) ? 6 : 4 };

  return options?.all ? [result] : result;
}

export function randomBytes(size = 16) {
  return {
    toString: () => "0".repeat(size * 2),
  };
}

export function randomUUID() {
  return "00000000-0000-4000-8000-000000000000";
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength;
}

export class AsyncLocalStorage<TStore = unknown> {
  disable() {
    return undefined;
  }

  enterWith() {
    return undefined;
  }

  getStore(): TStore | undefined {
    return undefined;
  }

  run<TResult>(_store: TStore, callback: () => TResult): TResult {
    return callback();
  }
}

export class AsyncResource {
  emitDestroy() {
    return this;
  }

  runInAsyncScope<TResult>(callback: () => TResult): TResult {
    return callback();
  }
}

export function createClient() {
  return {
    connect: asyncNoop,
    duplicate: () => createClient(),
    eval: asyncNoop,
    get: asyncNoop,
    on: noop,
    publish: asyncNoop,
    quit: asyncNoop,
    set: asyncNoop,
    subscribe: asyncNoop,
  };
}

export class Redis {
  publish() {
    return Promise.resolve(0);
  }

  subscribe() {
    return Promise.resolve();
  }
}

export class Ratelimit {
  static fixedWindow() {
    return {};
  }

  limit() {
    return Promise.resolve({
      limit: 0,
      pending: Promise.resolve(),
      remaining: 0,
      reset: Date.now(),
      success: true,
    });
  }
}

export class ApplicationFailure extends Error {}

export class Client {}

export class Connection {
  static connect() {
    return new Connection();
  }

  close() {
    return Promise.resolve();
  }
}

export class NativeConnection {
  static connect() {
    return new NativeConnection();
  }

  close() {
    return Promise.resolve();
  }
}

export class ScheduleAlreadyRunning extends Error {}

export class ScheduleNotFoundError extends Error {}

export const ScheduleOverlapPolicy = {
  ALLOW_ALL: "ALLOW_ALL",
  BUFFER_ALL: "BUFFER_ALL",
  BUFFER_ONE: "BUFFER_ONE",
  CANCEL_OTHER: "CANCEL_OTHER",
  SKIP: "SKIP",
  TERMINATE_OTHER: "TERMINATE_OTHER",
};

export class Worker {
  static create() {
    return new Worker();
  }

  run() {
    return Promise.resolve();
  }
}

export function proxyActivities() {
  return {};
}

export const ENABLED_SOCIAL_PROVIDERS = {
  github: false,
  google: false,
};

const authSuccess = { data: {}, error: null };

export const authClient = {
  emailOtp: {
    sendVerificationOtp: async () => authSuccess,
  },
  linkSocial: async () => authSuccess,
  signIn: {
    emailOtp: async () => authSuccess,
    social: async () => authSuccess,
  },
  signOut: async () => authSuccess,
  twoFactor: {
    disable: async () => authSuccess,
    enable: async () => ({
      data: { totpURI: "otpauth://totp/Bisibility:preview@example.com?secret=PREVIEW" },
      error: null,
    }),
    generateBackupCodes: async () => ({
      data: { backupCodes: ["preview-code"] },
      error: null,
    }),
    verifyTotp: async () => authSuccess,
  },
  useSession: () => ({ data: null, isPending: false }),
};

export const auth = {
  api: {
    sendVerificationOTP: asyncNoop,
  },
};

export async function getSession() {
  return null;
}

export async function requireSession() {
  return {
    session: { id: "session_preview" },
    user: { email: "preview@example.com", id: "user_preview", name: "Preview User" },
  };
}

export function envInt(_name: string, fallback: number) {
  return fallback;
}

const limitSuccess = {
  headers: new Headers(),
  limit: 1,
  remaining: 1,
  resetAt: Date.now() + 60_000,
  success: true,
};

export async function consume() {
  return limitSuccess;
}

export async function peek() {
  return limitSuccess;
}

export async function checkRateLimit() {
  return limitSuccess;
}

export function rateLimitExceeded() {
  return new Response(null, { status: 429 });
}

export function redisConfigured() {
  return false;
}

export async function getRedisClient() {
  return createClient();
}

export async function createRedisSubscriber() {
  return null;
}

export function resetRedisClientForTests() {
  return undefined;
}

export async function resendSignInOtp(email: string) {
  return { email, ok: true, retryAfter: 60 };
}

export function unwrapActionResult<T>(result: {
  error?: { message?: string };
  ok: boolean;
  value?: T;
}) {
  if (result.ok) return result.value as T;
  throw new Error(result.error?.message ?? "Action failed.");
}

export function unwrapActionFailureResult<T>(result: T) {
  return result;
}

export async function joinWaitlist(input: { email?: string }) {
  return { email: input.email ?? "preview@example.com" };
}

export type KeywordHit = { id: string; label: string };

export async function searchKeywords(): Promise<KeywordHit[]> {
  return [];
}

export async function getNotificationBellData() {
  return { items: [], unreadCount: 0 };
}

export async function markAllNotificationsRead() {
  return { updated: 0 };
}

export async function markNotificationRead() {
  return { updated: 0 };
}

export async function createCloudMigrationHandoff() {
  return {
    apiImportUrl: "https://bisibility.com/api/v1/cloud/import",
    apiRequest:
      "POST https://bisibility.com/api/v1/cloud/import\nAuthorization: Bearer mig_...\nContent-Type: application/json",
    cloudImportUrl: "https://bisibility.com/cloud/import?ctx=preview",
    cloudWorkspaceUrl: "https://bisibility.com/app/overview",
  };
}

export async function getCloudMigrationCompatibility() {
  return {
    appVersion: "preview",
    appVersionSource: "storybook",
    cloudOrigin: "https://bisibility.com",
    data: { keywords: 3, rankChecks: 12 },
    limits: { pushMaxKeywords: 500, sessionsRequired: false },
    schema: { count: 1, latest: "preview" },
  };
}

export async function preflightMigrationTarget() {
  return {
    appVersion: "preview",
    latestMigration: "preview",
    reachable: true,
    schemaVersionsSupported: [1, 2, 3],
    supportsSessions: true,
  };
}

export async function exportCloudImportPackage() {
  return {
    content: JSON.stringify({ keywords: [{ id: "kw_preview", keyword: "preview" }] }),
    counts: { keywords: 1, rankChecks: 0 },
    filename: "bisibility-preview-export.json",
    mimeType: "application/json",
  };
}

export async function transferCloudImportPackage() {
  return { counts: { keywords: 1 }, jobId: "job_preview", state: "done" };
}

export async function planChunkedTransfer() {
  return { chunkCount: 2, totalKeywords: 3, totalRankChecks: 12, useSessions: false };
}

export async function createRemoteImportSession() {
  return { chunkLimits: { maxHistoryRows: 5000, maxKeywords: 500 }, sessionId: "session_preview" };
}

export async function exportAndTransferChunk() {
  return { chunksReceived: 1, done: true, nextCursor: null };
}

export async function transferSectionsChunk() {
  return { chunksReceived: 2 };
}

export async function finalizeRemoteImportSession() {
  return { counts: { keywords: 3 }, jobId: "job_preview", state: "done" };
}

export async function getAlertCtaTargets() {
  return {
    keywordHref: "/app/keywords/kw_preview",
    serpUrl: "https://example.com",
    targetUrl: null,
  };
}

export async function completeGooglePropertySelection(input: { property: string }) {
  return { property: input.property };
}

export async function testConnection() {
  return { balance: 1000, message: "Preview connection OK", ok: true };
}

export async function syncProjectTraffic() {
  return {
    connections: 1,
    keywordSnapshots: 12,
    pageSnapshots: 4,
    runs: [{ status: "succeeded_with_data" }],
  };
}

export const addManagedCompetitor = asyncNoop;
export const addKeywords = asyncNoop;
export const bulkDeleteKeywords = asyncNoop;
export const bulkSetFrequency = asyncNoop;
export const bulkSetTargetUrl = asyncNoop;
export const bulkTagKeywords = asyncNoop;
export const changeMemberRole = asyncNoop;
export const connectProvider = asyncNoop;
export const createAlertRule = asyncNoop;
export const createCloudMigrationHandoffAction = asyncNoop;
export const createCloudImportWorkspace = asyncNoop;
export const createKeywordAlertRule = asyncNoop;
export const createProject = asyncNoop;
export const createOnboardingProject = asyncNoop;
export const createSavedView = asyncNoop;
export const createSlackInstallUrl = asyncNoop;
export const deleteAlertRule = asyncNoop;
export const deleteSavedView = asyncNoop;
export const deleteTag = asyncNoop;
export const deleteWorkspace = asyncNoop;
export const disconnectProvider = asyncNoop;
export const exportKeywords = asyncNoop;
export const getActionActor = asyncNoop;
export const importKeywordsFromCsv = asyncNoop;
export const inviteMember = asyncNoop;
export const issueApiKey = asyncNoop;
export const markProjectAlertsRead = asyncNoop;
export const muteTriggeredAlert = asyncNoop;
export const previewKeywordImportFile = asyncNoop;
export const regenerateApiKey = asyncNoop;
export const removeManagedCompetitor = asyncNoop;
export const removeMember = asyncNoop;
export const requireProjectScope = asyncNoop;
export const resendInvite = asyncNoop;
export const renameManagedCompetitor = asyncNoop;
export const renameTag = asyncNoop;
export const revokeApiKey = asyncNoop;
export const revokeInvite = asyncNoop;
export const runCheckNow = asyncNoop;
export const runManualProjectCheck = asyncNoop;
export const saveMatchingScope = asyncNoop;
export const setAlertRuleEnabled = asyncNoop;
export const setAlertKeywordTargetUrl = asyncNoop;
export const setPrimaryProvider = asyncNoop;
export const switchWorkspace = asyncNoop;
export const transferOwnership = asyncNoop;
export const updateAvatar = asyncNoop;
export const updateDefaultRankCheckSettings = asyncNoop;
export const updateAlertRule = asyncNoop;
export const updateKeyword = asyncNoop;
export const updateNotificationPreferences = asyncNoop;
export const updateProfileName = asyncNoop;
export const updateProject = asyncNoop;
export const updateProjectDetails = asyncNoop;
export const updateProjectSchedule = asyncNoop;
export const updateProjectTrackingScope = asyncNoop;
export const updateProviderCost = asyncNoop;
export const updateProviderRate = asyncNoop;
export const updateProviderSettings = asyncNoop;
export const updateRankCheckFrequency = asyncNoop;
