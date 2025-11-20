import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = join(__dirname, '..', 'out');
const baseSegment = 'Appagar';

function copyIfMissing(sourceName, targetName) {
  const sourcePath = join(outDir, sourceName);
  const targetPath = join(outDir, targetName);

  if (!existsSync(sourcePath)) {
    console.warn(`[post-export-fix] Source file missing: ${sourceName}`);
    return;
  }

  try {
    copyFileSync(sourcePath, targetPath);
    console.info(`[post-export-fix] Copied ${sourceName} -> ${targetName}`);
  } catch (error) {
    console.error(`[post-export-fix] Failed to copy ${sourceName} -> ${targetName}`, error);
  }
}

copyIfMissing('index.html', `${baseSegment}.html`);
copyIfMissing('index.txt', `${baseSegment}.txt`);
