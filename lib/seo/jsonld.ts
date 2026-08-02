import { GITHUB_URL, LINKEDIN_URL } from "@/lib/site/site";
import type { Metadata } from "next";
import { createNoindexMetadata } from "./noindex";
import {
  absoluteUrl,
  defaultCanonicalOrigin,
  normalizeOrigin,
  resolveCanonicalOrigin,
} from "./origin";
import { buildPageMetadata } from "./page-metadata";

export const defaultSiteUrl = defaultCanonicalOrigin;
export const githubUrl = GITHUB_URL;
export const linkedinUrl = LINKEDIN_URL;
export const siteName = "bisibility";

const rootDescription =
  "Open-source keyword rank tracking and SEO observability for developers: self-hostable rank tracking, intended URLs, signal timelines, BYO SERP providers, and REST API access.";
const socialDescription =
  "Open-source keyword rank tracking with SEO observability, intended URLs, signal timelines, and BYO SERP providers.";

export const rootMetadata: Metadata = {
  ...buildPageMetadata({
    title: siteName,
    description: rootDescription,
    path: "/",
    socialDescription,
  }),
  metadataBase: new URL(resolveSiteUrl()),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  keywords: [
    siteName,
    "open-source keyword rank tracking",
    "keyword rank tracking",
    "open-source rank tracker",
    "open-source keyword rank tracker",
    "SEO observability for developers",
    "self-hostable SEO observability",
    "Google rank tracking",
    "self-hosted SEO",
    "DataForSEO",
    "SerpAPI",
    "keyword tracking API",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const homeMetadata: Metadata = buildPageMetadata({
  title: "Open-source keyword rank tracking for developers",
  description:
    "Open-source keyword rank tracking and SEO observability for developers: track Google positions, intended URLs, indexing status, and SEO signals in one self-hostable dashboard.",
  path: "/",
  socialDescription:
    "Self-host bisibility for keyword rank tracking, intended URL monitoring, indexing status, and SEO observability with BYO SERP providers.",
});

export const roadmapMetadata: Metadata = buildPageMetadata({
  title: "Roadmap",
  description:
    "Follow the bisibility roadmap for SEO observability: signals, visibility timelines, Search Console data, alerts, and self-hosting improvements.",
  path: "/roadmap",
  socialTitle: "bisibility roadmap",
  socialDescription:
    "Follow planned improvements for signals, visibility timelines, provider connections, API access, and alerts.",
});

export const loginMetadata: Metadata = createNoindexMetadata({
  title: "Sign in",
  description:
    "Sign in to bisibility with a one-time email code to manage self-hosted SEO observability projects.",
  openGraph: {
    title: "Sign in to bisibility",
    description: "Access your bisibility projects and manage self-hosted SEO observability.",
    url: "/login",
  },
});

type JsonLdPrimitive = boolean | number | string | null;
export type JsonLdValue = JsonLdObject | JsonLdPrimitive | readonly JsonLdValue[];
export type JsonLdObject = { readonly [key: string]: JsonLdValue };
export type JsonLdGraph = {
  readonly "@context": "https://schema.org";
  readonly "@graph": readonly JsonLdObject[];
};

export type FaqEntry = {
  answer: string;
  question: string;
};

export function resolveSiteUrl(candidate?: string) {
  if (candidate !== undefined) {
    return normalizeOrigin(candidate) ?? defaultSiteUrl;
  }

  return resolveCanonicalOrigin();
}

export function absoluteSiteUrl(path = "/", origin = resolveSiteUrl()) {
  return absoluteUrl(resolveSiteUrl(origin), path);
}

export function createOrganizationJsonLd(origin = resolveSiteUrl()): JsonLdObject {
  const url = absoluteSiteUrl("/", origin);

  return {
    "@id": `${url}#organization`,
    "@type": "Organization",
    logo: {
      "@type": "ImageObject",
      url: absoluteSiteUrl("/icon.svg", origin),
    },
    name: siteName,
    sameAs: [githubUrl, linkedinUrl],
    url,
  };
}

export function createWebSiteJsonLd(origin = resolveSiteUrl()): JsonLdObject {
  const url = absoluteSiteUrl("/", origin);

  return {
    "@id": `${url}#website`,
    "@type": "WebSite",
    inLanguage: "en",
    name: siteName,
    publisher: { "@id": `${url}#organization` },
    url,
  };
}

export function createSoftwareApplicationJsonLd(origin = resolveSiteUrl()): JsonLdObject {
  const url = absoluteSiteUrl("/", origin);

  return {
    "@id": `${url}#software`,
    "@type": "SoftwareApplication",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "SEO software",
    description:
      "Open-source, self-hostable SEO observability for developers: Google rank tracking, intended URLs, signal timelines, BYO SERP providers, and REST API access.",
    featureList: [
      "Google keyword rank tracking",
      "Intended URL monitoring",
      "SEO signal timelines",
      "Bring-your-own SERP provider credentials",
      "Self-hostable REST API",
    ],
    license: "https://www.gnu.org/licenses/agpl-3.0.en.html",
    name: siteName,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      price: "0",
      priceCurrency: "USD",
    },
    operatingSystem: "Web",
    url,
  };
}

export function createFaqPageJsonLd(faqs: readonly FaqEntry[]): JsonLdObject | null {
  if (faqs.length === 0) {
    return null;
  }

  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
      name: faq.question,
    })),
  };
}

export function createHomeJsonLd(origin = resolveSiteUrl()): JsonLdGraph {
  return {
    "@context": "https://schema.org",
    "@graph": [
      createOrganizationJsonLd(origin),
      createWebSiteJsonLd(origin),
      createSoftwareApplicationJsonLd(origin),
    ],
  };
}

export function createIntegrationsJsonLd(origin = resolveSiteUrl()): JsonLdGraph {
  const url = absoluteSiteUrl("/integrations", origin);

  return {
    "@context": "https://schema.org",
    "@graph": [
      createOrganizationJsonLd(origin),
      createWebSiteJsonLd(origin),
      createSoftwareApplicationJsonLd(origin),
      {
        "@id": `${url}#webpage`,
        "@type": "WebPage",
        about: { "@id": `${absoluteSiteUrl("/", origin)}#software` },
        description:
          "Bring-your-own SERP providers and read-only analytics sources for rank positions, traffic context, signals, alerts, MCP, and REST API access.",
        inLanguage: "en",
        isPartOf: { "@id": `${absoluteSiteUrl("/", origin)}#website` },
        name: "bisibility rank tracking integrations",
        url,
      },
    ],
  };
}

export function serializeJsonLd(data: JsonLdGraph | JsonLdObject | readonly JsonLdObject[]) {
  return JSON.stringify(data).replaceAll("<", String.raw`\u003c`);
}
