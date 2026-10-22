export function FirstCheckIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 220 240" fill="none">
      <circle cx="99" cy="125" r="82" fill="var(--accent)" opacity=".07" />
      <circle cx="185" cy="43" r="4" fill="var(--accent)" opacity=".35" />
      <circle cx="28" cy="194" r="3" fill="var(--accent)" opacity=".35" />
      <path
        d="M23 65h10m-5-5v10M183 186h12m-6-6v12"
        stroke="var(--accent)"
        strokeWidth="2"
        opacity=".4"
      />
      <g transform="rotate(-7 110 120)">
        <rect
          x="26"
          y="43"
          width="160"
          height="157"
          rx="12"
          fill="var(--bg-elev)"
          stroke="var(--border)"
        />
        <path d="M27 70h158" stroke="var(--border)" />
        <circle cx="39" cy="57" r="2.5" fill="var(--border)" />
        <circle cx="48" cy="57" r="2.5" fill="var(--border)" />
        <circle cx="57" cy="57" r="2.5" fill="var(--border)" />
        <rect x="41" y="82" width="129" height="24" rx="6" fill="var(--bg-sunken)" />
        <circle cx="52" cy="93" r="4" stroke="var(--fg-muted)" strokeWidth="1.5" />
        <path d="m55 96 3 3" stroke="var(--fg-muted)" strokeWidth="1.5" />
        <path d="M68 94h68" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
        <rect x="41" y="120" width="8" height="8" rx="2" fill="var(--accent)" opacity=".65" />
        <path d="M57 124h68" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M41 139h118m-118 7h89M41 170h91m-91 8h115"
          stroke="var(--border)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="41" y="157" width="8" height="8" rx="2" fill="var(--border)" />
        <path
          d="M57 161h73"
          stroke="var(--fg-muted)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity=".4"
        />
      </g>
      <rect
        x="122"
        y="132"
        width="79"
        height="69"
        rx="12"
        fill="var(--bg-elev)"
        stroke="var(--border)"
      />
      <path d="M136 181h50" stroke="var(--border)" />
      <path
        d="m138 172 13-10 12 4 20-21m-13 0h13v13"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
