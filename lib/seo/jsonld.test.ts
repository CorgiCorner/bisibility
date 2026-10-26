import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  absoluteSiteUrl,
  createFaqPageJsonLd,
  createHomeJsonLd,
  createIntegrationsJsonLd,
  createOrganizationJsonLd,
  createSoftwareApplicationJsonLd,
  createWebSiteJsonLd,
  defaultSiteUrl,
  englishHomeJsonLdCopy,
  githubUrl,
  linkedinUrl,
  resolveSiteUrl,
  rootMetadata,
  serializeJsonLd,
} from "./jsonld";
import { defaultSocialImage } from "./page-metadata";

const origin = "https://rank.example";

function restoreEnv(name: "SITE_URL", value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }

  process.env[name] = value;
}

function findNode(graph: ReturnType<typeof createHomeJsonLd>, type: string) {
  return graph["@graph"].find((node) => node["@type"] === type);
}

describe("JSON-LD builders", () => {
  it("builds organization, website, and software application graph nodes", () => {
    const graph = createHomeJsonLd(englishHomeJsonLdCopy, origin);

    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"].map((node) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
      "SoftwareApplication",
    ]);

    expect(findNode(graph, "Organization")).toMatchObject(createOrganizationJsonLd(origin));
    expect(findNode(graph, "WebSite")).toMatchObject(createWebSiteJsonLd(origin));
    expect(findNode(graph, "SoftwareApplication")).toMatchObject(
      createSoftwareApplicationJsonLd(englishHomeJsonLdCopy, origin),
    );
  });

  it("includes required organization fields without invented ratings", () => {
    const organization = createOrganizationJsonLd(origin);
    const app = createSoftwareApplicationJsonLd(englishHomeJsonLdCopy, origin);

    expect(organization).toMatchObject({
      "@type": "Organization",
      logo: { "@type": "ImageObject", url: `${origin}/icon.svg` },
      name: "bisibility",
      sameAs: [githubUrl, linkedinUrl],
      url: `${origin}/`,
    });
    expect(app).toMatchObject({
      "@type": "SoftwareApplication",
      applicationCategory: "BusinessApplication",
      license: "https://www.gnu.org/licenses/agpl-3.0.en.html",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      operatingSystem: "Web",
    });
    expect(app).not.toHaveProperty("aggregateRating");
    expect(app).not.toHaveProperty("review");
  });

  it("connects the integrations page to the software application", () => {
    const graph = createIntegrationsJsonLd(origin);
    const page = findNode(graph, "WebPage");

    expect(page).toMatchObject({
      "@id": `${origin}/integrations#webpage`,
      "@type": "WebPage",
      about: { "@id": `${origin}/#software` },
      isPartOf: { "@id": `${origin}/#website` },
      url: `${origin}/integrations`,
    });
  });

  it("omits FAQPage when there are no real FAQ entries", () => {
    expect(createFaqPageJsonLd([])).toBeNull();
    expect(
      createFaqPageJsonLd([{ question: "Can I self-host bisibility?", answer: "Yes." }]),
    ).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          acceptedAnswer: { "@type": "Answer", text: "Yes." },
          name: "Can I self-host bisibility?",
        },
      ],
    });
  });

  it("normalizes site URLs and escapes script-breaking JSON-LD text", () => {
    expect(resolveSiteUrl("https://rank.example/some/path")).toBe(origin);
    expect(resolveSiteUrl("not a url")).toBe(defaultSiteUrl);
    expect(absoluteSiteUrl("/roadmap", "https://rank.example/base")).toBe(`${origin}/roadmap`);

    const serialized = serializeJsonLd({ "@type": "Thing", name: "</script>" });

    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual({ "@type": "Thing", name: "</script>" });
  });

  it("uses SITE_URL when resolving the default origin", () => {
    const previousSiteUrl = process.env.SITE_URL;
    process.env.SITE_URL = "https://self-host.example/app";

    try {
      expect(resolveSiteUrl()).toBe("https://self-host.example");
    } finally {
      restoreEnv("SITE_URL", previousSiteUrl);
    }
  });

  it("points the default social image at the root Open Graph route without conflicts", () => {
    const appRoot = resolve(import.meta.dirname, "../../app");

    expect(new URL(defaultSocialImage.url, origin).pathname).toBe("/opengraph-image");
    expect(defaultSocialImage).toMatchObject({ height: 630, type: "image/png", width: 1200 });
    expect(rootMetadata.openGraph?.images).toEqual([defaultSocialImage]);
    expect(rootMetadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [
        {
          alt: defaultSocialImage.alt,
          height: defaultSocialImage.height,
          url: defaultSocialImage.url,
          width: defaultSocialImage.width,
        },
      ],
    });
    // One generated root image; a static or twitter-specific file would compete with it.
    expect(existsSync(resolve(appRoot, "opengraph-image.tsx"))).toBe(true);
    for (const name of ["opengraph-image", "twitter-image"]) {
      for (const extension of ["ts", "js", "png", "jpg", "jpeg", "gif"]) {
        expect(existsSync(resolve(appRoot, `${name}.${extension}`)), `${name}.${extension}`).toBe(
          false,
        );
      }
    }
    expect(existsSync(resolve(appRoot, "twitter-image.tsx"))).toBe(false);
  });
});
