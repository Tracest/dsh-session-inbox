# Changelog

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
