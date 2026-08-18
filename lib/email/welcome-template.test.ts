import { describe, expect, it } from "vitest";
import { welcomeEmail, welcomeFollowupEmail, welcomeGreetingName } from "./welcome-template";

const origin = "https://cloud.example.com";
const appUrl = `${origin}/app`;
const unsubscribeUrl = `${origin}/email/unsubscribe?token=signed`;
const sender = {
  founderName: "Ada" as string | null,
  from: "Ada from bisibility <hello@example.com>",
  replyTo: "replies@example.com",
};
const nullBase = {
  email: "owner@example.com",
  founderName: null,
  from: "bisibility <hello@example.com>",
  origin,
  profileNameTrusted: false,
  replyTo: "hello@example.com",
};

const FIRST_PERSON_RE = /\b(?:i|me|my|mine|we|us|our|ours)\b/gi;
const firstPersonPronouns = (text: string): string[] => text.match(FIRST_PERSON_RE) ?? [];

const FORBIDDEN_HTML = [
  "<!doctype",
  "<html",
  "<body",
  "background:",
  "<table",
  "border:",
  "border-radius:",
  "<button",
  "display:none",
  "max-height:0",
] as const;

function assertMinimalHtml(html: string) {
  for (const marker of FORBIDDEN_HTML) expect(html).not.toContain(marker);
  expect(html).not.toMatch(/<style/i);
  expect(html).not.toContain("<br");
  expect(html).not.toContain("<br/>");
  expect(html).not.toContain("<br />");
  const tags = [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
  for (const tag of tags) {
    expect(["p", "a"]).toContain(tag);
  }
  for (const opening of html.matchAll(/<a\s+href="([^"]*)"\s*>/g)) {
    expect(opening[0]).toMatch(/^<a href="[^"]*">$/);
  }
  expect(html.match(/<p>/g)?.length ?? 0).toBe(html.match(/<\/p>/g)?.length ?? 0);
  expect(html.match(/<a\s+href="[^"]*">/g)?.length ?? 0).toBe(html.match(/<\/a>/g)?.length ?? 0);
}

function assertNoSelfHosting(text: string, html: string) {
  for (const body of [text, html]) {
    expect(body).not.toContain("self-host");
    expect(body).not.toContain("/docs");
    expect(body).not.toContain("P.S.");
  }
}

function assertNoSelfHostOrPS(text: string, html: string) {
  for (const body of [text, html]) {
    expect(body).not.toContain("self-host");
    expect(body).not.toContain("P.S.");
  }
}

function assertNoEmDash(text: string, html: string) {
  expect(text).not.toContain("\u2014");
  expect(html).not.toContain("\u2014");
}

function assertNoStep(text: string, html: string) {
  expect(text).not.toContain("?step=");
  expect(html).not.toContain("?step=");
}

describe("greeting name", () => {
  const g = (name: string, email = "michal@example.com", trusted = false) =>
    welcomeGreetingName({ email, name, profileNameTrusted: trusted });

  it("uses trusted profile names or real multi-word names", () => {
    expect(g("michal")).toBe("there");
    expect(g("Ada Lovelace")).toBe("Ada");
    expect(g("Ada", "ada@example.com", true)).toBe("there");
    expect(g("Ada", "ada.lovelace@example.com", true)).toBe("Ada");
  });
});

describe("welcome email variant A (onboarding completed)", () => {
  const alertsUrl = `${origin}/alerts`;
  const integrationsUrl = `${origin}/integrations`;
  const apiDocsUrl = "https://bisibility.com/docs/api/quickstart";

  const message = welcomeEmail({
    email: "owner@example.com",
    name: "Owner Example",
    origin,
    profileNameTrusted: false,
    variant: "completed",
    ...sender,
  });

  const expectedText = [
    "Hey Owner,",
    "",
    "Thanks for setting up bisibility. One thing worth knowing up front: the first check is just a baseline. The value shows up as history builds, so let it run for a week or two before judging it.",
    "",
    "While it runs, three things worth switching on:",
    "",
    `- Alerts, so you hear about ranking moves without checking in ${alertsUrl}`,
    `- Search Console and GA4 (in Integrations), to see impressions and clicks next to rankings ${integrationsUrl}`,
    `- API and webhooks, if you want the data in your own tools ${apiDocsUrl}`,
    "",
    "The beta is free. When paid plans arrive, nothing happens automatically - you will hear from me first.",
    "",
    "If anything is confusing or broken, just reply. I read everything.",
    "",
    "Ada",
    "founder, bisibility",
  ].join("\n");

  it("has the approved subject, text body, and founder signature", () => {
    expect(message.subject).toBe("Welcome to bisibility Cloud");
    expect(message.text).toBe(expectedText);
    expect(message.text).toContain("Ada\nfounder, bisibility");
  });

  it("has the three recommendation bullet lines with bare URLs", () => {
    expect(message.text).toContain(
      `- Alerts, so you hear about ranking moves without checking in ${alertsUrl}`,
    );
    expect(message.text).toContain(
      `- Search Console and GA4 (in Integrations), to see impressions and clicks next to rankings ${integrationsUrl}`,
    );
    expect(message.text).toContain(
      `- API and webhooks, if you want the data in your own tools ${apiDocsUrl}`,
    );
  });

  it("has the three hrefs in order with bare URL anchor labels", () => {
    const hrefs = [...message.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([alertsUrl, integrationsUrl, apiDocsUrl]);
    expect(message.html).toContain(`>${alertsUrl}</a>`);
    expect(message.html).toContain(`>${integrationsUrl}</a>`);
    expect(message.html).toContain(`>${apiDocsUrl}</a>`);
  });

  it("has no self-hosting, P.S., step query, shell markup, or em dash", () => {
    assertNoSelfHostOrPS(message.text, message.html);
    assertNoStep(message.text, message.html);
    assertMinimalHtml(message.html);
    assertNoEmDash(message.text, message.html);
  });
});

describe("welcome email variant B (onboarding incomplete)", () => {
  const message = welcomeEmail({
    email: "owner@example.com",
    name: "owner",
    origin,
    profileNameTrusted: false,
    variant: "incomplete",
    ...sender,
  });

  const expectedText = [
    "Hey there,",
    "",
    `Thanks for signing up. Looks like setup did not get all the way through - all good, nothing is lost. Pick it up here: ${appUrl}`,
    "",
    "Most people stall on the data provider step, so the quick version: you connect your own provider account and pay them directly, nothing goes through us. DataForSEO is pay-as-you-go (early usage is usually a few dollars a month); SerpAPI is a subscription. The cost summary shows the numbers before you commit to anything.",
    "",
    "If it broke or was confusing, reply and tell me where. That is what the beta is for.",
    "",
    "Ada",
    "founder, bisibility",
  ].join("\n");

  it("has the approved subject and text body", () => {
    expect(message.subject).toBe("Welcome to bisibility Cloud");
    expect(message.text).toBe(expectedText);
  });

  it("includes DataForSEO pay-as-you-go and SerpAPI subscription wording", () => {
    expect(message.text).toContain("DataForSEO is pay-as-you-go");
    expect(message.text).toContain("SerpAPI is a subscription");
    expect(message.html).toContain("DataForSEO is pay-as-you-go");
    expect(message.html).toContain("SerpAPI is a subscription");
  });

  it("has only the /app absolute URL as a bare link and no step query", () => {
    expect(message.text).toContain(appUrl);
    expect(message.html).toContain(appUrl);
    expect(message.html).toContain(`>${appUrl}</a>`);
    assertNoStep(message.text, message.html);
    const hrefs = [...message.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([appUrl]);
  });

  it("has no self-hosting, shell markup, or em dash", () => {
    assertNoSelfHosting(message.text, message.html);
    assertMinimalHtml(message.html);
    assertNoEmDash(message.text, message.html);
  });
});

describe("welcome email founder-null fallback", () => {
  const completed = welcomeEmail({ ...nullBase, name: "Owner Example", variant: "completed" });
  const incomplete = welcomeEmail({ ...nullBase, name: "Owner Example", variant: "incomplete" });
  const followup = welcomeFollowupEmail({ ...nullBase, name: "owner", unsubscribeUrl });

  it("variant A uses neutral forms for 'you will hear from me first' and 'I read everything'", () => {
    expect(completed.text).toContain("you will hear from the team first");
    expect(completed.text).not.toContain("hear from me first");
    expect(completed.text).toContain("Every reply is read.");
    expect(completed.text).not.toContain("I read everything");
  });

  it("variant B uses neutral forms for 'tell me where' and 'nothing goes through us'", () => {
    expect(incomplete.text).toContain("reply and let the team know where");
    expect(incomplete.text).not.toContain("tell me where");
    expect(incomplete.text).toContain("nothing goes through bisibility");
    expect(incomplete.text).not.toContain("goes through us");
  });

  it("uses the generic bisibility team signature and has no null leaks", () => {
    for (const message of [completed, incomplete]) {
      expect(message.text).toContain("bisibility team");
      expect(message.text).not.toContain("founder, bisibility");
      expect(message.text).not.toContain("null");
    }
  });

  it("has no first-person pronouns in text or HTML across variants and follow-up", () => {
    for (const message of [completed, incomplete, followup]) {
      expect(firstPersonPronouns(message.text)).toEqual([]);
      expect(firstPersonPronouns(message.html)).toEqual([]);
    }
  });

  it("renders minimal HTML for both variants and the follow-up", () => {
    assertMinimalHtml(completed.html);
    assertMinimalHtml(incomplete.html);
    assertMinimalHtml(followup.html);
  });
});

describe("follow-up email", () => {
  it("founder voice retains approved copy and unsubscribe URL with minimal HTML", () => {
    const message = welcomeFollowupEmail({
      email: "owner@example.com",
      name: "Owner Example",
      profileNameTrusted: false,
      unsubscribeUrl,
      ...sender,
    });

    expect(message.subject).toBe("what made you try bisibility?");
    expect(message.text).toContain("Ada here, I build bisibility.");
    expect(message.text).toContain("I read and answer every reply.");
    expect(message.text).toContain("tell me and I will get you unstuck.");
    expect(message.text).toContain("what made you sign up, and what were you using before?");
    expect(message.text).toContain(`Unsubscribe: ${unsubscribeUrl}`);
    expect(message.text).toContain("Ada");
    expect(message.html).toContain(`href="${unsubscribeUrl}"`);
    expect(message.html).toContain(">Unsubscribe</a>");
    assertMinimalHtml(message.html);
  });

  it("uses generic voice when founder is null", () => {
    const message = welcomeFollowupEmail({
      ...nullBase,
      name: "owner",
      unsubscribeUrl,
    });

    expect(message.text).toContain("A quick check-in from bisibility.");
    expect(message.text).toContain("Every reply is read and answered.");
    expect(message.text).toContain("reply to this email for help getting unstuck.");
    expect(message.text).toContain("bisibility team");
    expect(message.text).not.toContain("I build bisibility.");
    expect(message.text).not.toContain("I read and answer");
    assertMinimalHtml(message.html);
  });

  it("has no em dash in text or HTML", () => {
    const message = welcomeFollowupEmail({
      email: "owner@example.com",
      name: "owner",
      profileNameTrusted: false,
      unsubscribeUrl,
      ...sender,
    });
    assertNoEmDash(message.text, message.html);
  });
});
