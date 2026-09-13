import "server-only";

import { readDemoConfig } from "./config";
import { loadConfiguredDemoActor } from "./identity";

export type DemoAccountView = "locked" | "normal";

export async function resolveDemoAccountView(userId: string): Promise<DemoAccountView> {
  const config = readDemoConfig();
  if (config.kind === "disabled") return "normal";

  const actor = await loadConfiguredDemoActor(userId);
  return config.kind === "editable" && actor?.kind === "owner" ? "normal" : "locked";
}
