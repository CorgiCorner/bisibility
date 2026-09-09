export const SETUP_VIDEO_REFS = [
  "create-project",
  "connect-source",
  "add-keywords",
  "first-check",
  "confirm-competitors",
  "provider-dataforseo",
  "provider-serpapi",
  "dashboard-tour",
] as const;

export type SetupVideoRef = (typeof SETUP_VIDEO_REFS)[number];

export type SetupVideoAsset = {
  durationSeconds: number;
  height: number;
  width: number;
  poster: string;
  src: string;
};

export const SETUP_VIDEO_MANIFEST: Partial<Record<SetupVideoRef, SetupVideoAsset>> = {
  "create-project": {
    height: 1000,
    width: 1600,
    durationSeconds: 16,
    poster: "/videos/setup/create-project-v1.webp",
    src: "https://media.bisibility.com/videos/setup/create-project-v2.mp4",
  },
  "connect-source": {
    height: 1000,
    width: 1600,
    durationSeconds: 58,
    poster: "/videos/setup/connect-source-v1.webp",
    src: "https://media.bisibility.com/videos/setup/connect-source-v2.mp4",
  },
  "add-keywords": {
    height: 1000,
    width: 1600,
    durationSeconds: 64,
    poster: "/videos/setup/add-keywords-v1.webp",
    src: "https://media.bisibility.com/videos/setup/add-keywords-v2.mp4",
  },
  "first-check": {
    height: 1000,
    width: 1600,
    durationSeconds: 56,
    poster: "/videos/setup/first-check-v1.webp",
    src: "https://media.bisibility.com/videos/setup/first-check-v2.mp4",
  },
  "confirm-competitors": {
    height: 1000,
    width: 1600,
    durationSeconds: 28,
    poster: "/videos/setup/add-competitor-v1.webp",
    src: "https://media.bisibility.com/videos/setup/add-competitor-v1.mp4",
  },
};
