import {
  type FeatureActivity,
  type FeatureKey,
  type FeatureMaturity,
  type FeatureStatus,
  type FeatureStatusEntry,
  featureStatus,
} from "@/lib/content/feature-registry";

export {
  type FeatureActivity,
  type FeatureKey,
  type FeatureMaturity,
  type FeatureStatus,
  type FeatureStatusEntry,
  featureStatus,
} from "@/lib/content/feature-registry";

const exploringAvailability = "on the roadmap";

export const featureDocs = (key: FeatureKey) => {
  const feature: FeatureStatusEntry = featureStatus[key];
  return feature.docs;
};

export function shippedFeatureLabel(key: FeatureKey) {
  const feature: FeatureStatusEntry = featureStatus[key];
  if (feature.status !== "shipped") {
    throw new Error(
      `Feature ${key} is ${feature.status}; present-tense shipped copy must be updated.`,
    );
  }
  return feature.label;
}

export function featureClaim(key: FeatureKey) {
  const feature: FeatureStatusEntry = featureStatus[key];
  switch (feature.status) {
    case "shipped":
      return `ships ${feature.label}`;
    case "beta":
      return `${feature.label} is available in beta`;
    case "open-beta":
      return `${feature.label} is available in open beta`;
    case "building":
      return `${feature.label} is in development`;
    case "cloud-only":
      return `${feature.label} is available only on the hosted service`;
    case "not-planned":
      return `${feature.label} is not planned`;
    case "planned":
      return `${feature.label} is planned`;
    case "exploring":
      return `${feature.label} is ${exploringAvailability}`;
  }
}

export function sentenceCaseLabel(label: string) {
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

const availabilityPhrases: Record<FeatureStatus, string> = {
  beta: "available in beta",
  building: "in development",
  "cloud-only": "available only on the hosted service",
  exploring: exploringAvailability,
  "not-planned": "not planned",
  "open-beta": "available in open beta",
  planned: "planned",
  shipped: "shipped",
};

export function featureAvailabilitySentence(key: FeatureKey, verb: "are" | "is" = "is") {
  const feature: FeatureStatusEntry = featureStatus[key];
  const label = sentenceCaseLabel(feature.label);
  const scope = feature.scope === "self-host" ? " (self-hosted)" : "";
  return `${label} ${verb} ${availabilityPhrases[feature.status]}${scope}.`;
}

/**
 * Maturity is declared, never inferred: an unaudited legacy entry returns null so
 * nothing renders it as GA on the strength of an old `shipped` label.
 */
export function featureMaturity(key: FeatureKey): FeatureMaturity | null {
  const feature: FeatureStatusEntry = featureStatus[key];
  return feature.maturity ?? null;
}

export function featureActivity(key: FeatureKey): FeatureActivity | null {
  const feature: FeatureStatusEntry = featureStatus[key];
  return feature.activity ?? null;
}

export function roadmapItemStatus(
  key: FeatureKey,
): "available" | "in-progress" | "planned" | "exploring" {
  const feature: FeatureStatusEntry = featureStatus[key];
  const status = feature.status;
  if (
    status === "shipped" ||
    status === "beta" ||
    status === "open-beta" ||
    status === "cloud-only"
  ) {
    return "available";
  }
  if (status === "building") return "in-progress";
  if (status === "planned") return "planned";
  return "exploring";
}
