import type { ReactNode } from "react";

export type MenuGroupHeadingProps = {
  children: ReactNode;
  first: boolean;
};

export const MenuGroupHeading = function MenuGroupHeading({
  children,
  first,
}: Readonly<MenuGroupHeadingProps>) {
  return (
    <div
      className="uppercase"
      data-slot="menu-group-header"
      role="presentation"
      style={{
        backgroundColor: "var(--bg-sunken)",
        color: "var(--fg-muted)",
        fontSize: "11px",
        letterSpacing: "0.08em",
        lineHeight: "normal",
        marginBottom: "4px",
        marginInline: "-6px",
        marginTop: first ? 0 : "4px",
        paddingInline: "15px",
        paddingTop: "4px",
        paddingBottom: "4px",
        textTransform: "uppercase",
        width: "calc(100% + 12px)",
        zIndex: 1,
      }}
    >
      {children}
    </div>
  );
};
