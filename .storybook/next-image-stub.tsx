import React from "react";

type ImageProps = {
  alt?: string;
  src?: string;
  [key: string]: unknown;
};

export default function Image({
  alt = "",
  src = "",
  unoptimized: _unoptimized,
  ...props
}: ImageProps) {
  return React.createElement("img", { ...props, alt, src });
}
