/**
 * Post-build verification guard for dist/ output.
 * Ensures dist/index.html exists, no accidental dev screenshots/docs leaked into dist/,
 * and prints a compact bundle size summary.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

const FORBIDDEN_EXTENSIONS = new Set(['.jpg', '.jpeg', '.md']);

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === 'aistudio') {
        throw new Error(`Forbidden directory detected in dist/: ${fullPath}`);
      }
      walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

if (!fs.existsSync(distDir)) {
  console.error(`verify-dist failed: dist directory not found at ${distDir}`);
  process.exit(1);
}

const indexHtml = path.join(distDir, 'index.html');
if (!fs.existsSync(indexHtml)) {
  console.error('verify-dist failed: dist/index.html is missing');
  process.exit(1);
}

const allFiles = walk(distDir);
let totalBytes = 0;

for (const filePath of allFiles) {
  const ext = path.extname(filePath).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    console.error(`verify-dist failed: forbidden asset "${path.relative(distDir, filePath)}" found in dist/`);
    process.exit(1);
  }
  totalBytes += fs.statSync(filePath).size;
}

const totalKb = (totalBytes / 1024).toFixed(1);
const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
console.log(`verify-dist OK: ${allFiles.length} files, total bundle size ${totalKb} KB (${totalMb} MB)`);
