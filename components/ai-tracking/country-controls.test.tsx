import {
  type AiResearchForm,
  AiVisibilityFields,
} from "@/components/ai-research/AiVisibilityFields";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import type { visibilitySchema } from "@/lib/ai-research/schema";
import type { trackingConfigurationForm } from "@/lib/ai-tracking/projections/forms";
import type { modelSuggestionsPreviewInputSchema } from "@/lib/ai-tracking/suggestions/generation-schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { TrackingGenerationFields } from "./TrackingGenerationFields";
import { TrackingMarketControls } from "./TrackingMarketControls";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

function MarketHarness({ changed }: { changed: (location: string) => void }) {
  const form = useForm<z.infer<typeof trackingConfigurationForm>>({
    defaultValues: { location: "United States", locale: "en" },
  });
  return (
    <TrackingMarketControls
      control={form.control}
      onChange={() => changed(form.getValues("location"))}
    />
  );
}

function GenerationHarness({ changed }: { changed: (country?: string) => void }) {
  const form = useForm<
    z.input<typeof modelSuggestionsPreviewInputSchema>,
    unknown,
    z.output<typeof modelSuggestionsPreviewInputSchema>
  >({
    defaultValues: {
      configuration: {
        provider: "dataforseo",
        engine: "chat_gpt",
        model: "gpt-4.1-mini",
        languageCode: "en",
        maxOutputTokens: 512,
        advisoryCostLimitCents: 10,
      },
      inputSnapshot: {
        context: { business: "", audience: "", products: "", goals: "", agentRules: "" },
        competitors: [],
      },
    },
  });
  return (
    <TrackingGenerationFields
      control={form.control}
      register={form.register}
      competitors={[]}
      onInvalidate={() => changed(form.getValues("configuration.countryIsoCode"))}
    />
  );
}

const catalog: AiResearchCatalog = {
  models: [],
  responseCountries: [],
  responseLanguages: [],
  limits: { maxModels: 2, maxOutputTokens: 4096 },
  fetchedAt: "2026-10-14T00:00:00Z",
  visibilityMarkets: [
    {
      platform: "chat_gpt",
      locationCode: 2616,
      countryName: "Poland",
      languages: [{ code: "pl", name: "Polish" }],
    },
    {
      platform: "google",
      locationCode: 2276,
      countryName: "Germany",
      languages: [{ code: "de", name: "German" }],
    },
    {
      platform: "chat_gpt",
      locationCode: 9999,
      countryName: "Unrecognized provider region",
      languages: [{ code: "en", name: "English" }],
    },
  ],
};

function VisibilityHarness({
  changed,
}: {
  changed: (location: number | undefined, language: string | undefined) => void;
}) {
  const form = useForm<z.input<typeof visibilitySchema>>({
    defaultValues: {
      platform: "chat_gpt",
      location_code: 2840,
      language_code: "en",
      target_type: "domain",
    },
  });
  const location = form.watch("location_code");
  const language = form.watch("language_code");
  return (
    <>
      <AiVisibilityFields form={form as AiResearchForm} catalog={catalog} disabled={false} />
      <button type="button" onClick={() => changed(location, language)}>
        Read values
      </button>
    </>
  );
}

const flag = (element: HTMLElement, country: string) =>
  element.querySelector(`[data-country-flag='${country}']`);

async function chooseCountry(
  user: ReturnType<typeof userEvent.setup>,
  trigger: string,
  search: string,
  country: string,
  countryCode = search,
) {
  await user.click(screen.getByRole("button", { name: trigger }));
  await user.type(screen.getByRole("textbox"), search);
  const option = screen.getByRole("menuitem", { name: country });
  expect(flag(option, countryCode)).toBeInTheDocument();
  await user.click(option);
}

describe("AI country controls", () => {
  it("adds selected and searchable ISO flags while tracking still stores the country name", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<MarketHarness changed={changed} />);
    expect(flag(screen.getByRole("button", { name: "location" }), "US")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "languageCode" }).querySelector("[data-country-flag]"),
    ).toBeNull();
    await chooseCountry(user, "location", "PL", "Poland");
    expect(changed).toHaveBeenCalledExactlyOnceWith("Poland");
    expect(flag(screen.getByRole("button", { name: "location" }), "PL")).toBeInTheDocument();
  });

  it("keeps generation ISO values and clears optional country without assigning a flag", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<GenerationHarness changed={changed} />);
    expect(
      screen
        .getByRole("button", { name: "generationCountry" })
        .querySelector("[data-country-flag]"),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "generationCountry" }));
    await user.type(screen.getByRole("textbox", { name: "searchPlaceholder" }), "Polska");
    const poland = screen.getByRole("menuitem", { name: "Poland" });
    expect(flag(poland, "PL")).toBeInTheDocument();
    await user.click(poland);
    expect(changed).toHaveBeenLastCalledWith("PL");
    await user.click(screen.getByRole("button", { name: "generationCountry" }));
    const none = screen.getByRole("menuitem", { name: "generationNoCountry" });
    expect(none.querySelector("[data-country-flag]")).toBeNull();
    await user.click(none);
    expect(changed).toHaveBeenLastCalledWith(undefined);
    expect(
      screen
        .getByRole("button", { name: "generationCountry" })
        .querySelector("[data-country-flag]"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "languageCode" }).querySelector("[data-country-flag]"),
    ).toBeNull();
  });

  it("preserves provider-supported numeric locations, local-name search and country languages", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<VisibilityHarness changed={changed} />);
    expect(flag(screen.getByRole("button", { name: "country" }), "US")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "language" }).querySelector("[data-country-flag]"),
    ).toBeNull();
    await chooseCountry(user, "country", "Polska", "Poland", "PL");
    await user.click(screen.getByRole("button", { name: "Read values" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith(2616, "pl");
    await user.click(screen.getByRole("button", { name: "country" }));
    expect(screen.queryByRole("menuitem", { name: "Germany" })).not.toBeInTheDocument();
    const unknown = screen.getByRole("menuitem", { name: "Unrecognized provider region" });
    expect(unknown.querySelector("[data-country-flag]")).toBeNull();
    expect(unknown.querySelector("[data-country-flag-fallback]")).toBeInTheDocument();
  });
});
