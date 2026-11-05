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

type GetImagePropsArgs = {
  alt?: string;
  sizes?: string;
  src?: string;
};

/** Matches next/image: callers read props.src, props.srcSet and props.sizes. */
export function getImageProps({ alt = "", sizes, src = "" }: GetImagePropsArgs) {
  return {
    props: {
      alt,
      ...(sizes ? { sizes } : {}),
      src,
      ...(src ? { srcSet: `${src} 1x` } : {}),
    },
  };
}
