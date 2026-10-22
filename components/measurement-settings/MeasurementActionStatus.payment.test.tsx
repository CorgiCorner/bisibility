import {
  renderWithFeatureMessages,
  sharedControlTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";
import { MeasurementActionStatus } from "./MeasurementActionStatus";
import { createMeasurementTranslator } from "./translate";

function Status({ code }: Readonly<{ code: string }>) {
  const t = useTranslations("shared.measurementSettings");
  return (
    <MeasurementActionStatus
      state={{ code, phase: "blocked" }}
      translate={createMeasurementTranslator(t, (value) => String(value))}
    />
  );
}

describe("measurement payment block copy", () => {
  it("shows the unavailable and already-used payment messages", () => {
    renderWithFeatureMessages(
      <>
        <Status code="payment_unavailable" />
        <Status code="payment_already_executed" />
      </>,
      { messages: sharedControlTestMessages },
    );

    expect(
      screen.getByText(
        "Payment details for this provider are unavailable. Check the payment source in Usage.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("This payment was already used for a run.")).toBeInTheDocument();
    expect(
      screen.queryByText("The action could not be confirmed. Your draft is retained."),
    ).not.toBeInTheDocument();
  });
});
