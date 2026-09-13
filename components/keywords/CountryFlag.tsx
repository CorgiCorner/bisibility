import { FLAG_SPRITE_URL } from "@/lib/ui/flag-sprite";
import { FLAG_SPRITE_CODES } from "@/lib/ui/generated/flag-sprite-codes";
import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";

// Flags are served from one generated sprite instead of bundled components. The symbol carries
// its own viewBox, so this element only sets the box the flag is fitted into.

type CountryFlagProps = {
  code: string;
  title?: string;
  className?: string;
  fallback?: "globe" | "none";
};

/** A compact flag for a catalog country, with a neutral fallback for other codes. */
export function CountryFlag({
  code,
  title,
  className,
  fallback = "globe",
}: Readonly<CountryFlagProps>) {
  const countryCode = code.trim().toUpperCase();
  if (FLAG_SPRITE_CODES.has(countryCode)) {
    return (
      <svg
        aria-hidden={title ? undefined : true}
        className={className}
        data-country-flag={countryCode}
        role={title ? "img" : undefined}
        xmlns="http://www.w3.org/2000/svg"
      >
        {title ? <title>{title}</title> : null}
        <use height="100%" href={`${FLAG_SPRITE_URL}#${countryCode.toLowerCase()}`} width="100%" />
      </svg>
    );
  }

  if (fallback === "globe") {
    return (
      <GlobeHemisphereWest
        aria-hidden={title ? undefined : true}
        className={className}
        data-country-flag-fallback={countryCode}
        aria-label={title}
        weight="regular"
      />
    );
  }

  return null;
}
