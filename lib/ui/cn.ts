import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...i: ClassValue[]) {
  return twMerge(clsx(i));
}
