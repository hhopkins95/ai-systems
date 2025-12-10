import { readdir, readFile } from 'fs/promises';
import path from 'path';

const IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  '.DS_Store',
  '*.log',
  '.env',
  '.env.*',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

interface BundledMcpOptions {
  name: string;
  description: string;
  startCommand: string;
  installCommand: string;
}

interface BundledMcpFile {
  path: string;
  content: string;
}

interface BundledMcp extends BundledMcpOptions {
  files: BundledMcpFile[];
}

/**
 * Bundle an MCP server directory into a portable format.
 * Reads all files recursively, ignoring node_modules, dist, .git, etc.
 *
 * @param dirPath - Absolute path to the MCP server directory
 * @param options - MCP metadata (name, description, commands)
 * @returns BundledMcp object with files containing relative paths and contents
 */
export async function bundleMcpDirectory(
  dirPath: string,
  options: BundledMcpOptions
): Promise<BundledMcp> {
  const files = await collectFiles(dirPath, dirPath);
  return {
    ...options,
    files
  };
}

function shouldIgnore(name: string): boolean {
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.startsWith('*')) {
      // Glob pattern like *.log
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) return true;
    } else if (pattern.endsWith('.*')) {
      // Pattern like .env.*
      const prefix = pattern.slice(0, -1);
      if (name.startsWith(prefix)) return true;
    } else {
      // Exact match
      if (name === pattern) return true;
    }
  }
  return false;
}

async function collectFiles(
  baseDir: string,
  currentDir: string
): Promise<BundledMcpFile[]> {
  const files: BundledMcpFile[] = [];
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      const subFiles = await collectFiles(baseDir, fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      try {
        const content = await readFile(fullPath, 'utf-8');
        files.push({
          path: relativePath,
          content
        });
      } catch (err) {
        // Skip files that can't be read (binary files, permission issues, etc.)
        console.warn(`Skipping file ${relativePath}: ${err}`);
      }
    }
  }

  return files;
}
