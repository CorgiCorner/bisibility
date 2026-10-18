import "server-only";
import { readDemoConfig } from "@/lib/demo/config";
import { isCloud } from "@/lib/deployment/deployment";
export function achievementsEnabled() {
  if (readDemoConfig().kind !== "disabled") return false;
  const configured = process.env.ACHIEVEMENTS_ENABLED?.trim() || undefined;
  return configured === undefined ? isCloud : configured === "true" || configured === "1";
}
export function achievementEmailsEnabled() {
  const configured = process.env.ACHIEVEMENTS_EMAIL_ENABLED?.trim() || undefined;
  return (
    achievementsEnabled() &&
    readDemoConfig().kind === "disabled" &&
    (configured === undefined ? isCloud : configured === "true" || configured === "1")
  );
}
