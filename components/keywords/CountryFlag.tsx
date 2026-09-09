import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { hasFlag } from "country-flag-icons";
import AE from "country-flag-icons/react/3x2/AE";
import AT from "country-flag-icons/react/3x2/AT";
import AU from "country-flag-icons/react/3x2/AU";
import BE from "country-flag-icons/react/3x2/BE";
import BR from "country-flag-icons/react/3x2/BR";
import CA from "country-flag-icons/react/3x2/CA";
import CH from "country-flag-icons/react/3x2/CH";
import DE from "country-flag-icons/react/3x2/DE";
import DK from "country-flag-icons/react/3x2/DK";
import ES from "country-flag-icons/react/3x2/ES";
import FI from "country-flag-icons/react/3x2/FI";
import FR from "country-flag-icons/react/3x2/FR";
import GB from "country-flag-icons/react/3x2/GB";
import IE from "country-flag-icons/react/3x2/IE";
import IN from "country-flag-icons/react/3x2/IN";
import IT from "country-flag-icons/react/3x2/IT";
import JP from "country-flag-icons/react/3x2/JP";
import MX from "country-flag-icons/react/3x2/MX";
import NL from "country-flag-icons/react/3x2/NL";
import NO from "country-flag-icons/react/3x2/NO";
import NZ from "country-flag-icons/react/3x2/NZ";
import PL from "country-flag-icons/react/3x2/PL";
import PT from "country-flag-icons/react/3x2/PT";
import SE from "country-flag-icons/react/3x2/SE";
import SG from "country-flag-icons/react/3x2/SG";
import US from "country-flag-icons/react/3x2/US";
import ZA from "country-flag-icons/react/3x2/ZA";

type FlagComponent = typeof US;

const marketFlags: Readonly<Record<string, FlagComponent>> = {
  AE,
  AT,
  AU,
  BE,
  BR,
  CA,
  CH,
  DE,
  DK,
  ES,
  FI,
  FR,
  GB,
  IE,
  IN,
  IT,
  JP,
  MX,
  NL,
  NO,
  NZ,
  PL,
  PT,
  SE,
  SG,
  US,
  ZA,
};

type CountryFlagProps = {
  code: string;
  title?: string;
  className?: string;
  fallback?: "globe" | "none";
};

/** A compact flag for a supported market, with a neutral fallback for other codes. */
export function CountryFlag({
  code,
  title,
  className,
  fallback = "globe",
}: Readonly<CountryFlagProps>) {
  const countryCode = code.trim().toUpperCase();
  const Flag = hasFlag(countryCode) ? marketFlags[countryCode] : undefined;
  if (Flag) {
    return (
      <Flag
        aria-hidden={title ? undefined : true}
        className={className}
        data-country-flag={countryCode}
        title={title}
      />
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
