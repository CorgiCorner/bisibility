import { ToastProvider } from "@/components/ui";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransitionStartFunction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transitions = vi.hoisted(() => ({
  active: null as "select" | "view" | null,
  call: 0,
  select: { pending: false, start: vi.fn() },
  view: { pending: false, start: vi.fn() },
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useTransition: (): [boolean, TransitionStartFunction] => {
      const state = transitions.call % 2 === 0 ? transitions.view : transitions.select;
      transitions.call += 1;
      return [state.pending, state.start];
    },
  };
});

import { SearchInsightsPropertyPicker } from "./SearchInsightsPropertyPicker";

const connected = {
  property: {
    displayName: "example.com",
    kind: "domain" as const,
    kindLabel: "domain",
    value: "sc-domain:example.com",
  },
  status: "connected" as const,
};

const properties = [
  {
    displayName: "example.com",
    kind: "domain" as const,
    kindLabel: "domain",
    permissionLevel: "siteOwner",
    value: "sc-domain:example.com",
  },
  {
    displayName: "https://blog.example.com/",
    kind: "url-prefix" as const,
    kindLabel: "url prefix",
    permissionLevel: "siteFullUser",
    value: "https://blog.example.com/",
  },
];

function renderPicker(overrides: Partial<Parameters<typeof SearchInsightsPropertyPicker>[0]> = {}) {
  const loadPropertiesAction = vi.fn().mockResolvedValue({ properties });
  const selectPropertyAction = vi.fn().mockResolvedValue({
    property: "https://blog.example.com/",
    status: "saved",
  });
  render(
    <ToastProvider>
      <SearchInsightsPropertyPicker
        connection={connected}
        loadPropertiesAction={loadPropertiesAction}
        projectDomain="example.com"
        projectId="prj_1"
        selectPropertyAction={selectPropertyAction}
        {...overrides}
      />
    </ToastProvider>,
  );
  return { loadPropertiesAction, selectPropertyAction };
}

describe("SearchInsightsPropertyPicker", () => {
  beforeEach(() => {
    transitions.active = null;
    transitions.call = 0;
    for (const [name, state] of [
      ["view", transitions.view],
      ["select", transitions.select],
    ] as const) {
      state.pending = false;
      state.start.mockReset();
      state.start.mockImplementation((callback) => {
        transitions.active = name;
        const result = callback();
        if (result && typeof result.then === "function") {
          void result.finally(() => {
            transitions.active = null;
          });
        } else {
          transitions.active = null;
        }
      });
    }
  });

  it("labels the footer action as Manage connection", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Search Console property" }));
    expect(await screen.findByRole("link", { name: "Manage connection" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connection" })).not.toBeInTheDocument();
  });

  it("shows the connected property, its kind pill and the overlap tooltip", () => {
    renderPicker();

    const trigger = screen.getByRole("button", { name: "Search Console property" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByText("Covers the whole domain: every subdomain and protocol."),
    ).toBeInTheDocument();
    expect(screen.getByText("domain")).toHaveAttribute("aria-describedby");
  });

  it("links a domain property to Search Console with external protections", () => {
    renderPicker();

    const link = screen.getByRole("link", { name: "Open in Search Console" });
    expect(link).toHaveAttribute(
      "href",
      "https://search.google.com/search-console?resource_id=sc-domain%3Aexample.com",
    );
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("links a URL-prefix property to Search Console", () => {
    renderPicker({
      connection: {
        property: {
          displayName: "https://example.com/",
          kind: "url-prefix",
          kindLabel: "url prefix",
          value: "https://example.com/",
        },
        status: "connected",
      },
    });

    expect(screen.getByRole("link", { name: "Open in Search Console" })).toHaveAttribute(
      "href",
      "https://search.google.com/search-console?resource_id=https%3A%2F%2Fexample.com%2F",
    );
  });

  it("links the property displayed for an archived view to Search Console", () => {
    renderPicker({
      viewedProperty: {
        displayName: "archive.example.com",
        kind: "domain",
        kindLabel: "domain",
        value: "sc-domain:archive.example.com",
      },
    });

    expect(screen.getByRole("link", { name: "Open in Search Console" })).toHaveAttribute(
      "href",
      "https://search.google.com/search-console?resource_id=sc-domain%3Aarchive.example.com",
    );
  });

  it("keeps menu and modal rows aligned across property lengths, kinds, and history states", async () => {
    const longUrl =
      "https://blog.example.com/a/very/long/path/that/must/not/push/the-kind-badge-outside-the-row/";
    const archivedUrl = "https://archive.example.com/an/older/property/with/a/long/path/";
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [
          {
            displayName: archivedUrl,
            kind: "url-prefix",
            kindLabel: "url prefix",
            lastSyncedDate: "2026-08-20",
            value: archivedUrl,
          },
        ],
        properties: [
          properties[0],
          {
            displayName: longUrl,
            kind: "url-prefix",
            kindLabel: "url prefix",
            permissionLevel: "siteFullUser",
            value: longUrl,
          },
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const activeRow = (await screen.findAllByRole("option", { name: /example\.com/i })).find(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    if (!activeRow) throw new Error("Active property option is missing.");
    const archivedRow = screen.getByRole("option", { name: /archive\.example\.com/i });
    const longMenuRow = screen.getByRole("option", { name: /very\/long\/path/i });
    for (const row of [activeRow, archivedRow, longMenuRow]) {
      expect(row.querySelector('[data-slot="property-row"]')).toHaveClass(
        "grid",
        "grid-cols-[15px_minmax(0,1fr)_max-content]",
        "min-w-0",
      );
      expect(row.querySelector('[data-slot="property-name"]')).toHaveClass(
        "min-w-0",
        "overflow-hidden",
      );
      expect(row.querySelector('[data-slot="property-kind"]')).toHaveClass(
        "justify-self-end",
        "shrink-0",
      );
    }
    expect(activeRow.querySelector('[data-slot="property-metadata"]')).toBeNull();
    expect(archivedRow.querySelector('[data-slot="property-metadata"]')).toHaveClass("col-start-2");

    const listbox = screen.getByRole("listbox", { name: "Search Console property" });
    const headers = listbox.querySelectorAll('[data-slot="menu-group-header"]');
    expect(headers).toHaveLength(3);
    expect([...headers].map((header) => header.textContent)).toEqual([
      "Active",
      "Archived",
      "Matches this project",
    ]);
    for (const [index, header] of [...headers].entries()) {
      expect(header).toHaveAttribute("role", "presentation");
      expect(header).toHaveClass("MuiListSubheader-gutters", "uppercase");
      expect(header).not.toHaveClass("font-mono");
      expect(header).not.toHaveClass("MuiListSubheader-sticky");
      expect(header).toHaveStyle({
        backgroundColor: "var(--bg-sunken)",
        marginBottom: "4px",
        marginInline: "-6px",
        marginTop: index === 0 ? "0px" : "4px",
        paddingInline: "15px",
        width: "calc(100% + 12px)",
        zIndex: "1",
      });
    }
    expect(listbox.querySelector('[data-slot="property-group-divider"]')).toBeNull();
    expect(listbox.textContent?.match(/Active/g)).toHaveLength(1);
    expect(activeRow.querySelector('[data-slot="property-metadata"]')).toBeNull();
  });

  it("loads the account properties only when the menu opens", async () => {
    const { loadPropertiesAction } = renderPicker();
    expect(loadPropertiesAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    expect(loadPropertiesAction).toHaveBeenCalledWith({ projectId: "prj_1" });
    const listbox = await screen.findByRole("listbox", { name: "Search Console property" });
    expect(listbox).toBeInTheDocument();
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).not.toHaveTextContent("Active");
    expect(options[0]).toHaveClass("border", "border-border");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    const activeHeadings = screen.getAllByText("Active", { exact: true });
    expect(activeHeadings).toHaveLength(1);
    expect(activeHeadings[0].nextElementSibling).toBe(options[0]);

    const connection = screen.getByRole("link", { name: "Manage connection" });
    const footer = connection.closest('[data-slot="menu-action-footer"]');
    expect(footer).toHaveClass("-mx-1.5", "-mb-3.5", "list-none", "pt-1.5");
    expect(footer).not.toHaveClass("mb-1.5");
    const divider = footer?.querySelector('[data-slot="menu-action-footer-divider"]');
    expect(divider).toHaveAttribute("role", "presentation");
    expect(divider).toHaveClass("m-0", "w-full");
    const content = footer?.querySelector('[data-slot="menu-action-footer-content"]');
    expect(content).toHaveClass("px-1.5", "py-1.5");
    expect(content?.parentElement).toBe(footer);
    expect(connection).toHaveClass("w-full", "MuiButton-outlined");
    expect(connection).toHaveAttribute("href", "/app/prj_1/integrations?connect=gsc#provider-gsc");
    expect(screen.queryByRole("button", { name: "Change property" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Change Search Console property" })).toBeNull();
  });

  it("keeps group headers out of listbox options and skips them with arrow navigation", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Search Console property" }));
    const active = (await screen.findAllByRole("option", { name: /example\.com/i })).find(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    expect(active).toBeDefined();

    active?.focus();
    expect(active).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /blog\.example\.com/i })).toHaveFocus();
    expect(screen.queryByRole("option", { name: "Matches this project" })).toBeNull();
  });

  it("treats the first rendered property group as first after a loading row", async () => {
    let resolveLoad: ((value: { properties: typeof properties }) => void) | undefined;
    renderPicker({
      connection: { property: null, status: "connected" },
      loadPropertiesAction: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
      ),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    expect(screen.getByRole("status", { name: "Loading properties" })).toBeInTheDocument();
    resolveLoad?.({ properties });

    const firstHeader = await screen.findByText("Matches this project");
    expect(firstHeader).toHaveAttribute("data-slot", "menu-group-header");
    expect(firstHeader).toHaveStyle({ marginBottom: "4px", marginTop: "0px" });
  });

  it("offers one secondary Connection button-link in the picker footer", async () => {
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const link = screen.getByRole("link", { name: "Manage connection" });
    expect(link).toHaveAttribute("href", "/app/prj_1/integrations?connect=gsc#provider-gsc");
    expect(link).toHaveClass("w-full", "MuiButton-outlined", "min-h-[30px]");
    expect(screen.queryByRole("button", { name: "Change property" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Change Search Console property" })).toBeNull();
  });

  it.each([
    {
      active: "sc-domain:example.com",
      displayName: "example.com",
      kind: "domain" as const,
      kindLabel: "domain",
    },
    {
      active: "https://blog.example.com/",
      displayName: "https://blog.example.com/",
      kind: "url-prefix" as const,
      kindLabel: "url prefix",
    },
  ])("places an overlapping $kind key in exactly one group", async (identity) => {
    renderPicker({
      connection: {
        property: {
          displayName: identity.displayName,
          kind: identity.kind,
          kindLabel: identity.kindLabel,
          value: identity.active,
        },
        status: "connected",
      },
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [
          {
            displayName: identity.displayName,
            kind: identity.kind,
            kindLabel: identity.kindLabel,
            lastSyncedDate: "2026-08-20",
            value: identity.active,
          },
        ],
        properties: [
          {
            displayName: identity.displayName,
            kind: identity.kind,
            kindLabel: identity.kindLabel,
            permissionLevel: "siteOwner",
            value: identity.active,
          },
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const matchesProperty = (_accessibleName: string, element: Element) =>
      element.querySelector('[data-slot="property-name"]')?.getAttribute("aria-label") ===
      identity.active;
    expect(screen.getAllByRole("option", { name: matchesProperty })).toHaveLength(1);
    expect(screen.getByRole("option", { name: matchesProperty })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows a viewed archived property once with selected semantics", async () => {
    const viewedProperty = {
      displayName: "https://archive.example.com/",
      kind: "url-prefix" as const,
      kindLabel: "url prefix",
      value: "https://archive.example.com/",
    };
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [{ ...viewedProperty, lastSyncedDate: "2026-08-20" }],
        properties: [properties[0], { ...viewedProperty, permissionLevel: "siteFullUser" }],
      }),
      viewedProperty,
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const archivedRows = screen.getAllByRole("option", { name: /archive\.example\.com/i });
    expect(archivedRows).toHaveLength(1);
    expect(archivedRows[0]).toHaveAttribute("aria-selected", "true");
  });

  it("returns from an archived view to the active property view", async () => {
    const viewedProperty = {
      displayName: "archive.example.com",
      kind: "domain" as const,
      kindLabel: "domain",
      value: "sc-domain:archive.example.com",
    };
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: {
        connect: "ga4",
        google: "select",
        period: "28",
        property: viewedProperty.value,
        provider: "ga4",
        reason: "drop",
      },
    });
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [{ ...viewedProperty, lastSyncedDate: "2026-08-20" }],
        properties,
      }),
      preserveGa4OauthSelection: true,
      viewedProperty,
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    const activeOption = (await screen.findAllByRole("option", { name: /example\.com/i })).find(
      (option) => option.textContent?.includes("Active") === false,
    );
    if (!activeOption) throw new Error("Active property option is missing.");
    await userEvent.click(activeOption);

    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/search-console?property=sc-domain%3Aexample.com&period=28&google=select&connect=ga4&provider=ga4",
    );
  });

  it("issues archived-view navigation from inside its own transition", async () => {
    routerMock.push.mockImplementation(() => {
      expect(transitions.active).toBe("view");
    });
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [
          {
            displayName: "archive.example.com",
            kind: "domain",
            kindLabel: "domain",
            lastSyncedDate: "2020-01-15",
            value: "sc-domain:archive.example.com",
          },
        ],
        properties,
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    await userEvent.click(await screen.findByRole("option", { name: /archive\.example\.com/i }));

    expect(transitions.view.start).toHaveBeenCalledOnce();
    expect(transitions.select.start).not.toHaveBeenCalled();
  });

  it("does not navigate when the displayed active property is selected", async () => {
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: { period: "28", property: connected.property.value },
    });
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    const activeOption = (await screen.findAllByRole("option", { name: /example\.com/i })).find(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    if (!activeOption) throw new Error("Active property option is missing.");
    await userEvent.click(activeOption);

    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("keeps active GA4 selection params while opening an archived view", async () => {
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: {
        connect: "ga4",
        google: "select",
        period: "28",
        property: "sc-domain:example.com",
        provider: "ga4",
        reason: "drop",
      },
    });
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [
          {
            displayName: "archive.example.com",
            kind: "domain",
            kindLabel: "domain",
            lastSyncedDate: "2026-08-20",
            value: "sc-domain:archive.example.com",
          },
        ],
        properties,
      }),
      preserveGa4OauthSelection: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    await userEvent.click(await screen.findByRole("option", { name: /archive\.example\.com/i }));

    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/search-console?property=sc-domain%3Aarchive.example.com&period=28&google=select&connect=ga4&provider=ga4",
    );
  });

  it("keeps nonmatching archived data in the quick menu when no live property matches", async () => {
    renderPicker({
      connection: { property: null, status: "connected" },
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [
          {
            displayName: "https://legacy.example.org/",
            kind: "url-prefix",
            kindLabel: "url prefix",
            lastSyncedDate: "2026-08-19",
            value: "https://legacy.example.org/",
          },
        ],
        properties: [
          {
            displayName: "https://unrelated.example.org/",
            kind: "url-prefix",
            kindLabel: "url prefix",
            permissionLevel: "siteFullUser",
            value: "https://unrelated.example.org/",
          },
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const listbox = screen.getByRole("listbox", { name: "Search Console property" });
    expect(within(listbox).getByText("Archived", { exact: true })).toBeInTheDocument();
    expect(
      within(listbox).getByRole("option", { name: /legacy\.example\.org/i }),
    ).toBeInTheDocument();
    expect(within(listbox).queryByText("Matches this project", { exact: true })).toBeNull();
    expect(
      within(listbox).queryByText("Other properties on this account", { exact: true }),
    ).toBeNull();
    expect(within(listbox).queryByRole("option", { name: /unrelated\.example\.org/i })).toBeNull();
  });

  it("keeps other live properties out of the quick menu for connection management", async () => {
    const archivedProperty = {
      displayName: "https://legacy.example.org/",
      kind: "url-prefix" as const,
      kindLabel: "url prefix",
      permissionLevel: "siteFullUser",
      value: "https://legacy.example.org/",
    };
    const otherProperty = {
      displayName: "https://unrelated.example.org/",
      kind: "url-prefix" as const,
      kindLabel: "url prefix",
      permissionLevel: "siteFullUser",
      value: "https://unrelated.example.org/",
    };
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [{ ...archivedProperty, lastSyncedDate: "2026-08-19" }],
        properties: [
          properties[0],
          properties[1],
          archivedProperty,
          archivedProperty,
          otherProperty,
          otherProperty,
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const listbox = screen.getByRole("listbox", { name: "Search Console property" });
    expect(
      within(listbox).queryByText("Other properties on this account", { exact: true }),
    ).toBeNull();
    expect(within(listbox).getAllByRole("option", { name: /legacy\.example\.org/i })).toHaveLength(
      1,
    );
    expect(within(listbox).queryByRole("option", { name: /unrelated\.example\.org/i })).toBeNull();

    expect(screen.getByRole("link", { name: "Manage connection" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Change Search Console property" })).toBeNull();
  });

  it("keeps an archived matching key only in Archived with relevance metadata", async () => {
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [
          {
            displayName: "https://archive.example.com/",
            kind: "url-prefix",
            kindLabel: "url prefix",
            lastSyncedDate: "2026-08-20",
            value: "https://archive.example.com/",
          },
        ],
        properties: [
          properties[0],
          {
            displayName: "https://archive.example.com/",
            kind: "url-prefix",
            kindLabel: "url prefix",
            permissionLevel: "siteFullUser",
            value: "https://archive.example.com/",
          },
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const archivedRow = screen.getByRole("option", { name: /archive\.example\.com/i });
    expect(archivedRow).toHaveTextContent("matches this project · last synced Aug 20, 2026");
    expect(screen.getAllByRole("option", { name: /archive\.example\.com/i })).toHaveLength(1);
  });

  it("saves a different property and refreshes the server render", async () => {
    const { selectPropertyAction } = renderPicker();

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    await userEvent.click(await screen.findByRole("option", { name: /blog\.example\.com/ }));
    expect(
      screen.getByRole("heading", { name: "Switch this project’s property?" }),
    ).toBeInTheDocument();
    expect(selectPropertyAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Switch property" }));
    expect(selectPropertyAction).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "https://blog.example.com/",
    });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
  });

  it("runs the property action and refresh from inside their own transition", async () => {
    const selectPropertyAction = vi.fn().mockImplementation(async () => {
      expect(transitions.active).toBe("select");
      return { property: "https://blog.example.com/", status: "saved" };
    });
    routerMock.refresh.mockImplementation(() => {
      expect(transitions.active).toBe("select");
    });
    renderPicker({ selectPropertyAction });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    await userEvent.click(await screen.findByRole("option", { name: /blog\.example\.com/ }));
    await userEvent.click(screen.getByRole("button", { name: "Switch property" }));

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(transitions.select.start).toHaveBeenCalledOnce();
    expect(transitions.view.start).not.toHaveBeenCalled();
  });

  it.each([
    ["view", transitions.view],
    ["select", transitions.select],
  ] as const)("shows the trigger pending state for the %s transition", (_name, state) => {
    state.pending = true;
    renderPicker();

    const trigger = screen.getByRole("button", { name: "Search Console property" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-busy", "true");
    expect(trigger.querySelectorAll("svg")).toHaveLength(2);
    expect(trigger.querySelectorAll("svg.animate-spin")).toHaveLength(1);
  });

  it("separates the switch question from interpolated import copy", async () => {
    const caterfulProperty = {
      displayName: "caterful.com",
      kind: "domain" as const,
      kindLabel: "domain",
      permissionLevel: "siteOwner",
      value: "sc-domain:caterful.com",
    };
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        properties: [properties[0], caterfulProperty],
      }),
      projectDomain: "caterful.com",
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    await userEvent.click(await screen.findByRole("option", { name: /caterful\.com/ }));

    const dialog = screen.getByRole("dialog", { name: "Switch this project’s property?" });
    expect(dialog.textContent).toContain(
      "Switch this project to caterful.com? Importing 16 months",
    );
    expect(dialog.textContent).not.toContain("caterful.com?Importing");
  });

  it("offers the reconnect message instead of an empty list after a lost consent", async () => {
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({ properties: [], requiresReauth: true }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    expect(
      await screen.findByText("Reconnect the Google account to load its properties."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /blog\.example\.com/ })).toBeNull();
  });

  it("calls a failed load transient and loads again on the next open", async () => {
    const loadPropertiesAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("The properties service is away."))
      .mockResolvedValue({ properties });
    renderPicker({ loadPropertiesAction });

    const trigger = screen.getByRole("button", { name: "Search Console property" });
    await userEvent.click(trigger);
    expect(await screen.findByText("The properties service is away.")).toBeInTheDocument();
    expect(
      screen.queryByText("Reconnect the Google account to load its properties."),
    ).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(trigger);

    expect(loadPropertiesAction).toHaveBeenCalledTimes(2);
    expect(await screen.findAllByRole("option")).toHaveLength(2);
  });

  it("names an empty account and asks again on the next open", async () => {
    const loadPropertiesAction = vi
      .fn()
      .mockResolvedValueOnce({ properties: [] })
      .mockResolvedValue({ properties });
    renderPicker({ loadPropertiesAction });

    const trigger = screen.getByRole("button", { name: "Search Console property" });
    await userEvent.click(trigger);
    expect(await screen.findByText("No properties on this account.")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /blog\.example\.com/ })).toBeNull();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(trigger);

    expect(loadPropertiesAction).toHaveBeenCalledTimes(2);
    expect(await screen.findAllByRole("option")).toHaveLength(2);
  });

  it("keeps a provider failure separate from a lost consent", async () => {
    renderPicker({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        error: "Properties could not be loaded. Try again or reconnect the account.",
        properties: [],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    expect(
      await screen.findByText(
        "Properties could not be loaded. Try again or reconnect the account.",
      ),
    ).toBeInTheDocument();
  });

  it("links to connection when no property is connected", () => {
    renderPicker({ connection: { property: null, status: "not_connected" } });

    const trigger = screen.getByRole("link", { name: "Search Console property" });
    expect(trigger).toHaveTextContent("No property connected");
    expect(decodeURIComponent(trigger.getAttribute("href") ?? "")).toContain(
      "returnPath=/app/prj_1/search-console",
    );
  });
  it("uses option-shaped skeletons instead of loading copy while properties load", async () => {
    let resolveLoad: ((value: { properties: typeof properties }) => void) | undefined;
    renderPicker({
      loadPropertiesAction: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
      ),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    const loadingRow = screen.getByRole("status", { name: "Loading properties" });
    expect(loadingRow).toBeInTheDocument();
    expect(loadingRow).toHaveClass("h-8", "border", "border-transparent", "rounded-control");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage connection" })).toBeInTheDocument();
    expect(screen.queryByText("Loading properties...")).not.toBeInTheDocument();
    resolveLoad?.({ properties });
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Loading properties" })).toBeNull(),
    );
  });
});
