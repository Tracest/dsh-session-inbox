# DSH Session Workbench

[简体中文](README.zh-CN.md) · [MIT license](LICENSE)

A compact session sidebar for **DeepSeek Harness 0.2.1-rc.5**. Group conversations
by project, follow **Working** and **Needs attention**, move finished work into
**Settled**, and switch back to the full original DSH layout with one click.

The current workbench labels are Chinese. **macOS Desktop is the verified
platform.** The same browser component can load in `dsh web`; Windows and Linux
desktop geometry have not been accepted as supported platforms.

<img src="assets/sidebar.jpg" alt="Actual DSH Session Workbench sidebar" width="280">

## Install

In DSH Desktop, open **Plugins → Add plugin → Git source** and use:

```text
https://github.com/Tracest/dsh-session-inbox
```

For a command-line web profile:

```sh
dsh plugin --profile web add git+https://github.com/Tracest/dsh-session-inbox.git
```

Use the profile that serves your application. Installing into `web` does not
change DSH Desktop's `desktop` profile. The compiled browser bundle is checked
in, so installation does not run a build script or require an npm account.
After installation, exit and reopen DSH when its tasks are idle so all UI
dependencies bind to the replacement workspace module.

This package declares an exact `engines.dsh` requirement intentionally. It
adapts a version-specific UI contract and must be revalidated before widening it.

If you are upgrading the earlier local-only build, remove its marked
`# dsh-session-inbox managed section` override using that build's recovery script
before adding this standard bundle. Never load both copies at once. Chat logs
and local Settle records use the same storage key and remain available.

## What it changes

- Compact header with New session and the native sidebar toggle.
- One search row with project filter and list options.
- Running sessions appear at the top; approvals/questions remain in Needs
  attention. Empty Working sections are hidden.
- Settle and Restore change only the plugin's list metadata. They do not
  archive, delete, stop, or rewrite a conversation.
- Settled stays at the bottom and scrolls independently when expanded.
- The native global tool entries move to a bottom grid, retaining their icons,
  accessible names, callbacks, registration order, and account menu.
- The **原布局** button restores the complete original sidebar and session
  browser. **切到工作台** returns to the workbench.

The folder button filters projects. **⋯** controls project grouping, native
archive visibility, project management, and refresh. An archived chat's open
button is explicitly labelled “restore and open”: that action uses DSH's native
unarchive operation; Settle does not.

## Compatibility with other plugins

This is a session-browser replacement, not a universal skin for every plugin.

| Plugin extension | Behavior |
| --- | --- |
| Standard `sidebar.panellist` entries | Discovered by the official sidebar and displayed in the bottom grid; additional entries wrap onto another row. |
| Models, tools, MCP, skills, conversation panels | Their registrations and configuration remain in DSH. This package does not replace them. |
| Context, image generation, tide badge, task board | Coexistence and their available UI entries were verified on macOS DSH 0.2.1-rc.5. |
| Native session-row menus, hover extensions and row actions | Retained in the original browser. The workbench has its own rows; switch to **原布局** to use these extensions. |
| Another plugin replacing `sidebar`, `sidebar.workspaces`, or the `uiWorkspace` service | Mutually exclusive unless specifically adapted. Keep only one replacement enabled. |
| Themes that override sidebar geometry or generated native classes | May need an adaptation; not covered by a blanket compatibility claim. |

## Data and removal

Preferences, collapsed groups, and Settle marks stay in the current DSH
browser origin's `localStorage`, under `dsh-session-inbox:state:v1`. They are not
part of the chat log and are not shared across devices. Clearing site data
removes those extra marks. Fresh user activity or renewed execution brings a
settled conversation back to attention; old history hydration does not.

Switching layouts does not uninstall anything. To remove a standard bundle, use
DSH's plugin manager, or for the CLI profile:

```sh
dsh plugin --profile web remove dsh-session-inbox
```

Then restart when idle. DSH restores its official workspace module. The optional
`install.py` and `.command` files are only for local macOS installation; their
recovery helper removes only its own profile override, not a manager-installed
bundle. No install-time script runs automatically.

## Development

```sh
npm run build
npm test
npm pack --dry-run
```

No JavaScript dependencies are needed to build the checked-in browser adapter.
`build.mjs` verifies its replacement hooks, parses the native class map, syntax
checks the output, and records upstream hashes. The official `ui-sidebar`
remains loaded. Neither `app.asar` nor user conversations are patched.

Checks cover classification, safe Settle/restore, resumed work, corrupt state,
partial catalogs, legacy preferences, stale timestamp hydration, and previously
settled empty chats. The macOS desktop was also exercised with real model
turns, project creation/rename, filters, collapse/expand, native tool navigation,
layout switching, and cold starts. That evidence does not establish universal
third-party or cross-platform support.

## Attribution

[DeepSeek's MIT notice](vendor/LICENSE.deepseek) is retained for the version-pinned
native workspace adapter. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The layout was inspired by T3 Code's compact header, utility footer, and
Working/Settled organization; no T3 Code implementation is included.

Independent community project, not affiliated with DeepSeek or T3 Code.
