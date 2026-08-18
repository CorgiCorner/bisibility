import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["control", "card", "card-lg"],
      text: ["ui-h1", "ui-section", "ui-body", "ui-body-relaxed", "ui-caption", "ui-micro"],
    },
    classGroups: {
      "max-w": [{ "max-w": ["content", "settings"] }],
    },
  },
});

export function cn(...i: ClassValue[]) {
  return mergeClasses(clsx(i));
}
