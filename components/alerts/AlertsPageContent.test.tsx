import { renderWithAlertMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { AlertActionHandlers, TriggeredAlertFeedView } from "@/lib/alerts/alert-data";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsPageContent } from "./AlertsPageContent";
import { keywordScopedAlertRule, makeAlertRule } from "./AlertsPageContent.fixtures";

const mocks = vi.hoisted(() => ({
  getAlertCtaTargets: vi.fn(),
  markProjectAlertsRead: vi.fn(),
  muteTriggeredAlert: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/components/ui/toast-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/toast-context")>()),
  useToast: () => ({ showToast: mocks.showToast }),
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

const alerts: TriggeredAlertFeedView[] = [
  {
    afterPosition: 8,
    beforePosition: 3,
    condition: {
      changePct: null,
      competitorDomain: null,
      dropPositions: 5,
      serpFeature: null,
      thresholdPosition: null,
      topN: null,
    },
    conditionType: "position_drop",
    deliveryAttempts: [
      {
        attemptedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
        channel: "email",
        error: "Email delivery has no enabled recipients.",
        status: "failed",
        webhookEndpoint: null,
      },
    ],
    deliveryState: "dead_letter",
    firedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    id: "al_abcdefghijklmnopqrstuvwx",
    keyword: "rank tracker",
    device: "desktop",
    rule: "Slipped",
    severity: "urgent",
    unread: true,
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
  initialAlerts?: TriggeredAlertFeedView[];
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
      targets={{ keywords: [], markets: [], members: [], tags: [] }}
      templates={templates}
    />,
  );
}

describe("AlertsPageContent optimistic rollback", () => {
  it("requires confirmation with the whole-team project scope before acknowledging", async () => {
    renderAlerts();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge all" }));
    expect(mocks.markProjectAlertsRead).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("whole team in project");
    expect(dialog).toHaveTextContent("Alerts to acknowledge: 1.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Acknowledge all" }));
    await waitFor(() => expect(mocks.markProjectAlertsRead).toHaveBeenCalledOnce());
  });

  it("keeps mutating feed controls disabled for viewers", () => {
    renderAlerts({ canUpdate: false });
    expect(screen.getByRole("button", { name: "Acknowledge all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Snooze for 24 h" })).toBeDisabled();
    expect(mocks.markProjectAlertsRead).not.toHaveBeenCalled();
    expect(mocks.muteTriggeredAlert).not.toHaveBeenCalled();
  });

  it("shows all rule channels rather than just the first", () => {
    renderAlerts({ rules: [makeAlertRule({ channels: ["email", "push", "slack", "webhook"] })] });
    const rule = screen.getByRole("heading", { name: "Ranking drop" }).closest("article");
    if (!rule) throw new Error("Missing rule");
    for (const channel of ["Email", "Mobile push", "Slack", "Webhook"]) {
      expect(within(rule).getByText(channel)).toBeInTheDocument();
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markProjectAlertsRead.mockResolvedValue({ updated: 1 });
    mocks.muteTriggeredAlert.mockResolvedValue({ muted: true });
  });

  it("confirms rule deletion, blocks repeats, and reports rejection", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(actions.deleteAlertRuleAction).mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const rule = makeAlertRule();
    renderAlerts({ rules: [rule] });
    fireEvent.click(screen.getByRole("button", { name: `Delete ${rule.name}` }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(rule.name)).toBeInTheDocument();
    expect(within(dialog).getByText(/alert history/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(actions.deleteAlertRuleAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Delete ${rule.name}` }));
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Delete rule" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(actions.deleteAlertRuleAction).toHaveBeenCalledOnce();
    await act(async () => reject(new Error("failed")));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not confirm whether this rule was deleted. Refresh to check its current state.",
    );
    expect(
      Array.from(document.querySelectorAll("article h3"), (heading) => heading.textContent),
    ).toContain(rule.name);
  });

  it("announces a confirmed rule deletion and moves focus to the rules heading", async () => {
    vi.mocked(actions.deleteAlertRuleAction).mockResolvedValueOnce({ deleted: 1 });
    const rule = makeAlertRule();
    renderAlerts({ rules: [rule] });
    const trigger = screen.getByRole("button", { name: `Delete ${rule.name}` });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete rule" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.showToast).toHaveBeenCalledWith("Alert rule deleted", { severity: "success" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Alert rules" })),
    );
  });

  it("returns focus to the delete button when deletion is cancelled", async () => {
    const rule = makeAlertRule();
    renderAlerts({ rules: [rule] });
    const trigger = screen.getByRole("button", { name: `Delete ${rule.name}` });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it("does not show the live evaluation caption", () => {
    renderAlerts();

    expect(
      screen.queryByText(/rules evaluated after each completed rank check/i),
    ).not.toBeInTheDocument();
  });

  it("rolls back mark-all-read state and surfaces the failure", async () => {
    mocks.markProjectAlertsRead.mockRejectedValueOnce(new Error("failed"));
    renderAlerts();

    const markAllRead = screen.getByRole("button", { name: /acknowledge all/i });
    fireEvent.click(markAllRead);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Acknowledge all" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Could not acknowledge alerts. Try again.")).toBeInTheDocument(),
    );
    expect(markAllRead).not.toBeDisabled();
  });

  it("renders the triggering keyword's real location and device in the meta line", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          keyword: "rank tracker",
          device: "mobile",
          feedMeta: {
            engine: "Google",
            market: { id: "pmkt_warsaw", label: "Warsaw, Poland" },
            severity: "urgent",
            source: "RANK",
          },
        },
      ],
    });

    expect(screen.getByText("Rank tracking")).toBeInTheDocument();
    expect(screen.getByText("Warsaw, Poland")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.queryByText("/", { exact: true })).toBeNull();
  });

  it("renders distinct meta lines for alerts with different keyword markets", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          id: "al_aaaaaaaaaaaaaaaaaaaaaaaa",
          keyword: "rank tracker",
          device: "mobile",
          feedMeta: {
            engine: "Google",
            market: { id: "pmkt_warsaw", label: "Warsaw, Poland" },
            severity: "urgent",
            source: "RANK",
          },
        },
        {
          ...alerts[0],
          id: "al_bbbbbbbbbbbbbbbbbbbbbbbb",
          keyword: "best CRM",
          device: "desktop",
          feedMeta: {
            engine: "Google",
            market: { id: "pmkt_london", label: "London, United Kingdom" },
            severity: "urgent",
            source: "RANK",
          },
        },
      ],
    });

    expect(screen.getByText("Warsaw, Poland")).toBeInTheDocument();
    expect(screen.getByText("London, United Kingdom")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
  });

  it("shows partial acceptance as X/Y and team acknowledgement attribution", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          unread: false,
          acknowledgedAt: new Date().toISOString(),
          acknowledgedByName: "Team member",
          deliveryState: "digested",
          deliveryAttempts: [
            {
              ...alerts[0].deliveryAttempts[0],
              status: "partial",
              error: null,
              counts: { acceptedCount: 1, failedCount: 1, unknownCount: 1 },
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Partial acceptance")).toBeInTheDocument();
    expect(screen.getByText("1/3 accepted (1 failed, 1 unknown)")).toBeInTheDocument();
    expect(screen.getByText(/Acknowledged by Team member,/)).toBeInTheDocument();
  });

  it("shows a digest summary on a peer alert with no representative attempt", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [],
          deliveryState: "digested",
          deliverySummary: [
            {
              channel: "email",
              counts: { acceptedCount: 1, failedCount: 1, unknownCount: 0 },
              status: "partial",
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Partial acceptance")).toBeInTheDocument();
    expect(screen.getByText("1/2 accepted (1 failed, 0 unknown)")).toBeInTheDocument();
  });

  it("shows unknown digest acceptance without inventing a device count", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [],
          deliveryState: "dead_letter",
          deliverySummary: [{ channel: "push", status: "unknown" }],
        },
      ],
    });
    expect(screen.getByText("Delivery: Acceptance unknown")).toBeInTheDocument();
    expect(screen.queryByText(/0\/0 accepted/)).not.toBeInTheDocument();
  });

  it.each([
    ["failed", "Delivery: Partial acceptance"],
    ["unknown", "Delivery: Acceptance unknown"],
    ["sent", "Delivery: Delivered"],
  ] as const)("classifies an older %s recipient outside the display log", (status, heading) => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryState: "delivered",
          deliveryAttempts: Array.from({ length: 3 }, () => ({
            ...alerts[0].deliveryAttempts[0],
            error: null,
            status: "sent",
          })),
          deliveryOutcomes: [
            { channel: "email", status },
            ...Array.from({ length: 3 }, () => ({ channel: "email" as const, status: "sent" })),
          ],
        },
      ],
    });
    expect(screen.getByText(heading)).toHaveClass(
      status === "sent" ? "text-green-text" : "text-yellow-text",
    );
    if (status !== "sent")
      expect(screen.queryByText("Delivery: Delivered")).not.toBeInTheDocument();
  });

  it.each([
    ["failed", "Failed", "Partial acceptance"],
    ["skipped", "Skipped", "Partial acceptance"],
    ["unknown", "Status: unknown", "Acceptance unknown"],
  ])("shows a status-only %s push summary on a digest peer", (status, label, overall) => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [],
          deliveryState: "digested",
          deliverySummary: [
            {
              channel: "email",
              counts: { acceptedCount: 2, failedCount: 0, unknownCount: 0 },
              status: "sent",
            },
            { channel: "push", status },
          ],
        },
      ],
    });
    expect(screen.getByText(`Delivery: ${overall}`)).toHaveClass("text-yellow-text");
    expect(screen.getByText(`Mobile push: ${label}`)).toBeInTheDocument();
    expect(screen.getByText("2/2 accepted (0 failed, 0 unknown)")).toBeInTheDocument();
    expect(screen.queryByText("Delivery: Delivered in digest")).not.toBeInTheDocument();
    expect(screen.queryByText(/0\/0 accepted/)).not.toBeInTheDocument();
  });

  it("shows measured push failure alongside accepted digest email as incomplete", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [],
          deliveryState: "digested",
          deliverySummary: [
            {
              channel: "email",
              counts: { acceptedCount: 2, failedCount: 0, unknownCount: 0 },
              status: "sent",
            },
            {
              channel: "push",
              counts: { acceptedCount: 0, failedCount: 3, unknownCount: 0 },
              status: "failed",
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Partial acceptance")).toHaveClass("text-yellow-text");
    expect(screen.getByText("0/3 accepted (3 failed, 0 unknown)")).toBeInTheDocument();
  });

  it("keeps a fully accepted digest successful with a status-only accepted channel", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [],
          deliveryState: "digested",
          deliverySummary: [{ channel: "email", status: "sent" }],
        },
      ],
    });
    expect(screen.getByText("Delivery: Delivered in digest")).toHaveClass("text-green-text");
    expect(screen.getByText("Email: Sent")).toBeInTheDocument();
  });

  it.each([
    { status: "failed", counts: { acceptedCount: 0, failedCount: 3, unknownCount: 0 } },
    { status: "failed" },
    { status: "skipped" },
  ])("shows immediate email success plus push $status as incomplete ($counts)", (outcome) => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryState: "delivered",
          deliveryAttempts: [
            { ...alerts[0].deliveryAttempts[0], error: null, status: "sent" },
            { ...alerts[0].deliveryAttempts[0], channel: "push", ...outcome },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Partial acceptance")).toHaveClass("text-yellow-text");
    expect(screen.queryByText("Delivery: Delivered")).not.toBeInTheDocument();
    if (outcome.counts) {
      expect(screen.getByText("0/3 accepted (3 failed, 0 unknown)")).toBeInTheDocument();
    }
  });

  it("shows immediate unknown email plus accepted push as unknown", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryState: "delivered",
          deliveryAttempts: [
            { ...alerts[0].deliveryAttempts[0], error: null, status: "unknown" },
            {
              ...alerts[0].deliveryAttempts[0],
              channel: "push",
              counts: { acceptedCount: 3, failedCount: 0, unknownCount: 0 },
              error: null,
              status: "sent",
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Acceptance unknown")).toHaveClass("text-yellow-text");
    expect(screen.queryByText("Delivery: Delivered")).not.toBeInTheDocument();
    expect(screen.getByText("3/3 accepted (0 failed, 0 unknown)")).toBeInTheDocument();
  });

  it.each(["failed", "partial", "unknown"])(
    "keeps immediate delivery successful after a recovered %s push retry",
    (status) => {
      renderAlerts({
        initialAlerts: [
          {
            ...alerts[0],
            deliveryState: "delivered",
            deliveryAttempts: [
              {
                ...alerts[0].deliveryAttempts[0],
                attemptedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
                channel: "push",
                counts: { acceptedCount: 0, failedCount: 1, unknownCount: 1 },
                status,
              },
              { ...alerts[0].deliveryAttempts[0], error: null, status: "sent" },
              {
                ...alerts[0].deliveryAttempts[0],
                channel: "push",
                counts: { acceptedCount: 3, failedCount: 0, unknownCount: 0 },
                error: null,
                status: "sent",
              },
            ],
          },
        ],
      });
      expect(screen.getByText("Delivery: Delivered")).toHaveClass("text-green-text");
      expect(screen.queryByText("Delivery: Partial acceptance")).not.toBeInTheDocument();
      expect(screen.queryByText("Delivery: Acceptance unknown")).not.toBeInTheDocument();
      expect(screen.getByText("3/3 accepted (0 failed, 0 unknown)")).toBeInTheDocument();
    },
  );

  it("keeps fully accepted immediate email and push successful", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryState: "delivered",
          deliveryAttempts: [
            { ...alerts[0].deliveryAttempts[0], error: null, status: "sent" },
            {
              ...alerts[0].deliveryAttempts[0],
              channel: "push",
              counts: { acceptedCount: 3, failedCount: 0, unknownCount: 0 },
              error: null,
              status: "sent",
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Delivered")).toHaveClass("text-green-text");
    expect(screen.getByText("3/3 accepted (0 failed, 0 unknown)")).toBeInTheDocument();
  });

  it("keeps a different failed webhook endpoint incomplete after another endpoint succeeds", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryState: "delivered",
          deliveryAttempts: [
            {
              ...alerts[0].deliveryAttempts[0],
              channel: "webhook",
              error: null,
              status: "sent",
              webhookEndpoint: { id: "we_abcdefghijklmnopqrstuvwx", label: "Primary alerts" },
            },
            {
              ...alerts[0].deliveryAttempts[0],
              attemptedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
              channel: "webhook",
              webhookEndpoint: { id: "we_zyxwvutsrqponmlkjihgfedc", label: "Secondary alerts" },
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Partial acceptance")).toHaveClass("text-yellow-text");
    expect(screen.queryByText("Delivery: Delivered")).not.toBeInTheDocument();
  });

  it.each([
    ["slack", "failed", "Delivery: Partial acceptance"],
    ["webhook", "failed", "Delivery: Partial acceptance"],
    ["webhook", "unknown", "Delivery: Acceptance unknown"],
    ["webhook", "sent", "Delivery: Delivered in digest"],
  ] as const)("classifies a digest peer with a final %s %s outcome", (channel, status, heading) => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [],
          deliveryState: "digested",
          deliverySummary: [
            { channel: "webhook", status: "sent" },
            { channel, status },
          ],
        },
      ],
    });
    expect(screen.getByText(heading)).toHaveClass(
      status === "sent" ? "text-green-text" : "text-yellow-text",
    );
    if (status !== "sent")
      expect(screen.queryByText("Delivery: Delivered in digest")).not.toBeInTheDocument();
  });

  it("uses a current successful digest summary over historical unknown attempts", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [{ ...alerts[0].deliveryAttempts[0], status: "unknown" }],
          deliveryState: "digested",
          deliverySummary: [{ channel: "email", status: "sent" }],
        },
      ],
    });
    expect(screen.getByText("Delivery: Delivered in digest")).toHaveClass("text-green-text");
    expect(screen.queryByText("Delivery: Acceptance unknown")).not.toBeInTheDocument();
  });

  it("does not treat another email recipient's success as recovery from unknown acceptance", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryState: "delivered",
          deliveryAttempts: [
            { ...alerts[0].deliveryAttempts[0], error: null, status: "sent" },
            {
              ...alerts[0].deliveryAttempts[0],
              attemptedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
              status: "unknown",
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Delivery: Acceptance unknown")).toHaveClass("text-yellow-text");
    expect(screen.queryByText("Delivery: Delivered")).not.toBeInTheDocument();
  });

  it("renders the terminal delivery state and its affected channel", () => {
    renderAlerts();

    expect(screen.getByText("Delivery: Failed / dead letter")).toBeInTheDocument();
    expect(
      screen.getByText("Email Failed: Email delivery has no enabled recipients. / 4m ago"),
    ).toBeInTheDocument();
  });

  it("identifies the webhook endpoint in the delivery log", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [
            {
              attemptedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
              channel: "webhook",
              error: null,
              status: "sent",
              webhookEndpoint: { id: "we_abcdefghijklmnopqrstuvwx", label: "Primary alerts" },
            },
          ],
        },
      ],
    });

    expect(screen.getByText("Webhook Sent (Primary alerts) / 4m ago")).toBeInTheDocument();
  });

  it("labels a removed webhook endpoint without exposing its former id", () => {
    renderAlerts({
      initialAlerts: [
        {
          ...alerts[0],
          deliveryAttempts: [
            {
              attemptedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
              channel: "webhook",
              error: "Endpoint removed after delivery.",
              status: "failed",
              webhookEndpoint: null,
            },
          ],
        },
      ],
    });

    expect(
      screen.getByText(
        "Webhook Failed (Deleted endpoint): Endpoint removed after delivery. / 4m ago",
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
    expect(screen.getByText("rank tracker dropped 5 positions")).toBeInTheDocument();
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

  it("renders template buttons without decorative SVG icons", () => {
    const templateLabels = ["Dropped more than 3", "Slipped", "Entered top 3"];
    renderAlerts({
      templates: [
        { id: "positiondrop", label: templateLabels[0], severity: "warning" },
        { id: "slipped", label: templateLabels[1], severity: "urgent" },
        { id: "top3", label: templateLabels[2], severity: "info" },
      ],
    });

    for (const label of templateLabels) {
      expect(screen.getByRole("button", { name: label }).querySelector("svg")).toBeNull();
    }
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
