type VideoWalkthroughPlaceholderProps = {
  videoRef: string;
};

export function VideoWalkthroughPlaceholder({
  videoRef,
}: Readonly<VideoWalkthroughPlaceholderProps>) {
  return (
    <section
      aria-label="Video walkthrough"
      className="flex min-h-[260px] w-full flex-1 items-center rounded-card border border-dashed border-border-control bg-bg-sunken px-5 py-[22px] text-center"
      data-video-ref={videoRef}
    >
      <div className="mx-auto flex max-w-[440px] flex-col items-center">
        <span
          className="inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium"
          style={{
            backgroundColor: "color-mix(in srgb, var(--purple) 12%, var(--bg-elev))",
            borderColor: "color-mix(in srgb, var(--purple) 28%, var(--bg-elev))",
            color: "var(--purple-text)",
          }}
        >
          Coming soon
        </span>
        <h3 className="m-0 mt-3 text-[16px] font-semibold text-fg">Video walkthroughs</h3>
        <p className="m-0 mt-2 text-[13px] leading-[1.55] text-fg-muted">
          We are recording a short clip for each step. Until they land, every step on the left opens
          with its written version.
        </p>
      </div>
    </section>
  );
}
