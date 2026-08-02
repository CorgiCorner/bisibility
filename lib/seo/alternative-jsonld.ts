import type { CompetitorContent } from "@/lib/content/competitor-types";
import { absoluteSiteUrl, createFaqPageJsonLd } from "@/lib/seo/jsonld";

export function buildAlternativeJsonLd(competitor: CompetitorContent) {
  const faqJsonLd = createFaqPageJsonLd(competitor.faq);
  const pageUrl = absoluteSiteUrl(`/alternatives/${competitor.slug}`);
  const softwareId = `${pageUrl}#software`;
  const entityJsonLd = competitor.entityFirst
    ? [
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "@id": softwareId,
          name: competitor.name,
          alternateName: competitor.entityFirst.alternateNames,
          url: `https://${competitor.domain}`,
          sameAs: competitor.entityFirst.sameAs,
          applicationCategory: "SEO software",
          ...(competitor.licenseUrl ? { license: competitor.licenseUrl } : {}),
        },
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: competitor.entityFirst.h1,
          datePublished: competitor.entityFirst.datePublished,
          dateModified: competitor.lastVerified,
          mainEntityOfPage: pageUrl,
          about: { "@id": softwareId },
        },
      ]
    : [];
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteSiteUrl("/") },
        {
          "@type": "ListItem",
          position: 2,
          name: "Compare",
          item: absoluteSiteUrl("/alternatives"),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: competitor.entityFirst ? competitor.name : `bisibility vs ${competitor.name}`,
          item: pageUrl,
        },
      ],
    },
    ...(faqJsonLd ? [{ "@context": "https://schema.org", ...faqJsonLd }] : []),
    ...entityJsonLd,
  ];
}
