import type {
  AlertActionHandlers,
  AlertRuleView,
  AlertTargetOptions,
} from "@/lib/alerts/alert-data";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewRuleDrawer } from "./NewRuleDrawer";

vi.mock("@/components/ui", () => ({
  inputClassName: "border border-border-strong bg-transparent",
  Button: ({
    children,
    startIcon: _startIcon,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { startIcon?: ReactNode; variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: (props: InputHTMLAttributes<HTMLInputElement>) => <input type="checkbox" {...props} />,
  ConfirmModal: () => null,
  MenuSelect: ({
    ariaLabel,
    onChange,
    options,
    value,
  }: {
    ariaLabel: string;
    onChange: (value: string) => void;
    options: readonly { label: string; value: string }[];
    value: string;
  }) => (
    <select aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} value={value}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  PasswordInput: (props: InputHTMLAttributes<HTMLInputElement>) => (
    <input type="password" {...props} />
  ),
  Sheet: ({
    children,
    footer,
    open,
  }: {
    children: ReactNode;
    footer?: ReactNode;
    open: boolean;
  }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));
const targets: AlertTargetOptions = { keywords: [], members: [], tags: [] };

function renderDrawer(
  actions: Pick<AlertActionHandlers, "createAlertRuleAction" | "updateAlertRuleAction">,
  onClose = vi.fn(),
  targetOptions = targets,
  initialRule?: AlertRuleView,
) {
  render(
    <NewRuleDrawer
      actions={{
        deleteWebhookEndpointAction: vi.fn(),
        testWebhookEndpointAction: vi.fn(),
        upsertWebhookEndpointAction: vi.fn(),
        ...actions,
      }}
      canManageEndpoints
      initialRule={initialRule}
      onClose={onClose}
      open
      projectId="project_1"
      targets={targetOptions}
    />,
  );
  return onClose;
}

describe("NewRuleDrawer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits the valid default all-keywords rule", async () => {
    const createAlertRuleAction = vi.fn().mockResolvedValue({ id: "rule_1" });
    const onClose = renderDrawer({ createAlertRuleAction, updateAlertRuleAction: vi.fn() });

    fireEvent.change(screen.getByRole("textbox", { name: "Rule name" }), {
      target: { value: "alerts-test-default" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(createAlertRuleAction).toHaveBeenCalledOnce());
    expect(createAlertRuleAction).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionType: "exits_top_n",
        name: "alerts-test-default",
        severity: "urgent",
        targetIds: [],
        targetType: "all",
        template: "slipped",
        topN: 10,
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("allows overriding the template severity before creating a rule", async () => {
    const createAlertRuleAction = vi.fn().mockResolvedValue({ id: "rule_1" });
    renderDrawer({ createAlertRuleAction, updateAlertRuleAction: vi.fn() });

    expect(screen.getByRole("combobox", { name: "Severity" })).toHaveValue("urgent");
    fireEvent.change(screen.getByRole("combobox", { name: "Severity" }), {
      target: { value: "warning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() =>
      expect(createAlertRuleAction).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "warning" }),
      ),
    );
  });

  it("resets severity to the newly selected template default", () => {
    renderDrawer({ createAlertRuleAction: vi.fn(), updateAlertRuleAction: vi.fn() });

    fireEvent.change(screen.getByRole("combobox", { name: "Severity" }), {
      target: { value: "warning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entered top 3" }));

    expect(screen.getByRole("combobox", { name: "Severity" })).toHaveValue("info");
  });

  it("uses the persisted severity when editing an existing rule", () => {
    const initialRule: AlertRuleView = {
      channel: "In-app",
      channels: [],
      changePct: null,
      condition: "rank enters top 3",
      conditionType: "enters_top_n",
      competitorDomain: null,
      dropPositions: null,
      enabled: true,
      fires: "0 this week",
      id: "alr_a00000000000000000000000",
      name: "Top three",
      period: "Each check",
      recipientIds: [],
      scope: "All keywords",
      serpFeature: null,
      severity: "warning",
      status: "active",
      targetIds: [],
      targetType: "all",
      thresholdPosition: null,
      topN: 3,
    };
    renderDrawer(
      { createAlertRuleAction: vi.fn(), updateAlertRuleAction: vi.fn() },
      vi.fn(),
      targets,
      initialRule,
    );

    expect(screen.getByRole("combobox", { name: "Severity" })).toHaveValue("warning");
  });

  it("uses the full drawer width when scope has no target selector", () => {
    renderDrawer({ createAlertRuleAction: vi.fn(), updateAlertRuleAction: vi.fn() });

    expect(screen.getByRole("combobox", { name: "Scope" }).parentElement).toHaveClass(
      "sm:col-span-2",
    );
  });

  it("submits a webhook rule when the separate endpoint controls are blank", async () => {
    const createAlertRuleAction = vi.fn().mockResolvedValue({ id: "rule_1" });
    const onClose = renderDrawer(
      { createAlertRuleAction, updateAlertRuleAction: vi.fn() },
      vi.fn(),
      {
        ...targets,
        webhookEndpoints: [
          {
            description: null,
            enabled: true,
            id: "endpoint_1",
            url: "https://example.com/webhook",
          },
        ],
      },
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Rule name" }), {
      target: { value: "alerts-test-webhook" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Webhook" }));
    expect(screen.getByRole("textbox", { name: "Endpoint URL" })).toHaveValue("");
    expect(screen.getByLabelText("HMAC secret")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(createAlertRuleAction).toHaveBeenCalledOnce());
    expect(createAlertRuleAction).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ["webhook"], name: "alerts-test-webhook" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the drawer open and renders handled create errors", async () => {
    const createAlertRuleAction = vi.fn().mockResolvedValue({
      error:
        "Alert rule limit reached: a project can have at most 50 alert rules. Delete an existing rule before creating another.",
      ok: false,
    });
    const onClose = renderDrawer({ createAlertRuleAction, updateAlertRuleAction: vi.fn() });

    fireEvent.change(screen.getByRole("textbox", { name: "Rule name" }), {
      target: { value: "alerts-test-cap-51" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    expect(
      await screen.findByText(
        "Alert rule limit reached: a project can have at most 50 alert rules. Delete an existing rule before creating another.",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("surfaces a field-specific validation error without calling the action", async () => {
    const createAlertRuleAction = vi.fn();
    renderDrawer({ createAlertRuleAction, updateAlertRuleAction: vi.fn() });

    fireEvent.change(screen.getByRole("textbox", { name: "Rule name" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name the rule.");
    expect(createAlertRuleAction).not.toHaveBeenCalled();
  });
});
