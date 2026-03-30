/* eslint-env node */
/* eslint-disable no-undef */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function log(msg) { console.log(`[debug-rollup] ${msg}`); }

(async () => {
  try {
    const root = process.cwd();
    const rollupDir = join(root, 'node_modules', 'rollup', 'dist');
    log(`Node version: ${process.version}`);
    log(`Working directory: ${root}`);
    if (!existsSync(rollupDir)) {
      log('rollup/dist not found');
      process.exit(0);
    }
    const files = readdirSync(rollupDir).filter(f => f.startsWith('rollup.') && f.endsWith('.node'));
    log(`Native rollup binaries present: ${files.length ? files.join(', ') : 'none'}`);
    const platform = process.platform;
    const arch = process.arch;
    log(`Platform: ${platform} Arch: ${arch}`);

    // Try importing rollup and fallback to wasm package if necessary
    try {
      const rollup = await import('rollup');
      log(`Loaded rollup (ESM) version: ${rollup.VERSION || rollup.default?.VERSION || 'unknown'}`);
    } catch (e) {
      log('ESM import("rollup") failed: ' + (e && e.message));
      try {
        await import('@rollup/wasm-node');
        log('Loaded wasm fallback OK');
      } catch (we) {
        log('WASM fallback failed: ' + we.message);
      }
    }

    // List installed @rollup/rollup-* scoped packages if any
    const nm = join(root, 'node_modules', '@rollup');
    if (existsSync(nm)) {
      const scoped = readdirSync(nm).filter(d => d.startsWith('rollup-'));
      log(`@rollup scoped platform packages: ${scoped.length ? scoped.join(', ') : 'none'}`);
    } else {
      log('@rollup scope directory not found');
    }
  } catch (err) {
    log('Script error: ' + err.message);
  }
})();
