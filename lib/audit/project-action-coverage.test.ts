import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { declaredAuditActions } from "@/lib/auth/audit-field-declarations";
import ts from "@typescript/typescript6";
import { describe, expect, it, vi } from "vitest";
import { auditEventMessageKeyFor } from "./event-presentation";

vi.mock("server-only", () => ({}));

// Reviewed writers omit projectId or explicitly set null. Do not exclude action prefixes:
// even instance_admin.metering_history_closed writes a project row.
const instanceOnlyActions = new Set([
  "account.achievements_preferences",
  "account.achievements_sharing",
  "account.analytics_consent_updated",
  "account.apple_tokens_revoked",
  "account.avatar_updated",
  "account.connected_app_revoked",
  "account.deleted",
  "account.email_change_code_requested",
  "account.email_change_requested",
  "account.email_changed",
  "account.email_verification_requested",
  "account.email_verified",
  "account.profile_updated",
  "account.session_revoked",
  "account.sessions_revoked",
  "account.two_factor_backup_codes_regenerated",
  "account.two_factor_disabled",
  "account.two_factor_enabled",
  "account.two_factor_enrollment_started",
  "account.two_factor_enrollment_verification_failed",
  "account.two_factor_replaced",
  "account.two_factor_replacement_started",
  "account.two_factor_step_up_failed",
  "audit_log.purge",
  "instance_admin.account_deactivate_blocked",
  "instance_admin.account_deactivate_failed",
  "instance_admin.account_deactivate_rate_limited",
  "instance_admin.account_deactivated",
  "instance_admin.account_limits_reset",
  "instance_admin.account_limits_reset_failed",
  "instance_admin.account_limits_reset_rate_limited",
  "instance_admin.account_reactivate_failed",
  "instance_admin.account_reactivate_rate_limited",
  "instance_admin.account_reactivated",
  "instance_admin.account_viewed",
  "instance_admin.announcement_created",
  "instance_admin.announcement_deleted",
  "instance_admin.announcement_toggled",
  "instance_admin.announcement_updated",
  "instance_admin.delete_blocked",
  "instance_admin.first_run_completed",
  "instance_admin.mail_settings.clear",
  "instance_admin.mail_settings.save",
  "instance_admin.metering_recovery_applied",
  "instance_admin.metering_recovery_requested",
  "instance_admin.metering_recovery_triaged",
  "instance_admin.metering_recovery_viewed",
  "instance_admin.metering_viewed",
  "instance_admin.ops_sweep.failed",
  "instance_admin.ops_sweep.rate_limited",
  "instance_admin.ops_sweep.run",
  "instance_admin.ops_test.failed",
  "instance_admin.ops_test.rate_limited",
  "instance_admin.ops_test.send",
  "pat.exchange_login",
  "pat.issue",
  "pat.revoke",
  "rank_check.raw_purge",
  "sample_data.remove",
  "user.date_format.update",
  "user.default_project.update",
  "user.ui_locale.update",
]);

// The existing payload registry includes the unions expanded by dynamic audit writers.
// Literal writer declarations are independently enforced by audit-redaction-canary.test.ts.
describe("project audit action labels", () => {
  for (const locale of ["en", "pl", "es-ES", "ja"]) {
    it(`labels every project-capable declared action in both ${locale} catalogs`, () => {
      const directory = resolve(import.meta.dirname, "../../messages/core", locale);
      const audit = JSON.parse(readFileSync(resolve(directory, "project-audit.json"), "utf8"))
        .projectAudit.presentation.event;
      const advanced = JSON.parse(
        readFileSync(resolve(directory, "project-settings-advanced.json"), "utf8"),
      ).projectSettingsAdvanced.audit.event;
      expect(advanced).toEqual(audit);
      const missing = declaredAuditActions().filter((action) => {
        if (instanceOnlyActions.has(action)) return false;
        const key = auditEventMessageKeyFor(action);
        return !key || typeof audit[key] !== "string" || !audit[key].trim();
      });
      expect(missing).toEqual([]);
    });
  }
});

const root = resolve(import.meta.dirname, "../..");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(path)) &&
      !/\.(test|stories)\.|[.-]test-fixtures?\./.test(path)
      ? [path]
      : [];
  });
}

it("labels literal project writer actions even when absent from the payload registry", () => {
  const missing: string[] = [];
  for (const path of ["app", "components", "lib"].flatMap((directory) =>
    sourceFiles(resolve(root, directory)),
  )) {
    const text = readFileSync(path, "utf8");
    if (!/\b(writeAudit|auditProviderMutation)\b/.test(text)) continue;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^(writeAudit|writeAuditFailure|auditProviderMutation|auditAndRevalidate)$/.test(
          node.expression.text,
        )
      ) {
        const input = node.arguments[0];
        if (input && ts.isObjectLiteralExpression(input)) {
          const project = input.properties.find(
            (property) =>
              (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
              property.name.getText(source) === "projectId",
          );
          const action = input.properties.find(
            (property) =>
              ts.isPropertyAssignment(property) && property.name.getText(source) === "action",
          );
          // Dynamic writers and spread-only wrappers are covered by the existing declaration registry.
          if (
            project &&
            project.getText(source) !== "projectId: null" &&
            action &&
            ts.isPropertyAssignment(action)
          ) {
            function literal(node: ts.Node) {
              if (
                ts.isStringLiteral(node) &&
                /^[a-z_]+\.[a-z_.]+$/.test(node.text) &&
                !auditEventMessageKeyFor(node.text)
              )
                missing.push(`${relative(root, path)}: ${node.text}`);
              ts.forEachChild(node, literal);
            }
            literal(action.initializer);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(missing).toEqual([]);
}, 30_000);
