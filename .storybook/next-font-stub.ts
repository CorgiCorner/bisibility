type FontResult = {
  className: string;
  style: Record<string, string>;
  variable: string;
};

function createFont(variable = "--font-storybook"): FontResult {
  return {
    className: "font-storybook",
    style: {},
    variable,
  };
}

export default function localFont(): FontResult {
  return createFont();
}

export function GeistSans(): FontResult {
  return createFont("--font-geist-sans");
}

export function GeistMono(): FontResult {
  return createFont("--font-geist-mono");
}

export function Inter(): FontResult {
  return createFont("--font-inter");
}

export function Roboto(): FontResult {
  return createFont("--font-roboto");
}
