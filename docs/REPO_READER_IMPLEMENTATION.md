# Repo Reader Implementation Plan

## Overview

Repo Reader analyzes GitHub repositories and generates comprehensive architecture documents. Users paste a GitHub URL, the system fetches metadata and key files, AI analyzes the codebase structure, and outputs a detailed architecture document that can be saved as a Whim.

**Pattern**: Follows Paper Reader architecture exactly (Skill → Agent → API → Page)

**Key Design Principle**: Use **deterministic exploration** rather than AI-guessed file selection. This mirrors how a developer actually explores a codebase:
1. Read README and config files to understand the project
2. Find entry points deterministically based on project type
3. Trace imports from entry points to discover modules
4. Explore the import graph iteratively until token budget is reached

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         /repo (Page)                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ RepoInput│→ │ RepoProgress │→ │ RepoAnalysisDisplay        │ │
│  │          │  │              │  │ - Overview                 │ │
│  │ URL input│  │ Phase status │  │ - Module breakdown         │ │
│  │          │  │ Progress bar │  │ - Architecture diagram     │ │
│  └──────────┘  └──────────────┘  │ - File links (clickable)   │ │
│                                   └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ SSE
┌─────────────────────────────────────────────────────────────────┐
│                   /api/repo/analyze (API)                        │
│                              │                                   │
│                              ▼                                   │
│                    RepoReaderAgent                               │
│                              │                                   │
│                              ▼                                   │
│                    RepoReaderSkill                               │
└─────────────────────────────────────────────────────────────────┘
                              │
    ┌───────────────┬─────────┴─────────┬───────────────┐
    ▼               ▼                   ▼               ▼
┌────────────┐ ┌────────────┐ ┌────────────────┐ ┌────────────┐
│ Phase 1    │ │ Phase 2    │ │ Phase 3        │ │ Phase 4    │
│ Recon      │ │ Entry      │ │ Module         │ │ Synthesis  │
│ (0-20%)    │ │ Points     │ │ Exploration    │ │ (70-100%)  │
│            │ │ (20-40%)   │ │ (40-70%)       │ │            │
└────────────┘ └────────────┘ └────────────────┘ └────────────┘
```

---

## Implementation Phases

### Phase 1: Core Infrastructure

#### 1.1 Types (`src/lib/repo-reader/types.ts`)

```typescript
// GitHub API response types
interface GitHubRepo {
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

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

interface GitHubTree {
  sha: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// Internal types
interface RepoMetadata {
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

interface RepoModule {
  path: string;
  name: string;
  description: string;
  keyFiles: {
    path: string;
    url: string;
    description: string;
  }[];
}

interface RepoAnalysis {
  success: boolean;
  metadata: RepoMetadata & { analyzedAt: string };
  analysis: {
    overview: string;
    techStack: {
      language: string;
      framework?: string;
      buildTool?: string;
      dependencies: string[];
    };
    architecture: string;
    modules: RepoModule[];
    dataFlow?: string;
    entryPoints: {
      type: string;
      file: string;
      url: string;
      description: string;
    }[];
    setupInstructions: string;
    codePatterns: string[];
    learningPoints: string[];
  };
  error?: string;
}

// Progress tracking - matches the 4-phase deterministic approach
type RepoProgressStage =
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

interface RepoProgress {
  stage: RepoProgressStage;
  progress: number;      // 0-100
  message: string;       // Human-readable status
  detail?: string;       // e.g., "Fetching src/lib/agent.ts..."
  filesExplored?: number;
  tokensUsed?: number;
  result?: RepoAnalysis;
  error?: string;
}
```

#### 1.2 GitHub Client (`src/lib/repo-reader/github-client.ts`)

```typescript
class GitHubClient {
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable required');
    }
    this.token = token;
  }

  // Get repository metadata
  async getRepo(owner: string, repo: string): Promise<GitHubRepo>

  // Get full directory tree (recursive)
  async getTree(owner: string, repo: string, branch: string): Promise<GitHubTree>

  // Get file content (returns decoded string)
  async getFileContent(owner: string, repo: string, path: string, branch: string): Promise<string>

  // Get multiple files (with rate limiting)
  async getFiles(owner: string, repo: string, paths: string[], branch: string): Promise<Map<string, string>>

  // Check rate limit status
  async getRateLimit(): Promise<{ remaining: number; reset: Date }>
}
```

**Key implementation details:**
- All requests include `Authorization: Bearer ${token}` header
- Handle 404 gracefully (file not found)
- Implement exponential backoff for rate limiting
- Respect `X-RateLimit-Remaining` header

#### 1.3 URL Parser (`src/lib/repo-reader/url-parser.ts`)

```typescript
interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

function parseGitHubUrl(url: string): ParsedGitHubUrl | null

// Supported formats:
// - https://github.com/owner/repo
// - https://github.com/owner/repo/tree/branch
// - https://github.com/owner/repo/tree/branch/path
// - github.com/owner/repo (without https)
// - owner/repo (shorthand)
```

---

### Phase 2: Skill Implementation

#### 2.1 Repo Reader Skill (`src/lib/skills/repo-reader-skill.ts`)

Extends `BaseSkill` and implements **4-phase deterministic analysis**:

```typescript
class RepoReaderSkill extends BaseSkill {
  id = 'repo-reader';
  name = 'Repo Reader';
  description = 'Analyze GitHub repositories and generate architecture documents';
  requiredTools = [];  // Uses GitHub API directly, not agent tools
  modelTier = ModelTier.MAIN;  // Use main model for synthesis

  protected async run(input: SkillInput): Promise<SkillOutput> {
    // Phase 1: Reconnaissance (0-20%)
    // Phase 2: Entry Point Analysis (20-40%)
    // Phase 3: Module Exploration (40-70%)
    // Phase 4: Synthesis (70-100%)
  }
}
```

---

### Phase 1: Reconnaissance (0-20%)

**Goal**: Gather project metadata, structure, and detect project type.

**No AI calls** - purely deterministic.

```typescript
interface ReconResult {
  metadata: RepoMetadata;
  tree: GitHubTreeItem[];
  readme: string;
  configFiles: Record<string, string>;
  projectType: ProjectType;
}

type ProjectType =
  | 'nextjs' | 'react' | 'vue' | 'angular'   // Frontend
  | 'express' | 'fastify' | 'nestjs'          // Node backends
  | 'python' | 'django' | 'flask' | 'fastapi' // Python
  | 'go' | 'rust' | 'java'                    // Systems
  | 'unknown';

async function phase1Recon(owner: string, repo: string): Promise<ReconResult> {
  // 1. Fetch repo metadata
  const repoData = await github.getRepo(owner, repo);

  // 2. Fetch full directory tree (single API call)
  const tree = await github.getTree(owner, repo, repoData.default_branch);

  // 3. Fetch README
  const readme = await github.getFileContent(owner, repo, 'README.md')
    .catch(() => '');

  // 4. Detect project type and fetch config files
  const projectType = detectProjectType(tree.tree);
  const configFiles = await fetchConfigFiles(owner, repo, tree.tree, projectType);

  return { metadata, tree: tree.tree, readme, configFiles, projectType };
}

// Project type detection rules
function detectProjectType(tree: GitHubTreeItem[]): ProjectType {
  const hasFile = (name: string) => tree.some(t => t.path === name || t.path.endsWith('/' + name));

  // Next.js: has next.config.* or app/ directory with page.tsx
  if (hasFile('next.config.js') || hasFile('next.config.ts') || hasFile('next.config.mjs')) {
    return 'nextjs';
  }

  // Check for package.json to determine node-based projects
  if (hasFile('package.json')) {
    // Will refine based on dependencies in config files
    return 'react'; // Default for now, refined later
  }

  // Python projects
  if (hasFile('pyproject.toml') || hasFile('setup.py')) {
    if (hasFile('manage.py')) return 'django';
    if (tree.some(t => t.path.includes('fastapi'))) return 'fastapi';
    if (tree.some(t => t.path.includes('flask'))) return 'flask';
    return 'python';
  }

  // Go
  if (hasFile('go.mod')) return 'go';

  // Rust
  if (hasFile('Cargo.toml')) return 'rust';

  // Java
  if (hasFile('pom.xml') || hasFile('build.gradle')) return 'java';

  return 'unknown';
}

// Config files to fetch per project type
const CONFIG_FILES: Record<ProjectType, string[]> = {
  nextjs: ['package.json', 'tsconfig.json', 'next.config.js', 'next.config.ts', 'next.config.mjs'],
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
```

---

### Phase 2: Entry Point Analysis (20-40%)

**Goal**: Find entry points deterministically, fetch them, then use AI to understand imports.

```typescript
interface EntryPointResult {
  entryPoints: EntryPoint[];
  fileContents: Map<string, string>;
  importGraph: ImportGraph;
}

interface EntryPoint {
  path: string;
  type: 'page' | 'api' | 'cli' | 'lib' | 'main';
  description?: string;
}

interface ImportGraph {
  // path -> list of imported paths (resolved to repo paths)
  edges: Map<string, string[]>;
  // paths that should be explored next (high priority)
  frontier: string[];
}

async function phase2EntryPoints(
  recon: ReconResult
): Promise<EntryPointResult> {
  // 1. Deterministically find entry points based on project type
  const entryPointPaths = detectEntryPoints(recon.tree, recon.projectType);

  // 2. Fetch entry point files
  const entryPointContents = await github.getFiles(owner, repo, entryPointPaths);

  // 3. Extract imports from each entry point (deterministic parsing)
  const importGraph = buildImportGraph(entryPointContents, recon.tree);

  // 4. AI call: Describe what each entry point does
  const entryPoints = await analyzeEntryPoints(entryPointContents, recon.metadata);

  return { entryPoints, fileContents: entryPointContents, importGraph };
}

// Deterministic entry point detection per project type
function detectEntryPoints(tree: GitHubTreeItem[], projectType: ProjectType): string[] {
  const files = tree.filter(t => t.type === 'blob').map(t => t.path);
  const entryPoints: string[] = [];

  switch (projectType) {
    case 'nextjs':
      // App Router pages
      entryPoints.push(...files.filter(f =>
        f.match(/^(src\/)?app\/.*page\.(tsx?|jsx?)$/) ||
        f.match(/^(src\/)?app\/.*route\.(tsx?|jsx?)$/) ||
        f.match(/^(src\/)?app\/layout\.(tsx?|jsx?)$/)
      ));
      // Also check pages/ directory for Pages Router
      entryPoints.push(...files.filter(f =>
        f.match(/^(src\/)?pages\/.*\.(tsx?|jsx?)$/) &&
        !f.includes('_app') && !f.includes('_document')
      ).slice(0, 3));
      break;

    case 'react':
    case 'vue':
    case 'angular':
      entryPoints.push(...files.filter(f =>
        f.match(/^(src\/)?(index|main|app)\.(tsx?|jsx?|ts|js|vue)$/)
      ));
      break;

    case 'express':
    case 'fastify':
    case 'nestjs':
      entryPoints.push(...files.filter(f =>
        f.match(/^(src\/)?(index|main|app|server)\.(tsx?|jsx?|ts|js)$/)
      ));
      break;

    case 'python':
    case 'django':
    case 'flask':
    case 'fastapi':
      entryPoints.push(...files.filter(f =>
        f.match(/^(src\/)?(__main__|main|app|wsgi|asgi)\.py$/) ||
        f.match(/manage\.py$/)
      ));
      break;

    case 'go':
      entryPoints.push(...files.filter(f =>
        f.match(/^(cmd\/.*\/)?main\.go$/) ||
        f === 'main.go'
      ));
      break;

    case 'rust':
      entryPoints.push(...files.filter(f =>
        f.match(/^(src\/)?main\.rs$/) ||
        f.match(/^(src\/)?lib\.rs$/)
      ));
      break;

    case 'java':
      entryPoints.push(...files.filter(f =>
        f.includes('Application.java') ||
        f.includes('Main.java')
      ));
      break;

    default:
      // Fallback: common entry point names
      entryPoints.push(...files.filter(f =>
        f.match(/^(src\/)?(index|main|app)\.(tsx?|jsx?|ts|js|py|go|rs)$/)
      ));
  }

  // Limit to first 10 entry points
  return [...new Set(entryPoints)].slice(0, 10);
}

// Extract imports from file contents (deterministic, no AI)
function buildImportGraph(
  fileContents: Map<string, string>,
  tree: GitHubTreeItem[]
): ImportGraph {
  const edges = new Map<string, string[]>();
  const allImports: string[] = [];

  for (const [filePath, content] of fileContents) {
    const imports = extractImports(content, filePath);
    const resolvedImports = imports
      .map(imp => resolveImportPath(imp, filePath, tree))
      .filter((p): p is string => p !== null);

    edges.set(filePath, resolvedImports);
    allImports.push(...resolvedImports);
  }

  // Frontier: imports that appear multiple times (likely important)
  const importCounts = new Map<string, number>();
  for (const imp of allImports) {
    importCounts.set(imp, (importCounts.get(imp) || 0) + 1);
  }

  const frontier = [...importCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([path]) => path)
    .filter(path => !fileContents.has(path))
    .slice(0, 20);

  return { edges, frontier };
}

// Regex-based import extraction (supports JS/TS/Python/Go/Rust)
function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];
  const ext = filePath.split('.').pop();

  if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext || '')) {
    // ES imports: import ... from '...'
    const esImports = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
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
  }

  if (ext === 'py') {
    // Python: from x import y, import x
    const fromImports = content.matchAll(/from\s+(\S+)\s+import/g);
    for (const match of fromImports) {
      imports.push(match[1]);
    }
    const directImports = content.matchAll(/^import\s+(\S+)/gm);
    for (const match of directImports) {
      imports.push(match[1]);
    }
  }

  if (ext === 'go') {
    // Go: import "..." or import (...)
    const goImports = content.matchAll(/import\s+(?:\(\s*)?"([^"]+)"/g);
    for (const match of goImports) {
      imports.push(match[1]);
    }
  }

  if (ext === 'rs') {
    // Rust: use crate::... or mod ...
    const useStatements = content.matchAll(/use\s+(crate::\S+|super::\S+)/g);
    for (const match of useStatements) {
      imports.push(match[1]);
    }
  }

  return imports;
}

// Resolve relative imports to repo paths
function resolveImportPath(
  importPath: string,
  fromFile: string,
  tree: GitHubTreeItem[]
): string | null {
  // Skip node_modules, external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
    return null;
  }

  // Handle @/ alias (common in Next.js)
  if (importPath.startsWith('@/')) {
    importPath = importPath.replace('@/', 'src/');
  }

  // Resolve relative path
  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  let resolved = importPath.startsWith('.')
    ? resolvePath(fromDir, importPath)
    : importPath;

  // Try extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (tree.some(t => t.path === candidate)) {
      return candidate;
    }
  }

  return null;
}
```

---

### Phase 3: Module Exploration (40-70%)

**Goal**: BFS through import graph, fetching modules until token budget reached.

```typescript
interface ExplorationResult {
  modules: Map<string, ModuleInfo>;
  fileContents: Map<string, string>;
  tokensUsed: number;
}

interface ModuleInfo {
  path: string;
  imports: string[];
  description?: string;  // From AI
}

const TOKEN_BUDGET = 150000;  // ~150K tokens

async function phase3Exploration(
  recon: ReconResult,
  entryPointResult: EntryPointResult
): Promise<ExplorationResult> {
  const fileContents = new Map(entryPointResult.fileContents);
  const modules = new Map<string, ModuleInfo>();
  const visited = new Set(fileContents.keys());
  const queue = [...entryPointResult.importGraph.frontier];

  let tokensUsed = estimateTokens(fileContents);

  // BFS through import graph
  while (queue.length > 0 && tokensUsed < TOKEN_BUDGET) {
    // Batch fetch up to 10 files at a time
    const batch = queue.splice(0, 10).filter(p => !visited.has(p));
    if (batch.length === 0) continue;

    const batchContents = await github.getFiles(owner, repo, batch);

    for (const [path, content] of batchContents) {
      const tokens = estimateTokens(content);
      if (tokensUsed + tokens > TOKEN_BUDGET) {
        // Truncate if over budget
        const truncated = content.substring(0, 20000) + '\n[...truncated...]';
        fileContents.set(path, truncated);
        tokensUsed += 5000;
      } else {
        fileContents.set(path, content);
        tokensUsed += tokens;
      }

      visited.add(path);

      // Extract imports and add to queue
      const imports = extractImports(content, path);
      const resolved = imports
        .map(imp => resolveImportPath(imp, path, recon.tree))
        .filter((p): p is string => p !== null && !visited.has(p));

      queue.push(...resolved);

      modules.set(path, { path, imports: resolved });
    }

    // Progress update
    const progress = 40 + Math.min(30, (tokensUsed / TOKEN_BUDGET) * 30);
    emitProgress(progress, `Exploring modules... (${fileContents.size} files)`);
  }

  return { modules, fileContents, tokensUsed };
}

function estimateTokens(content: string | Map<string, string>): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  let total = 0;
  for (const v of content.values()) {
    total += Math.ceil(v.length / 4);
  }
  return total;
}
```

---

### Phase 4: Synthesis (70-100%)

**Goal**: AI generates comprehensive architecture document from all gathered context.

```typescript
async function phase4Synthesis(
  recon: ReconResult,
  entryPointResult: EntryPointResult,
  explorationResult: ExplorationResult
): Promise<RepoAnalysis> {
  const { metadata, readme, configFiles, projectType } = recon;
  const { entryPoints } = entryPointResult;
  const { fileContents, modules } = explorationResult;

  // Build context for AI
  const fileContext = buildFileContext(fileContents);
  const moduleList = [...modules.entries()]
    .map(([path, info]) => `- ${path}: imports ${info.imports.length} files`)
    .join('\n');

  const prompt = `Generate a comprehensive architecture document for this GitHub repository.

## REPOSITORY INFO
Name: ${metadata.fullName}
Description: ${metadata.description}
Language: ${metadata.language}
Project Type: ${projectType}
Stars: ${metadata.stars} | Forks: ${metadata.forks}

## README (excerpt)
${readme.substring(0, 3000)}

## CONFIG FILES
${Object.entries(configFiles).map(([k, v]) => `### ${k}\n${v.substring(0, 1500)}`).join('\n\n')}

## ENTRY POINTS
${entryPoints.map(e => `- ${e.path} (${e.type}): ${e.description || 'N/A'}`).join('\n')}

## MODULE GRAPH
${moduleList}

## FILE CONTENTS
${fileContext}

---

Generate a detailed architecture document with ALL of these sections:

1. **Overview** (2-3 paragraphs)
   - What this project does
   - Who it's for
   - Key features

2. **Tech Stack**
   - Primary language and version (if detectable)
   - Framework
   - Key dependencies with brief explanations

3. **High-Level Architecture**
   - ASCII diagram showing main components
   - Brief explanation of each component

4. **Module Breakdown**
   For each major module/directory:
   - Path and purpose
   - Key files with GitHub links: https://github.com/${metadata.fullName}/blob/${metadata.defaultBranch}/{path}
   - Important patterns or abstractions

5. **Data Flow**
   - How data moves through the system
   - Request/response lifecycle (if applicable)

6. **Entry Points**
   - Web routes, API endpoints, CLI commands
   - How to invoke each

7. **Setup Instructions**
   - Prerequisites
   - Installation steps
   - How to run

8. **Code Patterns**
   - Notable patterns used (Factory, Observer, etc.)
   - Coding conventions
   - Testing approach

9. **Learning Points**
   - What developers can learn from this codebase
   - Interesting techniques worth studying

Return as JSON:
{
  "overview": "...",
  "techStack": { "language": "...", "framework": "...", "dependencies": ["..."] },
  "architecture": "ASCII diagram + explanation...",
  "modules": [{ "path": "...", "name": "...", "description": "...", "keyFiles": [...] }],
  "dataFlow": "...",
  "entryPoints": [{ "type": "...", "file": "...", "url": "...", "description": "..." }],
  "setupInstructions": "...",
  "codePatterns": ["..."],
  "learningPoints": ["..."]
}`;

  const result = await model.generateContent(prompt);
  return parseAndValidateAnalysis(result, metadata);
}

function buildFileContext(files: Map<string, string>): string {
  const sorted = [...files.entries()].sort((a, b) => {
    // Prioritize: entry points > lib > components > others
    const priority = (path: string) => {
      if (path.includes('page.') || path.includes('route.') || path.includes('main.')) return 0;
      if (path.includes('/lib/') || path.includes('/core/')) return 1;
      if (path.includes('/components/')) return 2;
      if (path.includes('/utils/') || path.includes('/helpers/')) return 3;
      return 4;
    };
    return priority(a[0]) - priority(b[0]);
  });

  return sorted
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');
}
```

#### 2.2 Repo Reader Agent (`src/lib/repo-reader/agent/repo-reader-agent.ts`)

Thin wrapper around skill with progress callback support (mirrors Paper Reader Agent):

```typescript
class RepoReaderAgent {
  private onProgress?: (event: RepoProgress) => void;

  setProgressCallback(callback: (event: RepoProgress) => void): void

  async analyze(url: string, userId?: string): Promise<RepoAnalysis>
}
```

---

### Phase 3: API & UI

#### 3.1 API Route (`src/app/api/repo/analyze/route.ts`)

SSE endpoint that streams progress events:

```typescript
export async function POST(request: Request) {
  // 1. Authenticate user
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse and validate URL
  const { url } = await request.json();
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return new Response(JSON.stringify({ error: 'Invalid GitHub URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const agent = new RepoReaderAgent();

      agent.setProgressCallback((event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      });

      try {
        const result = await agent.analyze(url, session.user.email);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          stage: 'complete',
          progress: 100,
          message: 'Analysis complete',
          result,
        })}\n\n`));
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          stage: 'error',
          progress: 0,
          message: 'Analysis failed',
          error: error.message,
        })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

#### 3.2 UI Components

**RepoInput** (`src/components/repo-reader/RepoInput.tsx`):
- Text input for GitHub URL
- Validation feedback
- Submit button with loading state

**RepoProgress** (`src/components/repo-reader/RepoProgress.tsx`):
- Progress bar (0-100%)
- Stage indicator with icons
- Current action detail

**RepoAnalysisDisplay** (`src/components/repo-reader/RepoAnalysis.tsx`):
- Collapsible sections for each analysis part
- Syntax-highlighted code blocks
- Clickable GitHub file links
- Copy-to-clipboard for code snippets

**RepoActions** (`src/components/repo-reader/RepoActions.tsx`):
- "Save as Whim" button
- "Analyze Another" button
- Share link (future)

#### 3.3 Page (`src/app/repo/page.tsx`)

State machine: `input` → `analyzing` → `complete` | `error`

```typescript
export default function RepoReaderPage() {
  const [pageState, setPageState] = useState<'input' | 'analyzing' | 'complete' | 'error'>('input');
  const [progress, setProgress] = useState<RepoProgress | null>(null);
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (url: string) => {
    // Fetch SSE stream from /api/repo/analyze
    // Update progress state on each event
    // Set analysis on complete
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header title="Repo Reader" icon={FolderGit2} />
      <main className="flex-1 overflow-y-auto">
        {pageState === 'input' && <RepoInput onSubmit={handleSubmit} />}
        {pageState === 'analyzing' && <RepoProgress progress={progress} />}
        {pageState === 'complete' && <RepoAnalysisDisplay analysis={analysis} />}
        {pageState === 'error' && <ErrorDisplay error={error} onRetry={reset} />}
      </main>
    </div>
  );
}
```

---

## File Structure

```
src/
├── lib/
│   ├── repo-reader/
│   │   ├── types.ts              # All TypeScript interfaces
│   │   ├── github-client.ts      # GitHub API wrapper
│   │   ├── url-parser.ts         # Parse GitHub URLs
│   │   ├── project-detector.ts   # Project type detection & entry points
│   │   ├── import-parser.ts      # Import extraction & path resolution
│   │   └── agent/
│   │       └── repo-reader-agent.ts
│   └── skills/
│       └── repo-reader-skill.ts
├── app/
│   ├── repo/
│   │   └── page.tsx
│   └── api/
│       └── repo/
│           └── analyze/
│               └── route.ts
└── components/
    └── repo-reader/
        ├── RepoInput.tsx         # URL input with validation
        ├── RepoProgress.tsx      # 4-phase progress display
        ├── RepoAnalysis.tsx      # Collapsible results sections
        └── RepoActions.tsx       # Save as Whim, Analyze Another
```

---

## Environment Variables

```env
# Required for Repo Reader
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Getting a GitHub Token:**
1. Go to GitHub Settings → Developer Settings → Personal Access Tokens
2. Generate new token (classic) with `public_repo` scope
3. Add to `.env.local`

---

## Implementation Order

| Step | File | Description | Est. Lines |
|------|------|-------------|------------|
| 1 | `types.ts` | All TypeScript interfaces | ~200 |
| 2 | `url-parser.ts` | GitHub URL parsing | ~60 |
| 3 | `github-client.ts` | GitHub API wrapper | ~180 |
| 4 | `project-detector.ts` | Project type detection & entry point finding | ~200 |
| 5 | `import-parser.ts` | Import extraction & resolution | ~150 |
| 6 | `repo-reader-skill.ts` | 4-phase deterministic analysis skill | ~500 |
| 7 | `repo-reader-agent.ts` | Agent wrapper with progress | ~120 |
| 8 | `route.ts` | SSE API endpoint | ~100 |
| 9 | `RepoInput.tsx` | URL input component | ~70 |
| 10 | `RepoProgress.tsx` | Progress display with phase indicators | ~100 |
| 11 | `RepoAnalysis.tsx` | Results display with collapsible sections | ~250 |
| 12 | `RepoActions.tsx` | Save as Whim / Analyze another | ~80 |
| 13 | `page.tsx` | Main /repo page | ~120 |
| 14 | E2E tests | Playwright tests | ~150 |

**Total: ~2,280 lines**

### New Files (vs Paper Reader)

| File | Purpose |
|------|---------|
| `project-detector.ts` | Deterministic project type detection, entry point finding |
| `import-parser.ts` | Language-specific import extraction, path resolution |

These extract reusable logic that could benefit other features later.

---

## Token Budget Management

**Target: 100-200K tokens for analysis**

```typescript
function buildFileContext(files: Map<string, string>, maxTokens: number): string {
  const tokenEstimate = (str: string) => Math.ceil(str.length / 4);

  let totalTokens = 0;
  const includedFiles: string[] = [];

  // Sort by priority (entry points first, then core, then others)
  const sortedFiles = [...files.entries()].sort((a, b) => {
    return getFilePriority(a[0]) - getFilePriority(b[0]);
  });

  for (const [path, content] of sortedFiles) {
    const tokens = tokenEstimate(content);
    if (totalTokens + tokens > maxTokens) {
      // Truncate large files
      if (tokens > 5000) {
        const truncated = content.substring(0, 20000) + '\n\n[... truncated ...]';
        includedFiles.push(`--- ${path} ---\n${truncated}`);
        totalTokens += 5000;
      }
      continue;
    }
    includedFiles.push(`--- ${path} ---\n${content}`);
    totalTokens += tokens;
  }

  return includedFiles.join('\n\n');
}
```

---

## Error Handling

| Error | User Message | Recovery |
|-------|--------------|----------|
| Invalid URL | "Please enter a valid GitHub URL" | Show input again |
| Repo not found | "Repository not found. Check the URL and try again." | Show input |
| Private repo | "Private repositories are not supported yet." | Show input |
| Rate limited | "GitHub API rate limit reached. Try again in X minutes." | Show countdown |
| Analysis failed | "Failed to analyze repository. Please try again." | Retry button |

---

## Testing Plan

### Unit Tests (Jest)
- `url-parser.test.ts` - URL parsing edge cases
- `github-client.test.ts` - API mocking

### E2E Tests (Playwright)
```typescript
// e2e/08-repo-reader.e2e.ts

test('should show repo reader page', async ({ page }) => {
  await page.goto('/repo');
  await expect(page.getByRole('heading', { name: 'Repo Reader' })).toBeVisible();
});

test('should validate GitHub URL', async ({ page }) => {
  await page.goto('/repo');
  await page.fill('[data-testid="repo-url-input"]', 'not-a-url');
  await page.click('[data-testid="repo-analyze-button"]');
  await expect(page.getByText('Please enter a valid GitHub URL')).toBeVisible();
});

test('should analyze a public repo', async ({ page }) => {
  await page.goto('/repo');
  await page.fill('[data-testid="repo-url-input"]', 'https://github.com/sindresorhus/is');
  await page.click('[data-testid="repo-analyze-button"]');

  // Wait for analysis to complete (may take 30-60s)
  await expect(page.getByTestId('repo-analysis')).toBeVisible({ timeout: 120000 });

  // Check key sections exist
  await expect(page.getByText('Overview')).toBeVisible();
  await expect(page.getByText('Tech Stack')).toBeVisible();
  await expect(page.getByText('Module Breakdown')).toBeVisible();
});
```

---

## Future Enhancements (Not in v1)

1. **Private Repos**: OAuth flow for user GitHub auth
2. **Monorepo Support**: Detect and offer to analyze specific packages
3. **Branch Selection**: Dropdown to pick branch/tag
4. **Comparison Mode**: Compare two repos or two versions
5. **Caching**: Optional caching with TTL for repeated analyses
6. **Export**: Export as PDF or Markdown file

---

## Dependencies

No new npm dependencies required. Uses:
- `@google/generative-ai` (existing)
- `next-auth` (existing)
- `lucide-react` (existing)

---

## Key Design Decisions

### Deterministic vs AI-Guided Exploration

| Aspect | AI-Guided (Rejected) | Deterministic (Chosen) |
|--------|---------------------|------------------------|
| **File Selection** | AI guesses from tree | Follow import graph from entry points |
| **Entry Points** | AI interprets patterns | Regex-based detection per project type |
| **Import Tracing** | AI extracts imports | Regex parsers for each language |
| **Exploration** | One-shot file list | BFS until token budget |
| **AI Calls** | 2 calls (structure + synthesis) | 1 main call (synthesis only) |

### Why Deterministic?

1. **Mirrors how developers explore** - We start at entry points and follow imports
2. **More reliable** - Regex parsing is deterministic, AI guessing can miss important files
3. **Better coverage** - BFS ensures we explore all reachable modules
4. **Cheaper** - Only one major AI call at the end vs multiple
5. **Debuggable** - Can trace exactly why each file was included

### Trade-offs

- More code to maintain (project-specific patterns)
- May miss unconventional project structures
- Regex can't handle all edge cases (dynamic imports, etc.)

These trade-offs are acceptable because:
- Most repos follow conventions
- We have fallback patterns for unknown project types
- The synthesis AI can fill in gaps from available context

---

**Created**: December 11, 2025
**Status**: Ready for Implementation
