import { constants } from 'node:fs';
import { access, rename, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const viteBin = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const liveDir = path.join(frontendRoot, 'dist');
const nextDir = path.join(frontendRoot, '.dist-next');
const previousDir = path.join(frontendRoot, '.dist-previous');
const requestedHeap = Number.parseInt(process.env.PEERPREP_BUILD_HEAP_MB || '3072', 10);
const heapMb = Number.isFinite(requestedHeap) && requestedHeap >= 2048 ? requestedHeap : 3072;

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runBuild() {
  await rm(nextDir, { recursive: true, force: true });
  await rm(previousDir, { recursive: true, force: true });

  const child = spawn(
    process.execPath,
    [`--max-old-space-size=${heapMb}`, viteBin, 'build', '--outDir', nextDir, '--emptyOutDir'],
    {
      cwd: frontendRoot,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    },
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Vite build terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    await rm(nextDir, { recursive: true, force: true });
    throw new Error(`Vite build failed with exit code ${exitCode}; existing dist was preserved.`);
  }
}

async function publishBuild() {
  const hadLiveBuild = await exists(liveDir);
  if (hadLiveBuild) await rename(liveDir, previousDir);

  try {
    await rename(nextDir, liveDir);
  } catch (error) {
    if (hadLiveBuild && await exists(previousDir) && !await exists(liveDir)) {
      await rename(previousDir, liveDir);
    }
    throw error;
  }

  await rm(previousDir, { recursive: true, force: true });
}

try {
  await runBuild();
  await publishBuild();
  process.stdout.write(`Published frontend build atomically (Node heap limit: ${heapMb} MB).\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
