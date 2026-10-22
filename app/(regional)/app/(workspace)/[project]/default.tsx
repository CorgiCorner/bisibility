import { notFound } from "next/navigation";

/** The bare project URL has no page; keep the 404 that strict route matching requires to be explicit. */
export default function ProjectChildrenDefault(): never {
  notFound();
}
