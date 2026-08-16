import { type AccountSectionId, accountSections } from "@/components/account/account-sections";
import Link from "next/link";

type AccountSubnavProps = {
  activeSection: AccountSectionId;
};

export function AccountSubnav({ activeSection }: Readonly<AccountSubnavProps>) {
  return (
    <nav
      aria-label="Account sections"
      className="sticky top-6 hidden w-[200px] self-start flex-col gap-0.5 pl-[14px] lg:flex"
      data-account-subnav=""
    >
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {accountSections.map((section) => {
          const current = section.id === activeSection;
          const Icon = section.icon;
          return (
            <li key={section.id}>
              <Link
                aria-current={current ? "page" : undefined}
                className={`relative flex h-10 items-center gap-2.5 rounded-[9px] px-[11px] text-[13.5px] no-underline outline-none transition-colors duration-150 hover:bg-nav-active hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid ${
                  current ? "font-semibold text-fg" : "font-medium text-fg-muted"
                }`}
                data-account-subnav-link={section.id}
                href={section.href}
              >
                {current ? (
                  <span
                    aria-hidden
                    className="absolute -left-2.5 h-1.5 w-1.5 rounded-full bg-accent-solid"
                    data-account-subnav-current-dot=""
                  />
                ) : null}
                <span
                  aria-hidden
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center"
                  data-account-subnav-icon={section.id}
                  data-account-subnav-icon-weight={current ? "fill" : "regular"}
                >
                  <Icon
                    aria-hidden
                    className="text-current"
                    size={16}
                    weight={current ? "fill" : "regular"}
                  />
                </span>
                <span>{section.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
