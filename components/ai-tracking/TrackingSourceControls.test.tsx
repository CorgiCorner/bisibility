import type { trackingConfigurationForm } from "@/lib/ai-tracking/projections/forms";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { expect, it, vi } from "vitest";
import type { z } from "zod";
import { TrackingSourceControls } from "./TrackingSourceControls";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const engines = ["chat_gpt", "google", "gemini", "claude", "perplexity"];
it("shows shared product names and stores one engine per run using keyboard controls", async () => {
  const onInvalidate = vi.fn();
  const submitted = vi.fn();
  function Harness() {
    const form = useForm<z.infer<typeof trackingConfigurationForm>>({
      defaultValues: {
        engine: "chat_gpt",
        source: "consumer_scrape",
        location: "United States",
        locale: "en",
      },
    });
    return (
      <>
        <TrackingSourceControls
          control={form.control}
          source="consumer_scrape"
          engines={engines}
          onInvalidate={onInvalidate}
        />
        <button type="button" onClick={() => submitted(form.getValues("engine"))}>
          Read engine
        </button>
      </>
    );
  }
  render(<Harness />);
  expect(screen.getByRole("radiogroup", { name: "engine" })).toBeVisible();
  expect(screen.getAllByRole("radio").map((option) => option.getAttribute("aria-label"))).toEqual([
    "ChatGPT",
    "Google AI Overviews",
    "Gemini",
    "Claude",
    "Perplexity",
  ]);
  const user = userEvent.setup();
  screen.getByRole("radio", { name: "Claude" }).focus();
  await user.keyboard(" ");
  expect(screen.getByRole("radio", { name: "Claude" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "ChatGPT" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Read engine" }));
  expect(submitted).toHaveBeenCalledWith("claude");
  expect(onInvalidate).toHaveBeenCalledOnce();
});
