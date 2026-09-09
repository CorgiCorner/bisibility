import { execFileSync } from "node:child_process";
import { appRootPath } from "@/lib/routing/app-path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupSuccess } from "./SetupSuccess";

const rscGuard = String.raw`
const Module = require("node:module");
const path = require("node:path");
const esbuild = require("esbuild");
const React = require("react");
const {
  registerClientReference,
  renderToReadableStream,
} = require("next/dist/compiled/react-server-dom-turbopack/server.node");

const stubs = {
  "@/components/ui/Button": "const Button = registerClientReference({}, 'setup-button-client', 'Button'); exports.Button = Button;",
  "@/components/ui/ExternalLink": "exports.ExternalLink = ({ children, ...props }) => React.createElement('a', props, children);",
  "@/lib/routing/app-path": "exports.appRootPath = (...segments) => '/app' + (segments.length ? '/' + segments.join('/') : '');",
  "next/link": "module.exports = ({ children, ...props }) => React.createElement('a', props, children);",
};

async function main() {
  const root = process.cwd();
  const component = path.join(root, "app/setup/SetupSuccess.tsx");
  const result = await esbuild.build({
    bundle: true,
    entryPoints: [component],
    external: [
      "next/dist/compiled/react-server-dom-turbopack/server.node",
      "react",
      "react/jsx-runtime",
    ],
    format: "cjs",
    platform: "node",
    plugins: [{
      name: "rsc-boundary-stubs",
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => ({ namespace: "stub", path: args.path }));
        build.onResolve({ filter: /^next\/link$/ }, () => ({ namespace: "stub", path: "next/link" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: stubs[args.path],
          loader: "tsx",
        }));
      },
    }],
    write: false,
  });
  const componentModule = new Module(component);
  componentModule.filename = component;
  componentModule.paths = Module._nodeModulePaths(root);
  componentModule._compile(result.outputFiles[0].text, component);
  const errors = [];
  const stream = renderToReadableStream(
    React.createElement(componentModule.exports.SetupSuccess, { mailerConfigured: true }),
    {
      "setup-button-client": {
        async: false,
        chunks: [],
        id: "setup-button-client",
        name: "Button",
      },
    },
    { onError: (error) => { errors.push(error); } },
  );
  const reader = stream.getReader();
  while (!(await reader.read()).done) {}
  if (errors.length) throw errors[0];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

function renderSetupSuccessThroughRsc() {
  execFileSync(process.execPath, ["--conditions=react-server", "--eval", rscGuard], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
}

describe("SetupSuccess", () => {
  it("serializes the project action across the server to client boundary", () => {
    expect(renderSetupSuccessThroughRsc).not.toThrow();
  });

  it("makes the project primary while retaining the admin link", () => {
    render(<SetupSuccess mailerConfigured />);

    const workspaceLink = screen.getByRole("link", { name: "Go to your project" });
    const adminLink = screen.getByRole("link", { name: "Open the admin panel" });

    expect(workspaceLink).toHaveAttribute("href", appRootPath());
    expect(workspaceLink).toHaveAttribute("data-slot", "button");
    expect(adminLink).toHaveAttribute("href", appRootPath("admin"));
    expect(adminLink).toHaveAttribute("target", "_blank");
    expect(adminLink).toHaveAttribute("rel", "noreferrer noopener");
    expect(adminLink).not.toHaveAttribute("data-slot", "button");
    const icon = adminLink.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("puts the email delivery title on its own line", () => {
    render(<SetupSuccess mailerConfigured={false} />);

    const title = screen.getByText("Next: configure email delivery.");
    expect(title.tagName).toBe("STRONG");
    expect(title).toHaveClass("block");
    expect(
      screen.getByText(/Sign-in codes for other users need a working email provider/),
    ).toBeInTheDocument();
  });
});
