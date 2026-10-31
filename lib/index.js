/**
 * dsh-sidebar-flex — host half.
 *
 * The whole feature is browser-side (the sidebar column is rendered by the
 * client layout plugin), so the host half only has to exist as a mountable
 * cordis plugin. Keeping it inert means no host services, no restart cost.
 */

export const name = "sidebar-flex";

export function apply() {}
