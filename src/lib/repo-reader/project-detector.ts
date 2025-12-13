/**
 * Project Type Detector
 * Deterministic detection of project types and entry points
 */

import { GitHubTreeItem, ProjectType, EntryPoint, CONFIG_FILES } from './types';

/**
 * Detect project type based on file tree
 */
export function detectProjectType(tree: GitHubTreeItem[]): ProjectType {
  const hasFile = (name: string) =>
    tree.some((t) => t.path === name || t.path.endsWith('/' + name));

  const hasPath = (pattern: string) => tree.some((t) => t.path.includes(pattern));

  // Next.js: has next.config.* or app/ directory with page.tsx
  if (
    hasFile('next.config.js') ||
    hasFile('next.config.ts') ||
    hasFile('next.config.mjs')
  ) {
    return 'nextjs';
  }

  // Check for app router pattern (Next.js without config)
  if (tree.some((t) => t.path.match(/^(src\/)?app\/.*page\.(tsx?|jsx?)$/))) {
    return 'nextjs';
  }

  // NestJS: has nest-cli.json
  if (hasFile('nest-cli.json')) {
    return 'nestjs';
  }

  // Angular: has angular.json
  if (hasFile('angular.json')) {
    return 'angular';
  }

  // Vue: has vue.config.js or vite.config with vue
  if (hasFile('vue.config.js') || hasFile('nuxt.config.js') || hasFile('nuxt.config.ts')) {
    return 'vue';
  }

  // Python projects
  if (hasFile('pyproject.toml') || hasFile('setup.py') || hasFile('requirements.txt')) {
    if (hasFile('manage.py')) return 'django';
    if (hasPath('fastapi') || hasFile('main.py')) return 'fastapi';
    if (hasPath('flask') || hasFile('app.py')) return 'flask';
    return 'python';
  }

  // Go
  if (hasFile('go.mod')) {
    return 'go';
  }

  // Rust
  if (hasFile('Cargo.toml')) {
    return 'rust';
  }

  // Java
  if (hasFile('pom.xml') || hasFile('build.gradle')) {
    return 'java';
  }

  // Check for package.json to determine node-based projects
  if (hasFile('package.json')) {
    // Fastify
    if (hasPath('fastify')) return 'fastify';
    // Express (common patterns)
    if (hasPath('express') || hasFile('app.js') || hasFile('server.js')) return 'express';
    // Default to React for general JS/TS projects
    return 'react';
  }

  return 'unknown';
}

/**
 * Get config files to fetch based on project type
 */
export function getConfigFilesToFetch(
  tree: GitHubTreeItem[],
  projectType: ProjectType
): string[] {
  const configList = CONFIG_FILES[projectType] || CONFIG_FILES.unknown;
  const files = tree.filter((t) => t.type === 'blob').map((t) => t.path);

  // Find matching config files that exist
  const matches: string[] = [];
  for (const config of configList) {
    // Try exact match first
    if (files.includes(config)) {
      matches.push(config);
      continue;
    }
    // Try with src/ prefix
    if (files.includes(`src/${config}`)) {
      matches.push(`src/${config}`);
      continue;
    }
    // For settings.py in Django, search recursively
    if (config === 'settings.py') {
      const settingsFile = files.find((f) => f.endsWith('/settings.py'));
      if (settingsFile) {
        matches.push(settingsFile);
      }
    }
  }

  // Always try to get README
  if (files.includes('README.md') && !matches.includes('README.md')) {
    matches.push('README.md');
  }
  if (files.includes('README.rst') && !matches.includes('README.rst')) {
    matches.push('README.rst');
  }

  return matches;
}

/**
 * Detect entry points based on project type (deterministic)
 */
export function detectEntryPoints(
  tree: GitHubTreeItem[],
  projectType: ProjectType
): EntryPoint[] {
  const files = tree.filter((t) => t.type === 'blob').map((t) => t.path);
  const entryPoints: EntryPoint[] = [];

  switch (projectType) {
    case 'nextjs':
      // App Router pages
      files
        .filter(
          (f) =>
            f.match(/^(src\/)?app\/.*page\.(tsx?|jsx?)$/) ||
            f.match(/^(src\/)?app\/.*route\.(tsx?|jsx?)$/)
        )
        .slice(0, 8)
        .forEach((f) => {
          const type = f.includes('route.') ? 'api' : 'page';
          entryPoints.push({ path: f, type });
        });

      // Root layout
      const layout = files.find((f) => f.match(/^(src\/)?app\/layout\.(tsx?|jsx?)$/));
      if (layout) {
        entryPoints.push({ path: layout, type: 'main' });
      }

      // Pages Router (if exists)
      files
        .filter(
          (f) =>
            f.match(/^(src\/)?pages\/.*\.(tsx?|jsx?)$/) &&
            !f.includes('_app') &&
            !f.includes('_document')
        )
        .slice(0, 3)
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'page' });
        });
      break;

    case 'react':
      files
        .filter((f) =>
          f.match(/^(src\/)?(index|main|app|App)\.(tsx?|jsx?)$/)
        )
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    case 'vue':
      files
        .filter((f) =>
          f.match(/^(src\/)?(index|main|app|App)\.(ts|js|vue)$/)
        )
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    case 'angular':
      files
        .filter((f) => f.match(/^(src\/)?main\.ts$/) || f.match(/app\.module\.ts$/))
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    case 'express':
    case 'fastify':
    case 'nestjs':
      files
        .filter((f) =>
          f.match(/^(src\/)?(index|main|app|server)\.(tsx?|jsx?|ts|js)$/)
        )
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    case 'python':
    case 'fastapi':
      files
        .filter((f) =>
          f.match(/^(src\/)?(__main__|main|app|wsgi|asgi)\.py$/)
        )
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    case 'django':
      files
        .filter((f) => f.match(/manage\.py$/) || f.match(/urls\.py$/))
        .slice(0, 3)
        .forEach((f) => {
          entryPoints.push({
            path: f,
            type: f.includes('manage') ? 'cli' : 'main',
          });
        });
      break;

    case 'flask':
      files
        .filter((f) => f.match(/^(src\/)?(app|wsgi|run)\.py$/))
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    case 'go':
      // Find all main.go files - Go projects can have main.go anywhere
      files
        .filter((f) => f === 'main.go' || f.endsWith('/main.go'))
        .slice(0, 10)  // Limit to 10 entry points
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    case 'rust':
      files
        .filter((f) => f.match(/^(src\/)?main\.rs$/) || f.match(/^(src\/)?lib\.rs$/))
        .forEach((f) => {
          entryPoints.push({
            path: f,
            type: f.includes('main') ? 'main' : 'lib',
          });
        });
      break;

    case 'java':
      files
        .filter((f) => f.includes('Application.java') || f.includes('Main.java'))
        .slice(0, 3)
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
      break;

    default:
      // Fallback: common entry point names
      files
        .filter((f) =>
          f.match(/^(src\/)?(index|main|app)\.(tsx?|jsx?|ts|js|py|go|rs)$/)
        )
        .forEach((f) => {
          entryPoints.push({ path: f, type: 'main' });
        });
  }

  // If still no entry points found, use heuristics
  if (entryPoints.length === 0) {
    // Try to find any main.go, main.py, index.js, etc.
    const fallbackPatterns = [
      /main\.go$/,
      /main\.py$/,
      /main\.rs$/,
      /main\.java$/,
      /index\.(ts|js|tsx|jsx)$/,
      /app\.(ts|js|tsx|jsx|py)$/,
    ];

    for (const pattern of fallbackPatterns) {
      const matches = files.filter((f) => f.match(pattern)).slice(0, 5);
      if (matches.length > 0) {
        matches.forEach((f) => entryPoints.push({ path: f, type: 'main' }));
        break; // Stop after finding first pattern match
      }
    }
  }

  // Deduplicate and limit
  const seen = new Set<string>();
  return entryPoints
    .filter((ep) => {
      if (seen.has(ep.path)) return false;
      seen.add(ep.path);
      return true;
    })
    .slice(0, 10);
}

/**
 * Get human-readable project type name
 */
export function getProjectTypeName(projectType: ProjectType): string {
  const names: Record<ProjectType, string> = {
    nextjs: 'Next.js',
    react: 'React',
    vue: 'Vue.js',
    angular: 'Angular',
    express: 'Express.js',
    fastify: 'Fastify',
    nestjs: 'NestJS',
    python: 'Python',
    django: 'Django',
    flask: 'Flask',
    fastapi: 'FastAPI',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    unknown: 'Unknown',
  };
  return names[projectType];
}
