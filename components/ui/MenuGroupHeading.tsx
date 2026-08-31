import ListSubheader from "@mui/material/ListSubheader";
import type { ReactNode } from "react";

export type MenuGroupHeadingProps = {
  children: ReactNode;
  first: boolean;
};

export const MenuGroupHeading = Object.assign(
  function MenuGroupHeading({ children, first }: Readonly<MenuGroupHeadingProps>) {
    return (
      <ListSubheader
        className="font-mono uppercase"
        data-slot="menu-group-header"
        disableSticky
        role="presentation"
        sx={{
          backgroundColor: "var(--bg-sunken)",
          color: "var(--fg-muted)",
          fontSize: "11px",
          letterSpacing: "0.08em",
          lineHeight: "normal",
          marginBottom: "4px",
          marginInline: "-6px",
          marginTop: first ? 0 : "4px",
          paddingInline: "15px",
          paddingY: "4px",
          textTransform: "uppercase",
          width: "calc(100% + 12px)",
          zIndex: 1,
        }}
      >
        {children}
      </ListSubheader>
    );
  },
  { muiSkipListHighlight: true },
);
