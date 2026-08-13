import type { AlertActionHandlers, TriggeredAlertView } from "@/lib/alerts/alert-data";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsPageContent } from "./AlertsPageContent";
import { keywordScopedAlertRule, makeAlertRule } from "./AlertsPageContent.fixtures";

const mocks = vi.hoisted(() => ({
  getAlertCtaTargets: vi.fn(),
  markProjectAlertsRead: vi.fn(),
  muteTriggeredAlert: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a data-next-link {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/actions/alert-feed", () => ({
  getAlertCtaTargets: mocks.getAlertCtaTargets,
  markProjectAlertsRead: mocks.markProjectAlertsRead,
  muteTriggeredAlert: mocks.muteTriggeredAlert,
}));

const actions: AlertActionHandlers = {
  createAlertRuleAction: vi.fn(),
  deleteAlertRuleAction: vi.fn(),
  deleteWebhookEndpointAction: vi.fn(),
  setAlertRuleEnabledAction: vi.fn(),
  testWebhookEndpointAction: vi.fn(),
  upsertWebhookEndpointAction: vi.fn(),
  updateAlertRuleAction: vi.fn(),
};

const alerts: TriggeredAlertView[] = [
  {
    action: "Investigate the changed SERP.",
    ctas: ["Open keyword"],
    current: "#8",
    deliveryAttempts: [
      {
        channel: "email",
        error: "Email delivery has no enabled recipients.",
        status: "failed",
        webhookEndpointId: null,
        webhookEndpointLabel: null,
        when: "4m ago",
      },
    ],
    deliveryState: "dead_letter",
    headline: "Ranking dropped",
    id: "al_abcdefghijklmnopqrstuvwx",
    keyword: "rank tracker",
    location: "United States",
    device: "desktop",
    previous: "#3",
    rule: "Slipped",
    severity: "urgent",
    unread: true,
    when: "5m ago",
  },
];

function renderAlerts({
  firedInWindowCount = alerts.length,
  gscConnected = false,
  initialAlerts = alerts,
  canCreate = true,
  canDelete = true,
  canManage = true,
  canReadAudit = true,
  canUpdate = true,
  rules = [],
  snoozedInWindowCount = 0,
  templates = [],
}: {
  firedInWindowCount?: number;
  gscConnected?: boolean;
  initialAlerts?: TriggeredAlertView[];
  canCreate?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
  canReadAudit?: boolean;
  canUpdate?: boolean;
  rules?: Parameters<typeof AlertsPageContent>[0]["rules"];
  snoozedInWindowCount?: number;
  templates?: Parameters<typeof AlertsPageContent>[0]["templates"];
} = {}) {
  render(
    <AlertsPageContent
      actions={actions}
      alerts={initialAlerts}
      canCreate={canCreate}
      canDelete={canDelete}
      canManage={canManage}
      canReadAudit={canReadAudit}
      canUpdate={canUpdate}
      firedInWindowCount={firedInWindowCount}
      gscConnected={gscConnected}
      gscInstallHref="/api/integrations/google/install?provider=gsc&projectId=prj_abcdefghijklmnopqrstuvwx"
      hasTrackedKeywords
      projectId="prj_abcdefghijklmnopqrstuvwx"
      projectRef="prj_abcdefghijklmnopqrstuvwx"
      rules={rules}
      snoozedInWindowCount={snoozedInWindowCount}
      targets={{ keywords: [], members: [], tags: [] }}
      templates={templates}
    />,
  );
}

describe("AlertsPageContent optimistic rollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markProjectAlertsRead.mockResolvedValue({ updated: 1 });
    mocks.muteTriggeredAlert.mockResolvedValue({ muted: true });
  });

  it("rolls back mark-all-read state and surfaces the failure", async () => {
    mocks.markProjectAlertsRead.mockRejectedValueOnce(new Error("failed"));
    renderAlerts();

    const markAllRead = screen.getByRole("button", { name: /mark all read/i });
    fireEvent.click(markAllRead);

    await waitFor(() =>
      expect(screen.getByText("Could not mark alerts read. Try again.")).toBeInTheDocument(),
    );
    expect(markAllRead).not.toBeDisabled();
  });

  it("renders the triggering keyword's real location and device in the meta line", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          keyword: "rank tracker",
          location: "Warsaw, Poland",
          device: "mobile",
        },
      ],
    });

    const meta = screen.getByText(/Google \/ Warsaw, Poland \/ Mobile \/ 5m ago/);
    expect(meta).toBeInTheDocument();
    expect(meta.textContent).not.toContain("US");
    expect(meta.textContent).not.toContain("Desktop");
  });

  it("renders distinct meta lines for alerts with different keyword markets", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          id: "al_aaaaaaaaaaaaaaaaaaaaaaaa",
          keyword: "rank tracker",
          location: "Warsaw, Poland",
          device: "mobile",
        },
        {
          ...alerts[0],
          id: "al_bbbbbbbbbbbbbbbbbbbbbbbb",
          keyword: "best CRM",
          location: "London, United Kingdom",
          device: "desktop",
        },
      ],
    });

    expect(screen.getByText(/Google \/ Warsaw, Poland \/ Mobile \/ 5m ago/)).toBeInTheDocument();
    expect(
      screen.getByText(/Google \/ London, United Kingdom \/ Desktop \/ 5m ago/),
    ).toBeInTheDocument();
  });

  it("renders the terminal delivery state and its affected channel", () => {
    renderAlerts();

    expect(screen.getByText("Delivery: Failed / dead letter")).toBeInTheDocument();
    expect(
      screen.getByText("Email failed: Email delivery has no enabled recipients. / 4m ago"),
    ).toBeInTheDocument();
  });

  it("identifies the webhook endpoint in the delivery log", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [
            {
              channel: "webhook",
              error: null,
              status: "sent",
              webhookEndpointId: "we_abcdefghijklmnopqrstuvwx",
              webhookEndpointLabel: "Primary alerts",
              when: "4m ago",
            },
          ],
        },
      ],
    });

    expect(screen.getByText("Webhook sent (Primary alerts) / 4m ago")).toBeInTheDocument();
  });

  it("labels a removed webhook endpoint without exposing its former id", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [
            {
              channel: "webhook",
              error: "Endpoint removed after delivery.",
              status: "failed",
              webhookEndpointId: null,
              webhookEndpointLabel: "Deleted endpoint",
              when: "4m ago",
            },
          ],
        },
      ],
    });

    expect(
      screen.getByText(
        "Webhook failed (Deleted endpoint): Endpoint removed after delivery. / 4m ago",
      ),
    ).toBeInTheDocument();
  });

  it("restores a snoozed row and surfaces the failure", async () => {
    mocks.muteTriggeredAlert.mockRejectedValueOnce(new Error("failed"));
    renderAlerts();

    fireEvent.click(screen.getByRole("button", { name: /snooze/i }));

    await waitFor(() =>
      expect(screen.getByText("Could not snooze alert. Try again.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Ranking dropped")).toBeInTheDocument();
  });

  it("does not report all clear after the last visible alert is snoozed", async () => {
    renderAlerts();

    fireEvent.click(screen.getByRole("button", { name: /snooze/i }));

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    expect(screen.getByText(/1 alert snoozed in the last 48 hours/i)).toBeInTheDocument();
    expect(screen.queryByText("All clear")).not.toBeInTheDocument();
  });

  it("states only the known active-rule count in the all-clear state", () => {
    const rule = keywordScopedAlertRule;

    renderAlerts({ firedInWindowCount: 0, initialAlerts: [], rules: [rule] });

    expect(screen.getByText(/you have 1 active rule/i)).toBeInTheDocument();
    expect(screen.queryByText(/every tracked keyword/i)).not.toBeInTheDocument();
    expect(screen.getByText("won't fire below top 10")).toBeInTheDocument();
  });

  it("disables the CTR template and links its requirement when GSC is disconnected", () => {
    renderAlerts({
      gscConnected: false,
      templates: [
        { id: "ctr", label: "CTR drop (GSC)", requirement: "Requires GSC", severity: "warning" },
      ],
    });

    expect(screen.getByRole("button", { name: "CTR drop (GSC)" })).toBeDisabled();
    const requirementLink = screen.getByRole("link", { name: "Requires GSC" });
    expect(requirementLink).toHaveAttribute(
      "href",
      "/api/integrations/google/install?provider=gsc&projectId=prj_abcdefghijklmnopqrstuvwx",
    );
    expect(requirementLink).not.toHaveAttribute("data-next-link");
  });

  it("enables the CTR template without a requirement link when GSC is connected", () => {
    renderAlerts({
      gscConnected: true,
      templates: [
        { id: "ctr", label: "CTR drop (GSC)", requirement: "Requires GSC", severity: "warning" },
      ],
    });

    expect(screen.getByRole("button", { name: "CTR drop (GSC)" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Requires GSC" })).not.toBeInTheDocument();
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders audit navigation for the %s role at the audit threshold",
    (role) => {
      const canReadAudit = canReadProjectAudit(role);

      renderAlerts({ canReadAudit });

      expect(Boolean(screen.queryByRole("link", { name: "View audit log" }))).toBe(canReadAudit);
    },
  );

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders alert mutation affordances for the %s role at the matrix threshold",
    (role) => {
      const rule = makeAlertRule();
      const canCreate = canProjectAction(role, "create", "alert_rule");
      const canUpdate = canProjectAction(role, "update", "alert_rule");
      const canDelete = canProjectAction(role, "delete", "alert_rule");

      renderAlerts({
        canCreate,
        canDelete,
        canManage: canProjectAction(role, "manage", "webhook_endpoint"),
        canUpdate,
        firedInWindowCount: 0,
        initialAlerts: [],
        rules: [rule],
      });

      expect(screen.queryAllByRole("button", { name: "New rule" }).length > 0).toBe(canCreate);
      expect(Boolean(screen.queryByRole("switch", { name: "Pause rule" }))).toBe(canUpdate);
      expect(Boolean(screen.queryByRole("button", { name: "Edit Ranking drop" }))).toBe(canUpdate);
      expect(Boolean(screen.queryByRole("button", { name: "Delete Ranking drop" }))).toBe(
        canDelete,
      );
    },
  );
});
