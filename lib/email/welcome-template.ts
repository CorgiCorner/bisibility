import { absoluteUrl } from "@/lib/seo/origin";
import { escapeHtml } from "./escape-html";

export type WelcomeEmailSender = {
  founderName: string | null;
  from: string;
  replyTo: string;
};

type WelcomeIdentity = {
  email: string;
  name: string;
  profileNameTrusted: boolean;
};

type WelcomeVariant = "completed" | "incomplete";

type WelcomeEmailInput = WelcomeIdentity &
  WelcomeEmailSender & { origin: string; variant: WelcomeVariant };
type WelcomeFollowupInput = WelcomeIdentity & WelcomeEmailSender & { unsubscribeUrl: string };

function comparableName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function welcomeGreetingName({ email, name, profileNameTrusted }: WelcomeIdentity) {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.toLocaleLowerCase("en-US") === email.toLocaleLowerCase("en-US")) {
    return "there";
  }

  const emailLocalPart = email.split("@", 1)[0] ?? "";
  const derivedFromEmail = comparableName(normalized) === comparableName(emailLocalPart);
  if (derivedFromEmail || (!profileNameTrusted && !normalized.includes(" "))) return "there";

  const firstName = normalized.split(" ", 1)[0]?.replace(/[^\p{L}\p{M}'-]/gu, "") ?? "";
  return firstName.slice(0, 50) || "there";
}

function paragraph(value: string) {
  return `<p>${value}</p>`;
}

function anchor(url: string, label: string) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

function signatureLines(founderName: string | null): string[] {
  return founderName ? [founderName, "founder, bisibility"] : ["bisibility team"];
}

function signatureHtmlLines(founderName: string | null): string[] {
  return founderName ? [escapeHtml(founderName), "founder, bisibility"] : ["bisibility team"];
}

export function welcomeEmail(input: WelcomeEmailInput) {
  const greeting = welcomeGreetingName(input);
  const safeGreeting = escapeHtml(greeting);
  const founder = input.founderName;
  const appUrl = absoluteUrl(input.origin, "/app");
  const sigText = signatureLines(founder);
  const sigHtml = signatureHtmlLines(founder).map(paragraph).join("");

  const meFirst = founder ? "me" : "the team";
  const readEverything = founder ? "I read everything" : "Every reply is read";
  const tellWhere = founder ? "reply and tell me where" : "reply and let the team know where";
  const throughUs = founder ? "nothing goes through us" : "nothing goes through bisibility";

  let text: string;
  let html: string;

  if (input.variant === "completed") {
    const alertsUrl = absoluteUrl(input.origin, "/alerts");
    const integrationsUrl = absoluteUrl(input.origin, "/integrations");
    const apiDocsUrl = "https://bisibility.com/docs/api/quickstart";

    text = [
      `Hey ${greeting},`,
      "",
      "Thanks for setting up bisibility. One thing worth knowing up front: the first check is just a baseline. The value shows up as history builds, so let it run for a week or two before judging it.",
      "",
      "While it runs, three things worth switching on:",
      "",
      `- Alerts, so you hear about ranking moves without checking in ${alertsUrl}`,
      `- Search Console and GA4 (in Integrations), to see impressions and clicks next to rankings ${integrationsUrl}`,
      `- API and webhooks, if you want the data in your own tools ${apiDocsUrl}`,
      "",
      `The beta is free. When paid plans arrive, nothing happens automatically - you will hear from ${meFirst} first.`,
      "",
      `If anything is confusing or broken, just reply. ${readEverything}.`,
      "",
      ...sigText,
    ].join("\n");

    html = [
      paragraph(`Hey ${safeGreeting},`),
      paragraph(
        "Thanks for setting up bisibility. One thing worth knowing up front: the first check is just a baseline. The value shows up as history builds, so let it run for a week or two before judging it.",
      ),
      paragraph("While it runs, three things worth switching on:"),
      paragraph(
        `- Alerts, so you hear about ranking moves without checking in ${anchor(alertsUrl, alertsUrl)}`,
      ),
      paragraph(
        `- Search Console and GA4 (in Integrations), to see impressions and clicks next to rankings ${anchor(integrationsUrl, integrationsUrl)}`,
      ),
      paragraph(
        `- API and webhooks, if you want the data in your own tools ${anchor(apiDocsUrl, apiDocsUrl)}`,
      ),
      paragraph(
        `The beta is free. When paid plans arrive, nothing happens automatically - you will hear from ${escapeHtml(meFirst)} first.`,
      ),
      paragraph(`If anything is confusing or broken, just reply. ${escapeHtml(readEverything)}.`),
      sigHtml,
    ].join("");
  } else {
    text = [
      `Hey ${greeting},`,
      "",
      `Thanks for signing up. Looks like setup did not get all the way through - all good, nothing is lost. Pick it up here: ${appUrl}`,
      "",
      `Most people stall on the data provider step, so the quick version: you connect your own provider account and pay them directly, ${throughUs}. DataForSEO is pay-as-you-go (early usage is usually a few dollars a month); SerpAPI is a subscription. The cost summary shows the numbers before you commit to anything.`,
      "",
      `If it broke or was confusing, ${tellWhere}. That is what the beta is for.`,
      "",
      ...sigText,
    ].join("\n");

    html = [
      paragraph(`Hey ${safeGreeting},`),
      paragraph(
        `Thanks for signing up. Looks like setup did not get all the way through - all good, nothing is lost. Pick it up here: ${anchor(appUrl, appUrl)}`,
      ),
      paragraph(
        `Most people stall on the data provider step, so the quick version: you connect your own provider account and pay them directly, ${escapeHtml(throughUs)}. DataForSEO is pay-as-you-go (early usage is usually a few dollars a month); SerpAPI is a subscription. The cost summary shows the numbers before you commit to anything.`,
      ),
      paragraph(
        `If it broke or was confusing, ${escapeHtml(tellWhere)}. That is what the beta is for.`,
      ),
      sigHtml,
    ].join("");
  }

  return {
    from: input.from,
    html,
    replyTo: input.replyTo,
    subject: "Welcome to bisibility Cloud",
    text,
  };
}

export function welcomeFollowupEmail(input: WelcomeFollowupInput) {
  const greeting = welcomeGreetingName(input);
  const safeGreeting = escapeHtml(greeting);
  const founder = input.founderName;

  const openingText = founder
    ? `${founder} here, I build bisibility.`
    : "A quick check-in from bisibility.";
  const openingHtml = founder
    ? `${escapeHtml(founder)} here, I build bisibility.`
    : "A quick check-in from bisibility.";
  const replyText = founder
    ? "I read and answer every reply. If you hit a wall during setup (provider connection is the usual suspect), tell me and I will get you unstuck."
    : "Every reply is read and answered. If setup is blocked (provider connection is the usual suspect), reply to this email for help getting unstuck.";
  const sigText = founder ? founder : "bisibility team";
  const sigHtml = founder ? escapeHtml(founder) : "bisibility team";
  const question = "Quick question: what made you sign up, and what were you using before?";

  const html = [
    paragraph(`Hey ${safeGreeting},`),
    paragraph(openingHtml),
    paragraph(question),
    paragraph(replyText),
    paragraph(sigHtml),
    paragraph(
      `Do not want these founder check-ins? ${anchor(input.unsubscribeUrl, "Unsubscribe")}.`,
    ),
  ].join("");

  const text = [
    `Hey ${greeting},`,
    "",
    openingText,
    "",
    question,
    "",
    replyText,
    "",
    sigText,
    "",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");

  return {
    from: input.from,
    html,
    replyTo: input.replyTo,
    subject: "what made you try bisibility?",
    text,
  };
}
