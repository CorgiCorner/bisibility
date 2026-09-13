import { isPublicIdOfType } from "@/lib/db/public-id";

export const DEMO_ENTRY_CODE = "000000";
export const DEMO_ACCOUNT_LOCKED = "Account settings are locked in this demo.";
export const DEMO_IDENTITY_PRESERVED = "The demo Owner, Viewer, and project cannot be deleted.";

type DemoEnvironment = Record<string, string | undefined>;

export type DemoConfig =
  | { kind: "disabled" }
  | { kind: "legacy-read-only"; projectPublicId: string; viewerPublicId: string }
  | { kind: "editable"; ownerPublicId: string; projectPublicId: string; viewerPublicId: string };

function readViewerAndProject(env: DemoEnvironment) {
  const viewerPublicId = env.DEMO_USER_ID ?? "";
  const projectPublicId = env.DEMO_PROJECT_ID ?? "";
  if (!isPublicIdOfType(viewerPublicId, "usr") || !isPublicIdOfType(projectPublicId, "prj")) {
    throw new Error("Demo requires valid DEMO_USER_ID and DEMO_PROJECT_ID.");
  }
  return { projectPublicId, viewerPublicId };
}

export function readDemoConfig(env: DemoEnvironment = process.env): DemoConfig {
  const mode = env.DEMO_MODE ?? "";
  const legacy = env.READ_ONLY_DEMO === "1";
  if (legacy && mode) throw new Error("Demo mode cannot be combined with READ_ONLY_DEMO=1.");
  if (!legacy && !mode) return { kind: "disabled" };
  if (env.DEMO_FIXED_OTP === "1" || env.ALLOW_INSECURE_FIXED_OTP === "1") {
    throw new Error("Demo must not enable global fixed-code authentication.");
  }
  const viewer = readViewerAndProject(env);
  if (legacy) return { kind: "legacy-read-only", ...viewer };
  if (mode !== "editable") throw new Error("DEMO_MODE must be editable when set.");
  const ownerPublicId = env.DEMO_OWNER_ID ?? "";
  if (!isPublicIdOfType(ownerPublicId, "usr") || ownerPublicId === viewer.viewerPublicId) {
    throw new Error("Editable demo requires distinct valid DEMO_OWNER_ID and DEMO_USER_ID.");
  }
  return { kind: "editable", ownerPublicId, ...viewer };
}

export function readOnlyDemoConfig(env: DemoEnvironment = process.env) {
  const config = readDemoConfig(env);
  if (config.kind !== "legacy-read-only") return null;
  return { projectPublicId: config.projectPublicId, userPublicId: config.viewerPublicId };
}

export function assertDemoAccountMutable() {
  if (readDemoConfig().kind !== "disabled") throw new Error(DEMO_ACCOUNT_LOCKED);
}
