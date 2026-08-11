export type LogoDevUrlInput = {
  domain?: string | null;
  format?: "png";
  size?: number;
  theme?: "dark" | "light";
  token?: string | null;
};

export function buildLogoDevUrl({
  domain,
  format = "png",
  size = 64,
  theme,
  token,
}: LogoDevUrlInput) {
  const safeDomain = domain?.trim();
  const safeToken = token?.trim();

  if (!safeDomain || !safeToken) {
    return null;
  }

  const params = new URLSearchParams({
    fallback: "404",
    token: safeToken,
    size: String(size),
    format,
  });

  if (theme) {
    params.set("theme", theme);
  }

  return `https://img.logo.dev/${encodeURIComponent(safeDomain)}?${params.toString()}`;
}
