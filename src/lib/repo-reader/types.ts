/**
 * Repo Reader Types
 * All TypeScript interfaces for GitHub repository analysis
 */

// ============================================================================
// GitHub API Response Types
// ============================================================================

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  default_branch: string;
  pushed_at: string;
  license: { name: string } | null;
  owner: { login: string };
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface GitHubTree {
  sha: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubRateLimit {
  remaining: number;
  reset: Date;
}

// ============================================================================
// Internal Types
// ============================================================================

export interface RepoMetadata {
  name: string;
  owner: string;
  fullName: string;
  description: string;
  url: string;
  stars: number;
  forks: number;
  language: string;
  license?: string;
  defaultBranch: string;
  lastPush: string;
}

export interface RepoModule {
  path: string;
  name: string;
  description: string;
  keyFiles: {
    path: string;
    url: string;
    description: string;
  }[];
}

export interface RepoEntryPoint {
  type: 'page' | 'api' | 'cli' | 'lib' | 'main';
  file: string;
  url: string;
  description: string;
}

export interface RepoTechStack {
  language: string;
  framework?: string;
  buildTool?: string;
  dependencies: string[];
}

export interface RepoAnalysisResult {
  overview: string;
  techStack: RepoTechStack;
  architecture: string;
  modules: RepoModule[];
  dataFlow?: string;
  entryPoints: RepoEntryPoint[];
  setupInstructions: string;
  codePatterns: string[];
  learningPoints: string[];
}

export interface RepoAnalysis {
  success: boolean;
  metadata: RepoMetadata & { analyzedAt: string };
  analysis: RepoAnalysisResult;
  error?: string;
}

// ============================================================================
// Progress Tracking
// ============================================================================

export type RepoProgressStage =
  // Phase 1: Reconnaissance (0-20%)
  | 'fetching_metadata'
  | 'fetching_tree'
  | 'detecting_project_type'
  | 'fetching_config_files'
  // Phase 2: Entry Point Analysis (20-40%)
  | 'detecting_entry_points'
  | 'fetching_entry_points'
  | 'building_import_graph'
  // Phase 3: Module Exploration (40-70%)
  | 'exploring_modules'
  // Phase 4: Synthesis (70-100%)
  | 'generating_analysis'
  | 'complete'
  | 'error';

export interface RepoProgress {
  stage: RepoProgressStage;
  progress: number; // 0-100
  message: string; // Human-readable status
  detail?: string; // e.g., "Fetching src/lib/agent.ts..."
  filesExplored?: number;
  tokensUsed?: number;
  result?: RepoAnalysis;
  error?: string;
}

// ============================================================================
// Project Type Detection
// ============================================================================

export type ProjectType =
  // Frontend
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'angular'
  // Node backends
  | 'express'
  | 'fastify'
  | 'nestjs'
  // Python
  | 'python'
  | 'django'
  | 'flask'
  | 'fastapi'
  // Systems
  | 'go'
  | 'rust'
  | 'java'
  // Unknown
  | 'unknown';

// ============================================================================
// Internal Processing Types
// ============================================================================

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

export interface ReconResult {
  metadata: RepoMetadata;
  tree: GitHubTreeItem[];
  readme: string;
  configFiles: Record<string, string>;
  projectType: ProjectType;
}

export interface EntryPoint {
  path: string;
  type: 'page' | 'api' | 'cli' | 'lib' | 'main';
  description?: string;
}

export interface ImportGraph {
  // path -> list of imported paths (resolved to repo paths)
  edges: Map<string, string[]>;
  // paths that should be explored next (high priority)
  frontier: string[];
}

export interface EntryPointResult {
  entryPoints: EntryPoint[];
  fileContents: Map<string, string>;
  importGraph: ImportGraph;
}

export interface ModuleInfo {
  path: string;
  imports: string[];
  description?: string;
}

export interface ExplorationResult {
  modules: Map<string, ModuleInfo>;
  fileContents: Map<string, string>;
  tokensUsed: number;
}

// ============================================================================
// Config Files per Project Type
// ============================================================================

export const CONFIG_FILES: Record<ProjectType, string[]> = {
  nextjs: [
    'package.json',
    'tsconfig.json',
    'next.config.js',
    'next.config.ts',
    'next.config.mjs',
  ],
  react: ['package.json', 'tsconfig.json', 'vite.config.ts', 'webpack.config.js'],
  vue: ['package.json', 'tsconfig.json', 'vite.config.ts', 'vue.config.js'],
  angular: ['package.json', 'tsconfig.json', 'angular.json'],
  express: ['package.json', 'tsconfig.json'],
  fastify: ['package.json', 'tsconfig.json'],
  nestjs: ['package.json', 'tsconfig.json', 'nest-cli.json'],
  python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'setup.cfg'],
  django: ['pyproject.toml', 'requirements.txt', 'manage.py', 'settings.py'],
  flask: ['pyproject.toml', 'requirements.txt', 'app.py', 'config.py'],
  fastapi: ['pyproject.toml', 'requirements.txt', 'main.py'],
  go: ['go.mod', 'go.sum', 'Makefile'],
  rust: ['Cargo.toml', 'Cargo.lock'],
  java: ['pom.xml', 'build.gradle', 'settings.gradle'],
  unknown: ['README.md', 'Makefile', 'Dockerfile'],
};
