import { copyFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = join(__dirname, '..', 'out');
const baseSegment = 'Appagar';
const routesDir = join(outDir, baseSegment);

function copyTo(sourceName, targetName) {
  const sourcePath = join(outDir, sourceName);
  const targetPath = join(outDir, targetName);
  const targetDir = dirname(targetPath);

  if (!existsSync(sourcePath)) {
    console.warn(`[post-export-fix] Source file missing: ${sourceName}`);
    return;
  }

  try {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    copyFileSync(sourcePath, targetPath);
    console.info(`[post-export-fix] Copied ${sourceName} -> ${targetName}`);
  } catch (error) {
    console.error(`[post-export-fix] Failed to copy ${sourceName} -> ${targetName}`, error);
  }
}

copyTo('index.html', `${baseSegment}.html`);
copyTo('index.txt', `${baseSegment}.txt`);
copyTo('index.html', `${baseSegment.toLowerCase()}.html`);
copyTo('index.txt', `${baseSegment.toLowerCase()}.txt`);
copyTo('index.html', join(baseSegment, 'index.html'));
copyTo('index.txt', join(baseSegment, 'index.txt'));
copyTo('index.html', join(baseSegment.toLowerCase(), 'index.html'));
copyTo('index.txt', join(baseSegment.toLowerCase(), 'index.txt'));

// If Next.js output contains a top-level `_next` folder, copy it under the base path
// so that assets referenced as `/Appagar/_next/...` resolve correctly on static hosts.
try {
  const nextSrc = join(outDir, '_next');
  const nextDest = join(outDir, baseSegment, '_next');
  if (existsSync(nextSrc)) {
    if (!existsSync(nextDest)) {
      mkdirSync(nextDest, { recursive: true });
    }
    cpSync(nextSrc, nextDest, { recursive: true });
    console.info(`[post-export-fix] Copied _next -> ${join(baseSegment, '_next')}`);
  }
} catch (err) {
  console.warn('[post-export-fix] Failed to copy _next directory', err);
}
