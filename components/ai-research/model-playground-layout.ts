export const modelPlaygroundLayoutClassName = "grid min-w-0 gap-5";

export const modelPlaygroundBlocks = ["composer", "toolbar", "results"] as const;

export type ModelPlaygroundBlock = (typeof modelPlaygroundBlocks)[number];
