# Changelog

## 0.4.5 — 2026-11-05

- Support 16 exact DSH releases: 0.1.7-rc.1/rc.2, 0.2.0-rc.1/rc.2,
  0.2.1-alpha.1–alpha.5, 0.2.1-rc.1–rc.5 and 0.2.2-alpha.3/rc.1.
  Select each release's own published workspace adapter; keep unverified versions guarded.
- Identify older hosts through their owning runtime when the boot manifest lacks
  release metadata, including launchers installed through directory links.
- Preserve legacy native menu slots, rename access and keyboard dismissal.
  Handle older optional sidebar wrappers, hover groups, shortcut hooks and row slots.
- Retain the rounded icons, floating Undo notice, storage key and backup format.
- Pass 75 JavaScript tests, 6 installer tests and 13 isolated Windows Web checks
  on each supported runtime (208 browser checks). Fixtures make empty test sessions
  visible in the workbench; no model API calls or cross-platform acceptance claims.
- Exclude 0.2.2-alpha.2 after native first-run and session-creation failures;
  its first-run failure also reproduced without the plugin.

## 0.4.4 — 2026-11-05

- Give workbench controls a consistent Claude-inspired appearance with small,
  rounded, monochrome SVG icons and subtle warm-gray hover backgrounds. Keep
  the existing Settle, restore, native menu and keyboard actions.
- Move transient notices into a bottom floating toast without shifting the
  session list. Keep Settle feedback short, with Undo and an accessible close
  button; Escape dismisses a focused toast.
- Dismiss notices after five seconds of unpaused time. Hover and keyboard focus
  pause the countdown; a new action resets it and replaces the undo target.
- Retain the DSH `0.2.2-rc.1` engine guard, existing storage key and backup format.

## 0.4.3 — 2026-11-05

- Adapt to DSH `0.2.2-rc.1` using its published native workspace and sidebar
  artifacts, retaining the exact engine guard. DSH `0.2.1-rc.5` users keep `0.4.2`.
- Route session menus, right click and Shift+F10 through the new native
  context-menu service so built-in actions and extension entries remain available.
- Honor native rename permissions on title double-click, and keep blank-session
  menu actions disabled.
- Use the package engine requirement in the builder and optional local installer
  to prevent version checks from drifting apart. Rebuild the checked-in bundle
  and update regression coverage for the current native styles and menu contract.
- Preserve the existing list-state storage key and backup format.

## 0.4.2 — 2026-11-03

- Carry the Windows sidebar fix from `0.4.1+windows.1` under a normal patch version.
  DSH accepts build metadata but does not treat it as a newer version than `0.4.1`.
- Rebuild the browser adapter with the new version; runtime behavior is unchanged.
- Update the author market index and compatibility descriptions for the verified
  DSH `0.2.1-rc.5` scope. Linux and arbitrary third-party plugin combinations remain unverified.

## 0.4.1+windows.1 — 2026-11-02

- Resolve compact-sidebar CSS classes from the active official sidebar stylesheet,
  supporting the different class hashes in Windows Desktop builds.
- Normalize Windows checkout line endings before building the browser adapter.
- Preserve the official sidebar, all native fallback styles, conversations and list metadata.
- Verify Windows cold starts, layout switching at 1280×820 and 1471×1200,
  search, project filtering and native session menus. Add Windows stylesheet regression coverage.

## 0.4.1 — 2026-10-31

- Fix missing native list, row and workspace-picker CSS after switching to the original layout.
  Compact-shell cleanup now preserves all four native compatibility sheets.
- Isolate original mode from workbench input/button styles.
- Keep the original list's default spacing; use a small return control beside its
  header rather than an additional toolbar. It hides while native search is open.
- Prevent disposal of an older shell instance from clearing the replacement's layout mode.

## 0.4.0 — 2026-10-31

- Put the five native tool entries and original-layout control above the session list.
- Reveal collapsed search matches without changing saved folds; highlight literal matches.
- Reuse native session menus, leading decorations and hover extensions.
- Prioritize pending interactions in the untitled inbox and mark unseen completions,
  including completions behind global panels. Opening or settling clears the reminder.
- Support native search shortcuts, arrow/Home/End navigation, Enter to open,
  Shift+Enter to settle or restore, and Escape to clear search.
- Export list metadata to a portable JSON file and preview a merge before restoring.
  Keep current records and preferences by default; never import conversation bodies.
- Keep running work in the lower Working shelf and manual Settle in the lower Settled shelf.

The compatibility target remains DSH 0.2.1-rc.5. Restart DSH after updating when
tasks are idle so all native conversation UI dependencies bind cleanly.
