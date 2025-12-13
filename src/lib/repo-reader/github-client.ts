/**
 * GitHub API Client
 * Wrapper for GitHub REST API with rate limiting and error handling
 */

import { GitHubRepo, GitHubTree, GitHubRateLimit } from './types';

const BASE_URL = 'https://api.github.com';

export class GitHubClient {
  private token: string;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable required');
    }
    this.token = token;
  }

  private async fetch<T>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'WhimCraft-RepoReader',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Repository or file not found');
      }
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        if (rateLimitRemaining === '0') {
          const resetTime = response.headers.get('X-RateLimit-Reset');
          const resetDate = resetTime
            ? new Date(parseInt(resetTime) * 1000)
            : new Date();
          throw new Error(
            `GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`
          );
        }
        throw new Error('Access denied. Check your GitHub token permissions.');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get repository metadata
   */
  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.fetch<GitHubRepo>(`/repos/${owner}/${repo}`);
  }

  /**
   * Get full directory tree (recursive)
   */
  async getTree(owner: string, repo: string, branch: string): Promise<GitHubTree> {
    return this.fetch<GitHubTree>(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
  }

  /**
   * Get file content (returns decoded string)
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    branch: string
  ): Promise<string> {
    const response = await fetch(
      `${BASE_URL}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3.raw',
          'User-Agent': 'WhimCraft-RepoReader',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Get multiple files (with batching)
   */
  async getFiles(
    owner: string,
    repo: string,
    paths: string[],
    branch: string
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // Process in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      const promises = batch.map(async (path) => {
        try {
          const content = await this.getFileContent(owner, repo, path, branch);
          return { path, content };
        } catch (error) {
          // Skip files that fail (e.g., binary files, too large)
          console.warn(`Failed to fetch ${path}:`, error);
          return { path, content: null };
        }
      });

      const batchResults = await Promise.all(promises);
      for (const { path, content } of batchResults) {
        if (content !== null) {
          results.set(path, content);
        }
      }

      // Small delay between batches to be nice to GitHub API
      if (i + batchSize < paths.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Check rate limit status
   */
  async getRateLimit(): Promise<GitHubRateLimit> {
    const response = await fetch(`${BASE_URL}/rate_limit`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'WhimCraft-RepoReader',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to check rate limit');
    }

    const data = (await response.json()) as {
      rate: { remaining: number; reset: number };
    };
    return {
      remaining: data.rate.remaining,
      reset: new Date(data.rate.reset * 1000),
    };
  }
}

// Singleton instance (lazy initialized)
let clientInstance: GitHubClient | null = null;

export function getGitHubClient(): GitHubClient {
  if (!clientInstance) {
    clientInstance = new GitHubClient();
  }
  return clientInstance;
}
