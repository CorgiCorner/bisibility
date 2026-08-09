// Hand-drawn replacement for Phosphor's SidebarSimple in the rail's collapse/expand control.
//
// Phosphor draws on a 256 grid and every edge of that glyph sits at a coordinate congruent to
// 4 (mod 8): 20, 36, 44, 60, 76, 100, 196, 212, 220, 236. Scaled to 16px each one lands on a
// quarter of a CSS pixel, so all ten edges fall on a half device pixel - at devicePixelRatio 2
// as well as 1 - and the browser antialiases every one of them across two pixel columns. The
// shape is nothing but vertical and horizontal lines, so there is no curve to hide it behind
// and the icon reads as blurred. Changing the weight does not help: the bar width is fine
// (1.5px CSS = 3 device px at dpr 2), it is the POSITION that is off by half a pixel.
//
// This grid is 16 units, drawn with 1px strokes on half-integer coordinates so each stroke
// covers exactly one pixel column or row. Sizes that are multiples of 16 stay sharp; other
// sizes reintroduce fractional edges, which is why the default is the only size in use.

type SidebarToggleIconProps = {
  /** CSS px. Multiples of 16 keep the geometry on whole pixels. */
  size?: number;
} & Omit<React.SVGProps<SVGSVGElement>, "size" | "viewBox">;

export function SidebarToggleIcon({ size = 16, ...props }: Readonly<SidebarToggleIconProps>) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
      viewBox="0 0 16 16"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect height="11" rx="2" width="13" x="1.5" y="2.5" />
      <line x1="5.5" x2="5.5" y1="2.5" y2="13.5" />
    </svg>
  );
}
