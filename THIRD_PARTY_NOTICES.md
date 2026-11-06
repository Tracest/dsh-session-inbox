# Third-party notices

This project is MIT licensed. Its regression fixtures include the MIT-licensed
DeepSeek Harness workspace browsers for the **16 versions in compatibility.json**.
At runtime it enhances the installed native workspace module in memory.
The original copyright and
license are retained in [vendor/LICENSE.deepseek](vendor/LICENSE.deepseek).

- Upstream: <https://github.com/deepseek-ai/deepseek-harness>
- Vendored artifacts: `vendor/workspace-client-<version>.js` and
  `vendor/sidebar-client-<version>.js`, taken from the corresponding official npm
  packages `@deepseek-ai/dsh-client-ui-workspace` and `@deepseek-ai/dsh-client-ui-sidebar`.
  Versions: 0.1.7-rc.1/rc.2, 0.2.0-rc.1/rc.2, 0.2.1-alpha.1–alpha.5,
  0.2.1-rc.1–rc.5, 0.2.2-alpha.3/rc.1.
- Vendored workspace/sidebar artifacts are build and test fixtures, excluded from
  the npm package. `build.mjs` records their SHA-256 in `lib/build-info.json`.
  `lib/runtime-template.json` contains the enhancement, not these native copies.
- Compact styles resolve the class map from the active official sidebar's own
  stylesheet at runtime. The official sidebar remains active.
- `test/fixtures/sidebar-windows-0.2.1-rc.5.css` retains the native Windows
  SidebarRoot stylesheet as a regression fixture under the same DeepSeek MIT notice.

T3 Code's compact header and Working/Settled organization were design references.
This workbench places its utility entries above the list. No T3 Code implementation
is included in this package.
<https://github.com/pingdotgg/t3code/blob/v0.1.5/apps/web/src/components/Sidebar.tsx>

DSH and DeepSeek names identify compatibility with the upstream application.
This is an independent community plugin and is not an official DeepSeek product.
