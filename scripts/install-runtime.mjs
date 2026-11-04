import { spawnSync } from "node:child_process";
// Electron 45 downloads lazily. Materialize it for offline development/packaging.
// @electron/get uses undici's EnvHttpProxyAgent when this flag is set.
const proxy =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy;
const result = spawnSync(
  process.execPath,
  ["node_modules/electron/install.js"],
  {
    stdio: "inherit",
    env: { ...process.env, ...(proxy ? { ELECTRON_GET_USE_PROXY: "1" } : {}) },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
