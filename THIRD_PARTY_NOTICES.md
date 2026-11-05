# Third-party notices

This project is MIT licensed. Its compatibility adapter includes the MIT-licensed
DeepSeek Harness workspace browser for **0.2.2-rc.1**. The original copyright and
license are retained in [vendor/LICENSE.deepseek](vendor/LICENSE.deepseek).

- Upstream: <https://github.com/deepseek-ai/deepseek-harness>
- Vendored artifacts: `vendor/workspace-client-0.2.2-rc.1.js` and
  `vendor/sidebar-client-0.2.2-rc.1.js`, taken from the official npm packages
  `@deepseek-ai/dsh-client-ui-workspace@0.2.2-rc.1` and
  `@deepseek-ai/dsh-client-ui-sidebar@0.2.2-rc.1`.
- `lib/client.js` contains the workspace adapter. `build.mjs` records the SHA-256
  of both original artifacts in `lib/build-info.json`.
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
