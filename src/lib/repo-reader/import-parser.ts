/**
 * Import Parser
 * Language-specific import extraction and path resolution
 */

import { GitHubTreeItem, ImportGraph } from './types';

/**
 * Extract imports from file content based on file extension
 */
export function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext || '')) {
    // ES imports: import ... from '...'
    const esImports = content.matchAll(
      /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g
    );
    for (const match of esImports) {
      imports.push(match[1]);
    }

    // Dynamic imports: import('...')
    const dynamicImports = content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of dynamicImports) {
      imports.push(match[1]);
    }

    // Require: require('...')
    const requires = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requires) {
      imports.push(match[1]);
    }

    // Export from: export ... from '...'
    const exportFroms = content.matchAll(/export\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of exportFroms) {
      imports.push(match[1]);
    }
  }

  if (ext === 'py') {
    // Python: from x import y
    const fromImports = content.matchAll(/from\s+(\S+)\s+import/g);
    for (const match of fromImports) {
      imports.push(match[1]);
    }

    // Python: import x, import x.y
    const directImports = content.matchAll(/^import\s+(\S+)/gm);
    for (const match of directImports) {
      // Handle "import x, y, z"
      const modules = match[1].split(',').map((m) => m.trim());
      imports.push(...modules);
    }
  }

  if (ext === 'go') {
    // Go: import "..." or import (...)
    // Single import
    const singleImports = content.matchAll(/^import\s+"([^"]+)"/gm);
    for (const match of singleImports) {
      imports.push(match[1]);
    }

    // Multi-import block
    const multiImportMatch = content.match(/import\s*\(([\s\S]*?)\)/);
    if (multiImportMatch) {
      const importBlock = multiImportMatch[1];
      const goImports = importBlock.matchAll(/"([^"]+)"/g);
      for (const match of goImports) {
        imports.push(match[1]);
      }
    }
  }

  if (ext === 'rs') {
    // Rust: use crate::..., use super::..., mod ...
    const useStatements = content.matchAll(/use\s+(crate::\S+|super::\S+|self::\S+)/g);
    for (const match of useStatements) {
      imports.push(match[1]);
    }

    // Module declarations
    const modStatements = content.matchAll(/mod\s+(\w+)\s*;/g);
    for (const match of modStatements) {
      imports.push(match[1]);
    }
  }

  if (ext === 'java') {
    // Java: import x.y.z;
    const javaImports = content.matchAll(/import\s+([\w.]+);/g);
    for (const match of javaImports) {
      imports.push(match[1]);
    }
  }

  return [...new Set(imports)]; // Deduplicate
}

/**
 * Resolve a relative import path to a repo-absolute path
 */
export function resolveImportPath(
  importPath: string,
  fromFile: string,
  tree: GitHubTreeItem[]
): string | null {
  // Skip node_modules, external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('~/')) {
    return null;
  }

  const filePaths = tree.filter((t) => t.type === 'blob').map((t) => t.path);

  // Handle @/ alias (common in Next.js)
  let resolved = importPath;
  if (importPath.startsWith('@/')) {
    resolved = importPath.replace('@/', 'src/');
  } else if (importPath.startsWith('~/')) {
    resolved = importPath.replace('~/', 'src/');
  }

  // Resolve relative path
  if (resolved.startsWith('.')) {
    const fromDir = fromFile.split('/').slice(0, -1).join('/');
    resolved = resolvePath(fromDir, resolved);
  }

  // Try extensions
  const extensions = [
    '',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
    '.py',
    '.go',
    '.rs',
    '.java',
  ];

  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (filePaths.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Simple path resolution (handles . and ..)
 */
function resolvePath(fromDir: string, relativePath: string): string {
  const parts = fromDir ? fromDir.split('/') : [];

  for (const segment of relativePath.split('/')) {
    if (segment === '.' || segment === '') {
      continue;
    } else if (segment === '..') {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.join('/');
}

/**
 * Build import graph from file contents
 */
export function buildImportGraph(
  fileContents: Map<string, string>,
  tree: GitHubTreeItem[]
): ImportGraph {
  const edges = new Map<string, string[]>();
  const allImports: string[] = [];

  for (const [filePath, content] of fileContents) {
    const imports = extractImports(content, filePath);
    const resolvedImports = imports
      .map((imp) => resolveImportPath(imp, filePath, tree))
      .filter((p): p is string => p !== null);

    edges.set(filePath, resolvedImports);
    allImports.push(...resolvedImports);
  }

  // Frontier: imports that appear multiple times (likely important)
  // Plus imports not yet fetched
  const importCounts = new Map<string, number>();
  for (const imp of allImports) {
    importCounts.set(imp, (importCounts.get(imp) || 0) + 1);
  }

  const frontier = [...importCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([path]) => path)
    .filter((path) => !fileContents.has(path))
    .slice(0, 30); // Limit frontier size

  return { edges, frontier };
}

/**
 * Estimate token count for content
 */
export function estimateTokens(content: string | Map<string, string>): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  let total = 0;
  for (const v of content.values()) {
    total += Math.ceil(v.length / 4);
  }
  return total;
}

/**
 * Sort files by importance for synthesis
 */
export function sortFilesByPriority(files: Map<string, string>): [string, string][] {
  return [...files.entries()].sort((a, b) => {
    return getFilePriority(a[0]) - getFilePriority(b[0]);
  });
}

function getFilePriority(path: string): number {
  // Entry points first
  if (
    path.includes('page.') ||
    path.includes('route.') ||
    path.includes('main.') ||
    path.includes('index.')
  ) {
    return 0;
  }
  // Core/lib next
  if (path.includes('/lib/') || path.includes('/core/') || path.includes('/src/')) {
    return 1;
  }
  // Components
  if (path.includes('/components/')) {
    return 2;
  }
  // Utils/helpers
  if (path.includes('/utils/') || path.includes('/helpers/') || path.includes('/shared/')) {
    return 3;
  }
  // Config files
  if (path.includes('config') || path.includes('.json')) {
    return 4;
  }
  // Everything else
  return 5;
}
