/**
 * Repo Reader Skill
 *
 * A high-level skill that orchestrates GitHub repository analysis:
 * Phase 1: Reconnaissance (0-20%) - Fetch metadata, tree, detect project type
 * Phase 2: Entry Point Analysis (20-40%) - Find entry points, extract imports
 * Phase 3: Module Exploration (40-70%) - BFS through import graph
 * Phase 4: Synthesis (70-100%) - AI generates architecture document
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ModelTier, GEMINI_MODELS } from '@/config/models';
import { BaseSkill } from './base-skill';
import { SkillInput, SkillOutput, SkillSection } from './types';
import { GitHubClient } from '@/lib/repo-reader/github-client';
import { parseGitHubUrl, buildFileUrl } from '@/lib/repo-reader/url-parser';
import { detectProjectType, detectEntryPoints, getConfigFilesToFetch, getProjectTypeName } from '@/lib/repo-reader/project-detector';
import { buildImportGraph, extractImports, resolveImportPath, estimateTokens, sortFilesByPriority } from '@/lib/repo-reader/import-parser';
import {
  RepoMetadata,
  RepoAnalysis,
  RepoAnalysisResult,
  ReconResult,
  EntryPointResult,
  ExplorationResult,
  ModuleInfo,
  GitHubTreeItem,
  EntryPoint,
} from '@/lib/repo-reader/types';

// Lazy-initialized Gemini client
let genaiClient: GoogleGenerativeAI | null = null;

function getGenaiClient(): GoogleGenerativeAI {
  if (!genaiClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required');
    }
    genaiClient = new GoogleGenerativeAI(apiKey);
  }
  return genaiClient;
}

const TOKEN_BUDGET = 150000; // ~150K tokens for exploration

/**
 * Repo Reader Skill Implementation
 */
export class RepoReaderSkill extends BaseSkill {
  id = 'repo-reader';
  name = 'Repo Reader';
  description = 'Analyze GitHub repositories and generate architecture documents';
  requiredTools: string[] = []; // Uses GitHub API directly
  modelTier = ModelTier.MAIN;

  private github!: GitHubClient;
  private owner!: string;
  private repo!: string;
  private branch!: string;

  /**
   * Main execution logic
   */
  protected async run(input: SkillInput): Promise<SkillOutput> {
    const { params } = input;
    const url = params?.url as string;

    if (!url) {
      return this.errorOutput('GitHub URL is required');
    }

    console.log(`[RepoReaderSkill] Starting analysis for: ${url}`);

    // Parse URL
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      return this.errorOutput('Invalid GitHub URL. Please provide a valid GitHub repository URL.');
    }

    this.owner = parsed.owner;
    this.repo = parsed.repo;

    try {
      // Initialize GitHub client
      this.github = new GitHubClient();
    } catch (error) {
      return this.errorOutput(
        error instanceof Error ? error.message : 'Failed to initialize GitHub client'
      );
    }

    try {
      // Phase 1: Reconnaissance (0-20%)
      console.log('[RepoReaderSkill] Phase 1: Reconnaissance...');
      this.emitProgress(5, 'Fetching repository metadata...');
      const recon = await this.phase1Recon();

      // Phase 2: Entry Point Analysis (20-40%)
      console.log('[RepoReaderSkill] Phase 2: Entry Point Analysis...');
      this.emitProgress(25, 'Analyzing entry points...');
      const entryPointResult = await this.phase2EntryPoints(recon);

      // Phase 3: Module Exploration (40-70%)
      console.log('[RepoReaderSkill] Phase 3: Module Exploration...');
      this.emitProgress(45, 'Exploring modules...');
      const explorationResult = await this.phase3Exploration(recon, entryPointResult);

      // Phase 4: Synthesis (70-100%)
      console.log('[RepoReaderSkill] Phase 4: Synthesis...');
      this.emitProgress(75, 'Generating architecture document...');
      const analysis = await this.phase4Synthesis(recon, entryPointResult, explorationResult);

      this.emitProgress(100, 'Analysis complete');

      return {
        success: true,
        data: {
          url,
          metadata: {
            ...recon.metadata,
            analyzedAt: new Date().toISOString(),
          },
          analysis,
        },
        summary: analysis.overview,
        sections: this.buildSections(analysis, recon.metadata),
        metadata: {
          projectType: recon.projectType,
          filesExplored: explorationResult.fileContents.size,
          tokensUsed: explorationResult.tokensUsed,
        },
      };
    } catch (error) {
      console.error('[RepoReaderSkill] Error:', error);
      return this.errorOutput(
        error instanceof Error ? error.message : 'Failed to analyze repository'
      );
    }
  }

  /**
   * Phase 1: Reconnaissance
   * Gather project metadata, structure, and detect project type
   */
  private async phase1Recon(): Promise<ReconResult> {
    // 1. Fetch repo metadata
    this.emitProgress(8, 'Fetching repository info...');
    const repoData = await this.github.getRepo(this.owner, this.repo);
    this.branch = repoData.default_branch;

    const metadata: RepoMetadata = {
      name: repoData.name,
      owner: repoData.owner.login,
      fullName: repoData.full_name,
      description: repoData.description || '',
      url: repoData.html_url,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      language: repoData.language || 'Unknown',
      license: repoData.license?.name,
      defaultBranch: repoData.default_branch,
      lastPush: repoData.pushed_at,
    };

    // 2. Fetch full directory tree
    this.emitProgress(12, 'Fetching file tree...');
    const treeData = await this.github.getTree(this.owner, this.repo, this.branch);
    const tree = treeData.tree;

    // 3. Detect project type
    this.emitProgress(15, 'Detecting project type...');
    const projectType = detectProjectType(tree);
    console.log(`[RepoReaderSkill] Detected project type: ${projectType}`);

    // 4. Fetch README
    this.emitProgress(17, 'Fetching README...');
    let readme = '';
    try {
      readme = await this.github.getFileContent(this.owner, this.repo, 'README.md', this.branch);
    } catch {
      // Try README.rst
      try {
        readme = await this.github.getFileContent(this.owner, this.repo, 'README.rst', this.branch);
      } catch {
        // No README
      }
    }

    // 5. Fetch config files
    this.emitProgress(19, 'Fetching config files...');
    const configFilePaths = getConfigFilesToFetch(tree, projectType);
    const configFilesMap = await this.github.getFiles(
      this.owner,
      this.repo,
      configFilePaths,
      this.branch
    );
    const configFiles: Record<string, string> = {};
    for (const [path, content] of configFilesMap) {
      configFiles[path] = content;
    }

    return { metadata, tree, readme, configFiles, projectType };
  }

  /**
   * Phase 2: Entry Point Analysis (LLM-driven)
   * Use AI to analyze directory structure and identify entry points
   */
  private async phase2EntryPoints(recon: ReconResult): Promise<EntryPointResult> {
    // 1. Get top-level directories and sample files from each
    this.emitProgress(25, 'Analyzing directory structure...');
    const dirSamples = await this.sampleDirectoryContents(recon.tree);

    // 2. Use LLM to identify entry points and understand directory structure
    this.emitProgress(30, 'AI analyzing codebase structure...');
    const entryPointsList = await this.llmIdentifyEntryPoints(recon, dirSamples);
    console.log(`[RepoReaderSkill] LLM identified ${entryPointsList.length} entry points`);

    // 3. Fetch entry point files
    this.emitProgress(35, 'Fetching entry point files...');
    const entryPointPaths = entryPointsList.map((ep) => ep.path);
    const fileContents = await this.github.getFiles(
      this.owner,
      this.repo,
      entryPointPaths,
      this.branch
    );

    // 4. Build import graph
    this.emitProgress(38, 'Building import graph...');
    const importGraph = buildImportGraph(fileContents, recon.tree);
    console.log(`[RepoReaderSkill] Import graph frontier: ${importGraph.frontier.length} files`);

    return {
      entryPoints: entryPointsList,
      fileContents,
      importGraph,
    };
  }

  /**
   * Sample files from each top-level directory for LLM analysis
   */
  private async sampleDirectoryContents(
    tree: GitHubTreeItem[]
  ): Promise<Map<string, { files: string[]; sample: Map<string, string> }>> {
    const result = new Map<string, { files: string[]; sample: Map<string, string> }>();

    // Get top-level directories
    const topLevelDirs = new Set<string>();
    const rootFiles: string[] = [];

    for (const item of tree) {
      if (item.type === 'blob') {
        const parts = item.path.split('/');
        if (parts.length === 1) {
          rootFiles.push(item.path);
        } else {
          topLevelDirs.add(parts[0]);
        }
      }
    }

    // Add root directory
    if (rootFiles.length > 0) {
      result.set('.', { files: rootFiles, sample: new Map() });
    }

    // For each top-level directory, get files and sample 2-3
    for (const dir of topLevelDirs) {
      const dirFiles = tree
        .filter((t) => t.type === 'blob' && t.path.startsWith(dir + '/'))
        .map((t) => t.path);

      // Pick important-looking files to sample (prioritize index, main, app, etc.)
      const priorityPatterns = [/main\.[^/]+$/, /index\.[^/]+$/, /app\.[^/]+$/, /mod\.[^/]+$/, /lib\.[^/]+$/];
      const prioritized = dirFiles.sort((a, b) => {
        const aScore = priorityPatterns.findIndex((p) => p.test(a));
        const bScore = priorityPatterns.findIndex((p) => p.test(b));
        return (aScore === -1 ? 100 : aScore) - (bScore === -1 ? 100 : bScore);
      });

      result.set(dir, { files: dirFiles, sample: new Map() });

      // Sample up to 3 files per directory
      const toSample = prioritized.slice(0, 3);
      if (toSample.length > 0) {
        const contents = await this.github.getFiles(this.owner, this.repo, toSample, this.branch);
        result.get(dir)!.sample = contents;
      }
    }

    // Also sample root files
    if (rootFiles.length > 0) {
      const priorityPatterns = [/main\.[^/]+$/, /index\.[^/]+$/, /app\.[^/]+$/];
      const prioritized = rootFiles.sort((a, b) => {
        const aScore = priorityPatterns.findIndex((p) => p.test(a));
        const bScore = priorityPatterns.findIndex((p) => p.test(b));
        return (aScore === -1 ? 100 : aScore) - (bScore === -1 ? 100 : bScore);
      });
      const toSample = prioritized.slice(0, 3);
      if (toSample.length > 0) {
        const contents = await this.github.getFiles(this.owner, this.repo, toSample, this.branch);
        result.get('.')!.sample = contents;
      }
    }

    return result;
  }

  /**
   * Use LLM to identify entry points based on directory samples
   */
  private async llmIdentifyEntryPoints(
    recon: ReconResult,
    dirSamples: Map<string, { files: string[]; sample: Map<string, string> }>
  ): Promise<EntryPoint[]> {
    const { metadata, projectType } = recon;

    // Build directory summary for LLM
    let dirSummary = '';
    for (const [dir, { files, sample }] of dirSamples) {
      dirSummary += `\n## Directory: ${dir === '.' ? '(root)' : dir}\n`;
      dirSummary += `Files (${files.length} total): ${files.slice(0, 20).join(', ')}${files.length > 20 ? '...' : ''}\n`;

      for (const [path, content] of sample) {
        const truncated = content.length > 2000 ? content.substring(0, 2000) + '\n[...truncated]' : content;
        dirSummary += `\n### ${path}\n\`\`\`\n${truncated}\n\`\`\`\n`;
      }
    }

    const prompt = `Analyze this ${getProjectTypeName(projectType)} repository and identify the main entry points.

Repository: ${metadata.fullName}
Language: ${metadata.language}
Description: ${metadata.description}

${dirSummary}

Based on the code samples above, identify the ENTRY POINTS of this project.
Entry points are files where execution begins (main functions, API routes, CLI commands, etc.)

Return a JSON array of entry points:
[
  {"path": "full/path/to/file.go", "type": "main|api|cli|page|lib", "description": "Brief description of what this entry point does"}
]

IMPORTANT:
- Look for main() functions, package main declarations, HTTP handlers, CLI commands
- For Go projects: look for "func main()" and "package main"
- For Node/TS: look for server.listen(), app.listen(), export default
- Return ONLY the JSON array, no other text
- Maximum 10 entry points`;

    const genai = getGenaiClient();
    const model = genai.getGenerativeModel({
      model: GEMINI_MODELS[ModelTier.LITE], // Use cheaper model for this step
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      // Parse JSON response
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr) as Array<{ path: string; type: string; description: string }>;

      return parsed.map((ep) => ({
        path: ep.path,
        type: ep.type as 'main' | 'api' | 'page' | 'cli' | 'lib',
        description: ep.description,
      }));
    } catch (error) {
      console.error('[RepoReaderSkill] LLM entry point detection failed:', error);
      // Fallback to deterministic detection
      return detectEntryPoints(recon.tree, recon.projectType);
    }
  }

  /**
   * Phase 3: Module Exploration
   * BFS through import graph, fetching modules until token budget reached
   */
  private async phase3Exploration(
    recon: ReconResult,
    entryPointResult: EntryPointResult
  ): Promise<ExplorationResult> {
    const fileContents = new Map(entryPointResult.fileContents);
    const modules = new Map<string, ModuleInfo>();
    const visited = new Set(fileContents.keys());
    const queue = [...entryPointResult.importGraph.frontier];

    let tokensUsed = estimateTokens(fileContents);

    // BFS through import graph
    let iterations = 0;
    while (queue.length > 0 && tokensUsed < TOKEN_BUDGET && iterations < 50) {
      iterations++;

      // Batch fetch up to 10 files at a time
      const batch = queue.splice(0, 10).filter((p) => !visited.has(p));
      if (batch.length === 0) continue;

      const progress = 45 + Math.min(25, (tokensUsed / TOKEN_BUDGET) * 25);
      this.emitProgress(progress, `Exploring modules... (${fileContents.size} files)`);

      const batchContents = await this.github.getFiles(
        this.owner,
        this.repo,
        batch,
        this.branch
      );

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
          .map((imp) => resolveImportPath(imp, path, recon.tree))
          .filter((p): p is string => p !== null && !visited.has(p));

        queue.push(...resolved);

        modules.set(path, { path, imports: resolved });
      }
    }

    console.log(
      `[RepoReaderSkill] Explored ${fileContents.size} files, ${tokensUsed} tokens used`
    );

    return { modules, fileContents, tokensUsed };
  }

  /**
   * Phase 4: Synthesis
   * AI generates comprehensive architecture document
   */
  private async phase4Synthesis(
    recon: ReconResult,
    entryPointResult: EntryPointResult,
    explorationResult: ExplorationResult
  ): Promise<RepoAnalysisResult> {
    const { metadata, readme, configFiles, projectType } = recon;
    const { entryPoints } = entryPointResult;
    const { fileContents, modules } = explorationResult;

    // Build context for AI
    const fileContext = this.buildFileContext(fileContents);
    const moduleList = [...modules.entries()]
      .slice(0, 50)
      .map(([path, info]) => `- ${path}: imports ${info.imports.length} files`)
      .join('\n');

    const entryPointList = entryPoints
      .map((e) => `- ${e.path} (${e.type})`)
      .join('\n');

    const configList = Object.entries(configFiles)
      .map(([k, v]) => `### ${k}\n${v.substring(0, 1500)}`)
      .join('\n\n');

    const prompt = `Analyze this GitHub repository and return a JSON object.

REPOSITORY: ${metadata.fullName}
LANGUAGE: ${metadata.language}
PROJECT TYPE: ${getProjectTypeName(projectType)}
DESCRIPTION: ${metadata.description}
STARS: ${metadata.stars} | FORKS: ${metadata.forks}

README (excerpt):
${readme.substring(0, 2000)}

CONFIG FILES:
${configList}

ENTRY POINTS:
${entryPointList}

FILE CONTENTS:
${fileContext}

Return a JSON object with this EXACT structure (all fields required):
{
  "overview": "2-3 sentences describing what this project does",
  "techStack": {
    "language": "${metadata.language}",
    "framework": "main framework or null",
    "buildTool": "build tool or null",
    "dependencies": ["dep1", "dep2", "dep3"]
  },
  "architecture": "Text description of the architecture (NO diagrams, NO ASCII art, just plain text describing the components and how they connect)",
  "modules": [
    {
      "path": "src/module",
      "name": "Module Name",
      "description": "What it does",
      "keyFiles": [{"path": "file.go", "url": "https://github.com/${metadata.fullName}/blob/${metadata.defaultBranch}/file.go", "description": "desc"}]
    }
  ],
  "dataFlow": "How data flows through the system",
  "entryPoints": [
    {"type": "main", "file": "cmd/main.go", "url": "https://github.com/${metadata.fullName}/blob/${metadata.defaultBranch}/cmd/main.go", "description": "Main entry"}
  ],
  "setupInstructions": "How to build and run",
  "codePatterns": ["pattern1", "pattern2"],
  "learningPoints": ["point1", "point2"]
}`;

    const genai = getGenaiClient();
    const model = genai.getGenerativeModel({
      model: GEMINI_MODELS[ModelTier.MAIN],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    this.emitProgress(85, 'Processing with AI...');

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // Parse JSON response
        const analysis = JSON.parse(responseText) as RepoAnalysisResult;
        console.log(`[RepoReaderSkill] Synthesis successful on attempt ${attempt}`);
        return this.validateAndEnrichAnalysis(analysis, metadata);
      } catch (error) {
        console.error(`[RepoReaderSkill] Synthesis attempt ${attempt} failed:`, error);
        if (attempt === maxAttempts) {
          // Return fallback analysis
          return this.getFallbackAnalysis(recon, entryPointResult, explorationResult);
        }
      }
    }

    return this.getFallbackAnalysis(recon, entryPointResult, explorationResult);
  }

  /**
   * Build file context for AI (sorted by priority)
   */
  private buildFileContext(files: Map<string, string>): string {
    const sorted = sortFilesByPriority(files);
    let totalTokens = 0;
    const maxContextTokens = 80000;

    const parts: string[] = [];
    for (const [path, content] of sorted) {
      const tokens = estimateTokens(content);
      if (totalTokens + tokens > maxContextTokens) {
        // Truncate
        if (tokens > 5000) {
          const truncated = content.substring(0, 10000) + '\n[... truncated ...]';
          parts.push(`### ${path}\n\`\`\`\n${truncated}\n\`\`\``);
          totalTokens += 2500;
        }
        continue;
      }
      parts.push(`### ${path}\n\`\`\`\n${content}\n\`\`\``);
      totalTokens += tokens;
    }

    return parts.join('\n\n');
  }

  /**
   * Validate and enrich the analysis
   */
  private validateAndEnrichAnalysis(
    analysis: RepoAnalysisResult,
    metadata: RepoMetadata
  ): RepoAnalysisResult {
    // Ensure all required fields exist
    return {
      overview: analysis.overview || 'Repository analysis completed.',
      techStack: analysis.techStack || {
        language: metadata.language,
        dependencies: [],
      },
      architecture: analysis.architecture || 'Architecture diagram not generated.',
      modules: (analysis.modules || []).map((m) => ({
        ...m,
        keyFiles: (m.keyFiles || []).map((f) => ({
          ...f,
          url: f.url || buildFileUrl(this.owner, this.repo, this.branch, f.path),
        })),
      })),
      dataFlow: analysis.dataFlow,
      entryPoints: (analysis.entryPoints || []).map((e) => ({
        ...e,
        url: e.url || buildFileUrl(this.owner, this.repo, this.branch, e.file),
      })),
      setupInstructions: analysis.setupInstructions || 'See README for setup instructions.',
      codePatterns: analysis.codePatterns || [],
      learningPoints: analysis.learningPoints || [],
    };
  }

  /**
   * Generate fallback analysis when AI fails
   */
  private getFallbackAnalysis(
    recon: ReconResult,
    entryPointResult: EntryPointResult,
    explorationResult: ExplorationResult
  ): RepoAnalysisResult {
    const { metadata, projectType, readme, configFiles, tree } = recon;

    // Extract directories from tree for architecture
    const dirs = new Set<string>();
    tree.filter(t => t.type === 'tree' && !t.path.includes('/')).forEach(t => dirs.add(t.path));
    const dirList = [...dirs].slice(0, 10).join(', ');

    // Extract dependencies from config files
    const dependencies: string[] = [];
    if (configFiles['package.json']) {
      try {
        const pkg = JSON.parse(configFiles['package.json']);
        if (pkg.dependencies) dependencies.push(...Object.keys(pkg.dependencies).slice(0, 5));
      } catch { /* ignore */ }
    }
    if (configFiles['go.mod']) {
      const matches = configFiles['go.mod'].match(/require \(\s*([\s\S]*?)\s*\)/);
      if (matches) {
        const deps = matches[1].split('\n').filter(l => l.trim()).map(l => l.trim().split(' ')[0]).slice(0, 5);
        dependencies.push(...deps);
      }
    }

    // Generate architecture description from directories
    const architecture = dirList
      ? `This ${getProjectTypeName(projectType)} project is organized into the following main directories: ${dirList}. See the README for more details on the architecture.`
      : `This is a ${getProjectTypeName(projectType)} project. See the README for architecture details.`;

    // Extract modules from explored files
    const moduleMap = new Map<string, string[]>();
    for (const [path] of explorationResult.fileContents) {
      const dir = path.includes('/') ? path.split('/')[0] : '.';
      if (!moduleMap.has(dir)) moduleMap.set(dir, []);
      moduleMap.get(dir)!.push(path);
    }

    const modules = [...moduleMap.entries()].slice(0, 5).map(([dir, files]) => ({
      path: dir,
      name: dir === '.' ? 'Root' : dir.charAt(0).toUpperCase() + dir.slice(1),
      description: `Contains ${files.length} explored files`,
      keyFiles: files.slice(0, 3).map(f => ({
        path: f,
        url: buildFileUrl(this.owner, this.repo, this.branch, f),
        description: 'Source file',
      })),
    }));

    return {
      overview: readme.substring(0, 500) || `${metadata.fullName} is a ${getProjectTypeName(projectType)} project${metadata.description ? `: ${metadata.description}` : ''}.`,
      techStack: {
        language: metadata.language,
        framework: getProjectTypeName(projectType) !== 'Unknown' ? getProjectTypeName(projectType) : undefined,
        dependencies,
      },
      architecture,
      modules,
      entryPoints: entryPointResult.entryPoints.map((e) => ({
        type: e.type,
        file: e.path,
        url: buildFileUrl(this.owner, this.repo, this.branch, e.path),
        description: e.description || `Main ${e.type} entry point`,
      })),
      setupInstructions: 'See README for setup and build instructions.',
      codePatterns: [],
      learningPoints: [
        `Explored ${explorationResult.fileContents.size} files`,
        `Project uses ${metadata.language}`,
        metadata.stars > 0 ? `${metadata.stars} GitHub stars` : '',
      ].filter(Boolean),
    };
  }

  /**
   * Build skill output sections from analysis
   */
  private buildSections(analysis: RepoAnalysisResult, metadata: RepoMetadata): SkillSection[] {
    const sections: SkillSection[] = [];

    // Overview
    sections.push({
      title: 'Overview',
      content: analysis.overview,
      type: 'text',
    });

    // Tech Stack
    const techStackContent = [
      `**Language**: ${analysis.techStack.language}`,
      analysis.techStack.framework ? `**Framework**: ${analysis.techStack.framework}` : null,
      analysis.techStack.buildTool ? `**Build Tool**: ${analysis.techStack.buildTool}` : null,
      analysis.techStack.dependencies.length > 0
        ? `**Key Dependencies**: ${analysis.techStack.dependencies.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    sections.push({
      title: 'Tech Stack',
      content: techStackContent,
      type: 'text',
    });

    // Architecture
    if (analysis.architecture) {
      sections.push({
        title: 'Architecture',
        content: analysis.architecture,
        type: 'code',
      });
    }

    // Modules
    if (analysis.modules.length > 0) {
      const modulesContent = analysis.modules
        .map((m) => {
          const files = m.keyFiles
            .map((f) => `  - [${f.path}](${f.url}): ${f.description}`)
            .join('\n');
          return `**${m.name}** (${m.path})\n${m.description}\n${files}`;
        })
        .join('\n\n');

      sections.push({
        title: 'Module Breakdown',
        content: modulesContent,
        type: 'text',
      });
    }

    // Entry Points
    if (analysis.entryPoints.length > 0) {
      const entryContent = analysis.entryPoints
        .map((e) => `- **${e.type}**: [${e.file}](${e.url}) - ${e.description}`)
        .join('\n');

      sections.push({
        title: 'Entry Points',
        content: entryContent,
        type: 'text',
      });
    }

    // Data Flow
    if (analysis.dataFlow) {
      sections.push({
        title: 'Data Flow',
        content: analysis.dataFlow,
        type: 'text',
      });
    }

    // Setup
    if (analysis.setupInstructions) {
      sections.push({
        title: 'Setup Instructions',
        content: analysis.setupInstructions,
        type: 'text',
      });
    }

    // Code Patterns
    if (analysis.codePatterns.length > 0) {
      sections.push({
        title: 'Code Patterns',
        content: analysis.codePatterns.map((p) => `- ${p}`).join('\n'),
        type: 'text',
      });
    }

    // Learning Points
    if (analysis.learningPoints.length > 0) {
      sections.push({
        title: 'Learning Points',
        content: analysis.learningPoints.map((p) => `- ${p}`).join('\n'),
        type: 'text',
      });
    }

    return sections;
  }
}

// Export singleton instance
export const repoReaderSkill = new RepoReaderSkill();
