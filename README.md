# dsh-sidebar-flex

A draggable, remembered splitter that gives the DeepSeek Harness sidebar's
workspace / session list the vertical space it needs.

## Why

In the DSH web GUI two things live inside the same sidebar column:

- the **global panel list** — Plugins, Plugin market, Automation, MCP
  connectors, Learn, Remotion, More — which does _not_ scroll and eats
  roughly 396 px of a 1234 px-tall window;
- the **workspace / session region** — whatever is left over, often about
  120–140 px, i.e. two session rows.

The shell offers no way to trade one against the other, so long session lists
are clipped and the session you want simply cannot be clicked. This plugin
adds that trade-off as a drag handle.

## What it does

A 10 px splitter sits directly under the global panel list:

| Gesture | Result |
| --- | --- |
| Drag the splitter up / down | Shrinks / grows the panel list; the freed height goes to the workspace + session region, which is what you actually want to read |
| Double-click or right-click the splitter | Restores the panel list to its natural height |
| <kbd>↑</kbd> / <kbd>↓</kbd> while the splitter is focused | Nudges the height by 24 px |
| Reload, restart, next launch | Height is restored from `localStorage["dsh-sidebar-flex:nav-height"]` |

The panel list has a 54 px floor (one row). At any height below its natural
height it becomes scrollable, so nothing is lost — only re-budgeted.

The sidebar **width is intentionally untouched**: the shell keeps its own
264–420 px clamp and its own edge handle. Earlier experiments with taking the
width over still live in `lib/client.js` behind `ENABLE_WIDTH` (default
`false`) and are off.

## Install

Profiles live under `<DSH data dir>/profiles/<profile>`
(e.g. `C:\Users\<you>\.dsh\profiles\desktop`). A client bundle has to be a
package inside the profile's `node_modules`, listed in the profile manifest.

1. Put this package into the profile's `node_modules` — copy the directory or
   make a junction / symlink to a checkout:

   ```powershell
   # Windows, from a checkout of this repo
   New-Item -ItemType Junction `
     -Path  "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-sidebar-flex" `
     -Target (Resolve-Path .)
   ```

2. Append the package name to `dsh.profile.bundles` in the profile's
   `package.json`:

   ```json
   {
     "dsh": {
       "profile": {
         "bundles": ["...", "dsh-sidebar-flex"]
       }
     }
   }
   ```

3. Save the file. `@deepseek-ai/dsh-hmr` watches the profile manifest,
   recomposes the profile and pushes the new client graph over SSE — the
   splitter appears without restarting the app. If it does not, reload the
   window once.

> Deliberately **not** registered in `dependencies`: the plugin manager's
> `reconcile()` drops bundles that used to be dependencies but no longer are,
> so an unmanaged bundle is the more stable arrangement.

## How it works

The client half only. It polls for the sidebar column, finds the global panel
list inside it, and writes an inline `height` plus a "shrunk" class that makes
the list scrollable. A `MutationObserver` re-applies the height when React
re-renders the column (React rewrites inline styles on every render), and the
handle is re-parented if the shell replaces the list node. No client service,
no React state, nothing that could break at boot.

Selectors are matched by `[class*='panelList']` / `[class*='sidebarCol']`
because DSH hashes its CSS-module class names.

## Notes

- The host half (`lib/index.js`) is inert on purpose: the layout is rendered by
  the browser, so there is no host service and no restart cost.
- If a theme adds decoration over the bottom of the sidebar, the session list's
  bottom padding belongs to that theme; this plugin only changes the panel
  list's height and never touches the conversation column.
- Width takeover (`ENABLE_WIDTH = true`): rewrites the first grid track to
  `200px … viewport − 420px` and hides the shell's own edge handle. When it is
  switched back off, teardown clamps the track to the native 264–420 px range so
  the shell can take over again.

## Uninstall

1. Remove `"dsh-sidebar-flex"` from `dsh.profile.bundles`.
2. Delete the `node_modules/dsh-sidebar-flex` entry (junction or copy).
3. Optionally clear `localStorage["dsh-sidebar-flex:nav-height"]`.

## Compatibility

`peerDependencies: @deepseek-ai/dsh >=0.2.0-rc.2 <0.3.0-0`.
Built and verified against the 0.2.2 client bundles of
`@deepseek-ai/dsh-client-ui-layout`, `-ui-sidebar` and `-ui-workspace`
(selectors: `[class*='sidebarCol']`, `[class*='panelList']`).

## License

MIT © 2026 yuyu121704
