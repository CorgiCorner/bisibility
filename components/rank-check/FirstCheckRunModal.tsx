"use client";

import { displayProvider } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { FirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { hasMonthlyBudgetCap } from "@/lib/rank-check/budget-contract";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type FirstCheckRunScope = "all" | "first";

export type FirstCheckRunModalProps = {
  projectRef: ProjectRef;
  open: boolean;
  onClose: () => void;
  plan: FirstCheckRunPlan | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  runScope: FirstCheckRunScope;
  onRunScopeChange: (scope: FirstCheckRunScope) => void;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: string | null;
};

type FirstCheckTranslations = ReturnType<typeof useTranslations<"shared.firstCheck">>;

const frequencyMessageKey = {
  custom_cron: "frequency.custom_cron",
  daily: "frequency.daily",
  manual: "frequency.manual",
  monthly: "frequency.monthly",
  paused: "frequency.paused",
  weekly: "frequency.weekly",
} as const;

function estimateCurrency(
  cents: number,
  format: ReturnType<typeof useFormatter>,
  t: FirstCheckTranslations,
) {
  const currency = (value: number) =>
    format.number(value, { currency: "USD", minimumFractionDigits: 2, style: "currency" });
  if (Math.abs(cents) > 0 && Math.abs(cents) < 1) {
    return t("cost.lessThanOneCent", { amount: currency(0.01) });
  }
  return currency(cents / 100);
}

function guardNotices(plan: FirstCheckRunPlan, projectRef: ProjectRef, t: FirstCheckTranslations) {
  const notices: { content: ReactNode; id: string }[] = [];
  if (!plan.providerReady) {
    notices.push({ content: t("notices.providerMissing"), id: "provider" });
  }
  if (plan.isSampleProject) {
    notices.push({ content: t("notices.sampleProject"), id: "sample" });
  }
  if (plan.budgetExhausted) {
    notices.push({
      content: (
        <>
          {t("notices.budgetExhausted")}{" "}
          <Link
            className="font-semibold text-fg underline decoration-fg underline-offset-3"
            href={`${appPath(projectRef, "settings")}#provider-usage`}
          >
            {t("notices.raiseBudget")}
          </Link>
        </>
      ),
      id: "budget",
    });
  }
  if (plan.readyCount === 0) {
    notices.push({ content: t("notices.noneReady"), id: "ready" });
  }
  return notices;
}

function FirstCheckRunPlanRows({
  plan,
  runScope,
}: Readonly<{ plan: FirstCheckRunPlan; runScope: FirstCheckRunScope }>) {
  const format = useFormatter();
  const t = useTranslations("shared.firstCheck");
  const rows: { label: string; value: string }[] = [
    { label: t("scope.engine"), value: t("scope.google") },
    { label: t("scope.location"), value: plan.scope.location },
    {
      label: t("scope.device"),
      value: plan.scope.device === "mobile" ? t("scope.mobile") : t("scope.desktop"),
    },
    { label: t("scope.depth"), value: t("scope.depthValue", { value: plan.scope.depth }) },
    { label: t("scope.frequency"), value: t(frequencyMessageKey[plan.scope.frequency]) },
  ];
  const checkCount = runScope === "all" ? plan.readyCount : Math.min(1, plan.readyCount);
  if (plan.estimatedCostPerCheckCents != null) {
    rows.push({
      label: t("cost.estimated"),
      value: t("cost.estimatedValue", {
        amount: estimateCurrency(checkCount * plan.estimatedCostPerCheckCents, format, t),
      }),
    });
  }
  rows.push({
    label: t("scope.budget"),
    value: hasMonthlyBudgetCap(plan.budget.capCents)
      ? t("cost.budgetWithCap", {
          cap: estimateCurrency(plan.budget.capCents, format, t),
          spent: estimateCurrency(plan.budget.spentCents, format, t),
        })
      : t("cost.budgetWithoutCap", {
          spent: estimateCurrency(plan.budget.spentCents, format, t),
        }),
  });

  return (
    <div className="overflow-hidden rounded-card border border-border">
      {rows.map((row, index) => (
        <div className={index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"} key={row.label}>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-[13px] text-fg-muted">{row.label}</span>
            <span className="text-right font-sans tabular-nums text-[13px] font-semibold text-fg">
              {row.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FirstCheckRunPlanBody({
  onRunScopeChange,
  plan,
  projectRef,
  runScope,
}: Readonly<
  Pick<FirstCheckRunModalProps, "onRunScopeChange" | "plan" | "projectRef" | "runScope"> & {
    plan: FirstCheckRunPlan;
  }
>) {
  const t = useTranslations("shared.firstCheck");
  const notices = guardNotices(plan, projectRef, t);
  const options = [
    { label: t("scope.firstKeyword"), value: "first" },
    {
      disabled: plan.readyCount <= 1,
      label: t("scope.allReady", { count: plan.readyCount }),
      value: "all",
    },
  ] as const;

  return (
    <div className="grid gap-4.5">
      <p className="m-0 rounded-control border border-border bg-bg px-3.5 py-3 text-[12.5px] leading-5 text-fg-muted">
        {t("manualRunDescription")}
      </p>

      <section className="grid gap-2" aria-labelledby="provider-order-heading">
        <h3
          className="m-0 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
          id="provider-order-heading"
        >
          {t("providerOrder")}
        </h3>
        <ol className="m-0 grid list-none gap-2 p-0" aria-label={t("providerOrderAriaLabel")}>
          {plan.providers.map((provider, index) => (
            <li
              className="flex items-center gap-3 rounded-control border border-border px-3.5 py-2.5"
              key={provider}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-sans tabular-nums text-[10px] font-semibold text-accent-text">
                {index + 1}
              </span>
              <span className="text-[13px] font-semibold text-fg">{displayProvider(provider)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-2" aria-labelledby="check-scope-heading">
        <h3
          className="m-0 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
          id="check-scope-heading"
        >
          {t("scope.title")}
        </h3>
        <FirstCheckRunPlanRows plan={plan} runScope={runScope} />
      </section>

      <SegmentedControl
        label={t("scope.runAriaLabel", { count: plan.readyCount })}
        labelClassName="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
        name="first-check-run-scope"
        onChange={onRunScopeChange}
        options={options}
        value={runScope}
      />

      {runScope === "all" && plan.readyCount > 1 ? (
        <p className="m-0 text-[12px] leading-5 text-fg-muted">
          {t("scope.queueDetail", { count: plan.readyCount - 1 })}
        </p>
      ) : null}

      {notices.length > 0 ? (
        <div className="grid gap-1.5" role="alert">
          {notices.map((notice) => (
            <p className="m-0 text-[12px] leading-5 text-red-text" key={notice.id}>
              {notice.content}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FirstCheckRunModal({
  confirmError,
  confirming,
  error,
  loading,
  onClose,
  onConfirm,
  onRetry,
  onRunScopeChange,
  open,
  plan,
  projectRef,
  runScope,
}: Readonly<FirstCheckRunModalProps>) {
  const t = useTranslations("shared.firstCheck");
  const blocked =
    !plan ||
    loading ||
    Boolean(error) ||
    !plan.providerReady ||
    plan.isSampleProject ||
    plan.budgetExhausted ||
    plan.readyCount === 0;

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {confirmError ? (
        <p className="m-0 mb-1 w-full text-[12px] leading-5 text-red-text" role="alert">
          {confirmError}
        </p>
      ) : null}
      <Button onClick={onClose} type="button" variant="secondary">
        {t("cancel")}
      </Button>
      <Button
        disabled={blocked}
        loading={confirming}
        loadingLabel={t("starting")}
        onClick={onConfirm}
        type="button"
      >
        {t("confirm")}
      </Button>
    </div>
  );

  return (
    <Modal footer={footer} onClose={onClose} open={open} size="md" title={t("title")}>
      {loading ? (
        <p className="m-0 text-[13px] text-fg-muted" role="status">
          {t("loading")}
        </p>
      ) : null}
      {!loading && error ? (
        <div className="grid gap-3">
          <p className="m-0 text-[13px] text-red-text" role="alert">
            {error}
          </p>
          <Button onClick={onRetry} type="button" variant="secondary">
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {!loading && !error && plan ? (
        <FirstCheckRunPlanBody
          onRunScopeChange={onRunScopeChange}
          plan={plan}
          projectRef={projectRef}
          runScope={runScope}
        />
      ) : null}
      {!loading && !error && !plan ? (
        <p className="m-0 text-[13px] text-fg-muted">{t("unavailable")}</p>
      ) : null}
    </Modal>
  );
}
