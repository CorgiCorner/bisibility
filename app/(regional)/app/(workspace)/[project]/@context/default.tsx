/**
 * Every project route that carries no context. It renders nothing, and rendering nothing is the
 * point: the market read lives in the slot's market page, so a project-scoped page - which is
 * most of them - never reaches it and never pays for a list the header could not show anyway.
 */
export default function NoHeaderContext() {
  return null;
}
