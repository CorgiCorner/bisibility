import { Fragment } from "react";

/**
 * Wraps a shell command at spaces. A `--flag value` pair moves to the next line
 * as one unit and only breaks inside when it is wider than the container.
 */
export function CommandText({ command }: Readonly<{ command: string }>) {
  const tokens = command.split(" ");
  const parts: string[][] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const value = tokens[index + 1];
    if (token.startsWith("--") && value !== undefined) {
      parts.push([token, value]);
      index += 1;
    } else {
      parts.push([token]);
    }
  }
  return parts.map((part, index) => (
    <Fragment key={`${index}-${part.join(" ")}`}>
      {index > 0 ? " " : null}
      {part.length > 1 ? (
        <span className="inline-block max-w-full">{part.join(" ")}</span>
      ) : (
        part[0]
      )}
    </Fragment>
  ));
}
