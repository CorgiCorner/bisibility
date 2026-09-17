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
    "SerpApi",
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
    "Explore the bisibility roadmap: feature concepts, early releases, beta capabilities, and ways to help shape what comes next.",
  path: "/roadmap",
  socialTitle: "bisibility roadmap",
  socialDescription:
    "See what is taking shape, what is in early use, and what is available in beta, with the availability of each feature spelled out.",
});

export type LoginMetadataCopy = {
  description: string;
  socialDescription: string;
  socialTitle: string;
  title: string;
};

/**
 * The sign-in document is noindex, so this is a tab-title and share-preview concern rather
 * than an SEO one - but the tab must still speak the language the page body speaks, so the
 * route resolves the copy per request instead of exporting a static English object.
 */
export function createLoginMetadata(copy: LoginMetadataCopy): Metadata {
  return createNoindexMetadata({
    title: copy.title,
    description: copy.description,
    openGraph: {
      title: copy.socialTitle,
      description: copy.socialDescription,
      url: "/login",
    },
  });
}

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

export type HomeJsonLdCopy = {
  featureList: readonly [string, string, string, string, string];
  softwareDescription: string;
};

export const englishHomeJsonLdCopy: HomeJsonLdCopy = {
  featureList: [
    "Google keyword rank tracking",
    "Intended URL monitoring",
    "SEO signal timelines",
    "Bring-your-own SERP provider credentials",
    "Self-hostable REST API",
  ],
  softwareDescription:
    "Open-source, self-hostable SEO observability for developers: Google rank tracking, intended URLs, signal timelines, BYO SERP providers, and REST API access.",
};

export function createSoftwareApplicationJsonLd(
  copy: HomeJsonLdCopy,
  origin = resolveSiteUrl(),
): JsonLdObject {
  const url = absoluteSiteUrl("/", origin);

  return {
    "@id": `${url}#software`,
    "@type": "SoftwareApplication",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "SEO software",
    description: copy.softwareDescription,
    featureList: copy.featureList,
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

export function createHomeJsonLd(copy: HomeJsonLdCopy, origin = resolveSiteUrl()): JsonLdGraph {
  return {
    "@context": "https://schema.org",
    "@graph": [
      createOrganizationJsonLd(origin),
      createWebSiteJsonLd(origin),
      createSoftwareApplicationJsonLd(copy, origin),
    ],
  };
}

export type IntegrationsJsonLdCopy = {
  description: string;
  inLanguage: string;
  name: string;
  path: string;
  software: HomeJsonLdCopy;
};

export const englishIntegrationsJsonLdCopy: IntegrationsJsonLdCopy = {
  description:
    "Bring-your-own SERP providers and read-only analytics sources for rank positions, traffic context, signals, alerts, MCP, and REST API access.",
  inLanguage: "en",
  name: "bisibility rank tracking integrations",
  path: "/integrations",
  software: englishHomeJsonLdCopy,
};

export function createIntegrationsJsonLd(
  copyOrOrigin: IntegrationsJsonLdCopy | string = englishIntegrationsJsonLdCopy,
  origin = resolveSiteUrl(),
): JsonLdGraph {
  const copy = typeof copyOrOrigin === "string" ? englishIntegrationsJsonLdCopy : copyOrOrigin;
  const resolvedOrigin = typeof copyOrOrigin === "string" ? copyOrOrigin : origin;
  const url = absoluteSiteUrl(copy.path, resolvedOrigin);

  return {
    "@context": "https://schema.org",
    "@graph": [
      createOrganizationJsonLd(resolvedOrigin),
      createWebSiteJsonLd(resolvedOrigin),
      createSoftwareApplicationJsonLd(copy.software, resolvedOrigin),
      {
        "@id": `${url}#webpage`,
        "@type": "WebPage",
        about: { "@id": `${absoluteSiteUrl("/", resolvedOrigin)}#software` },
        description: copy.description,
        inLanguage: copy.inLanguage,
        isPartOf: { "@id": `${absoluteSiteUrl("/", resolvedOrigin)}#website` },
        name: copy.name,
        url,
      },
    ],
  };
}

export function serializeJsonLd(data: JsonLdGraph | JsonLdObject | readonly JsonLdObject[]) {
  return JSON.stringify(data).replaceAll("<", String.raw`\u003c`);
}
