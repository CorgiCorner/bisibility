import { Children, type ReactNode } from "react";

export type AlertBannerStackProps = {
  children: ReactNode;
};

/** Provides one shared card boundary and separators only between alert banners. */
export function AlertBannerStack({ children }: Readonly<AlertBannerStackProps>) {
  const banners = Children.toArray(children);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
      {banners.map((banner, index) => (
        <div
          className={index < banners.length - 1 ? "border-b border-border" : undefined}
          key={index}
        >
          {banner}
        </div>
      ))}
    </div>
  );
}
