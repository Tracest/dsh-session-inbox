# Third-party notices

This project is MIT licensed. Its compatibility adapter includes the MIT-licensed
DeepSeek Harness workspace browser for **0.2.1-rc.5**. The original copyright and
license are retained in [vendor/LICENSE.deepseek](vendor/LICENSE.deepseek).

- Upstream: <https://github.com/deepseek-ai/deepseek-harness>
- Vendored artifacts: `vendor/workspace-client-0.2.1-rc.5.js` and
  `vendor/sidebar-client-0.2.1-rc.5.js`.
- `lib/client.js` contains the workspace adapter. `build.mjs` records the SHA-256
  of both original artifacts in `lib/build-info.json`.
- The sidebar artifact supplies its version-specific CSS class map at build
  time. The official sidebar remains active at runtime.

T3 Code's compact header and Working/Settled organization were design references.
This workbench places its utility entries above the list. No T3 Code implementation
is included in this package.
<https://github.com/pingdotgg/t3code/blob/v0.1.5/apps/web/src/components/Sidebar.tsx>

DSH and DeepSeek names identify compatibility with the upstream application.
This is an independent community plugin and is not an official DeepSeek product.
