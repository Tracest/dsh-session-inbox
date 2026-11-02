# Changelog

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
