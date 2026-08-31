import Script from "next/script";

type InlineScriptProps = {
  html: string;
  id: string;
};

export function InlineScript({ html, id }: Readonly<InlineScriptProps>) {
  return (
    <Script id={id} strategy="beforeInteractive">
      {html}
    </Script>
  );
}
