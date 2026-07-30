import { locationValuesForKeys } from "@/components/onboarding/onboarding-location-field";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OnboardingTrackingDefaultsInput } from "./StepSchedule";
import { StepSchedule } from "./StepSchedule";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function defaultValues(): OnboardingTrackingDefaultsInput {
  return {
    country: "United States",
    cronExpression: "0 6 * * *",
    device: "desktop" as const,
    devices: ["desktop"],
    frequency: "daily" as const,
    jitterMinutes: 60,
    locationSelections: locationValuesForKeys(["US"]),
    locations: ["US"],
    projectId: "prj_1",
    serpDepth: 100,
    timezone: "UTC",
  };
}

afterEach(() => {
  fetchMock.mockReset();
});

describe("StepSchedule", () => {
  it("saves selected tracking defaults from concrete location selections", async () => {
    const onComplete = vi.fn();
    const updateProjectDefaultsAction = vi.fn(async () => undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            canonical_key: "PL",
            city_name: null,
            country_code: "PL",
            display_name: "Poland",
            hl: "pl",
            id: "country:PL",
            kind: "country",
            language_label: "Polish",
            region_name: null,
          },
        ],
      }),
    } as Response);
    const { container } = render(
      <StepSchedule
        defaultValues={defaultValues()}
        flowState={{ projectId: "prj_1", providerId: "serpapi" }}
        onComplete={onComplete}
        updateProjectDefaultsAction={updateProjectDefaultsAction}
      />,
    );

    expect(screen.getByDisplayValue("SerpAPI")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add location" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Add location" }), {
      target: { value: "pola" },
    });
    fireEvent.click(await screen.findByText("Poland"));
    fireEvent.click(screen.getByRole("button", { name: "Remove United States" }));

    fireEvent.click(screen.getByLabelText("Devices"));
    fireEvent.click(screen.getByText("Mobile"));
    fireEvent.click(screen.getByText("Desktop"));

    fireEvent.click(screen.getByLabelText("Refresh"));
    fireEvent.click(screen.getByText("Weekly"));

    fireEvent.click(screen.getByLabelText("SERP depth"));
    fireEvent.click(screen.getByText("Top 20"));

    expect(screen.getByDisplayValue("Polish")).toBeInTheDocument();
    expect(
      screen.getByText("Rankings below Top 20 report as not found and skip alerts."),
    ).toBeInTheDocument();

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(updateProjectDefaultsAction).toHaveBeenCalledTimes(1));
    expect(updateProjectDefaultsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "Poland",
        device: "mobile",
        frequency: "weekly",
        projectId: "prj_1",
        serpDepth: 20,
      }),
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: ["mobile"],
        locations: ["PL"],
        serpDepth: 20,
      }),
    );
  });

  it("provides help for configurable schedule fields", () => {
    render(<StepSchedule defaultValues={defaultValues()} />);

    expect(
      screen.getByRole("button", {
        name: "Desktop and mobile results often differ - each device is checked separately.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "How deep in the results we look (Top N). Keywords ranking below N are reported as not found.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "How often ranks are checked automatically, from daily through monthly. Manual and Paused stop scheduled checks.",
      }),
    ).toBeInTheDocument();
  });

  it("updates the unit and basket estimate before saving", () => {
    render(
      <StepSchedule
        defaultValues={defaultValues()}
        flowState={{ projectId: "prj_1", providerId: "dataforseo" }}
        projectedCostPerCheckCents={10}
      />,
    );

    expect(
      screen.getByText("Each keyword at this setup ~ $3.00/mo - 20 keywords would be ~ $60.00/mo."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Refresh"));
    fireEvent.click(screen.getByText("Weekly"));

    expect(
      screen.getByText("Each keyword at this setup ~ $0.40/mo - 20 keywords would be ~ $8.00/mo."),
    ).toBeInTheDocument();
  });

  it("uses the provider rate table when onboarding leaves the rate blank", () => {
    render(
      <StepSchedule
        defaultValues={defaultValues()}
        flowState={{ projectId: "prj_1", providerId: "dataforseo" }}
      />,
    );

    expect(
      screen.getByText("Each keyword at this setup ~ $0.47/mo - 20 keywords would be ~ $9.30/mo."),
    ).toBeInTheDocument();
  });

  it("shows exact zero-cost onboarding estimates", () => {
    render(
      <StepSchedule
        defaultValues={defaultValues()}
        flowState={{ projectId: "prj_1", providerId: "local-sequence" }}
        projectedCostPerCheckCents={0}
      />,
    );

    expect(
      screen.getByText("Each keyword at this setup ~ $0.00/mo - 20 keywords would be ~ $0.00/mo."),
    ).toBeInTheDocument();
  });
});
