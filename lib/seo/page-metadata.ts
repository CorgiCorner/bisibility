import type { Metadata } from "next";

export const defaultSocialImage = {
  alt: "Bisibility SEO observability for developers",
  height: 630,
  type: "image/png",
  url: "/opengraph-image",
  width: 1200,
} as const;

export type PageSocialImage = {
  alt: string;
  height: number;
  type: string;
  url: string;
  width: number;
};

type PageTitle = string | { absolute: string };

type BuildPageMetadataOptions = {
  description: string;
  images?: readonly PageSocialImage[] | "file-convention";
  ogType?: "article" | "website";
  path: string;
  publishedTime?: string;
  socialDescription?: string;
  socialTitle?: string;
  title: PageTitle;
};

function titleText(title: PageTitle, socialTitle?: string) {
  return socialTitle ?? (typeof title === "string" ? title : title.absolute);
}

export function buildPageMetadata({
  description,
  images = [defaultSocialImage],
  ogType = "website",
  path,
  publishedTime,
  socialDescription = description,
  socialTitle,
  title,
}: BuildPageMetadataOptions): Metadata {
  const resolvedTitle = titleText(title, socialTitle);
  const usesFileConventionImage = images === "file-convention";
  const openGraphImages = usesFileConventionImage ? {} : { images: [...images] };
  const twitterImages = usesFileConventionImage
    ? {}
    : {
        images: images.map(({ alt, height, url, width }) => ({ alt, height, url, width })),
      };

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: ogType,
      siteName: "Bisibility",
      locale: "en_US",
      url: path,
      title: resolvedTitle,
      description: socialDescription,
      ...openGraphImages,
      ...(ogType === "article" && publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description: socialDescription,
      ...twitterImages,
    },
  };
}
