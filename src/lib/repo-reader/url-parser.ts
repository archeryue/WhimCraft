/**
 * GitHub URL Parser
 * Parses various GitHub URL formats into owner/repo/branch/path
 */

import { ParsedGitHubUrl } from './types';

/**
 * Parse a GitHub URL into its components
 *
 * Supported formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo/tree/branch
 * - https://github.com/owner/repo/tree/branch/path
 * - https://github.com/owner/repo/blob/branch/file
 * - github.com/owner/repo (without https)
 * - owner/repo (shorthand)
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Trim whitespace
  url = url.trim();

  // Handle shorthand: owner/repo
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    const [owner, repo] = url.split('/');
    return { owner, repo };
  }

  // Normalize URL
  let normalizedUrl = url;
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);

    // Must be github.com
    if (!parsedUrl.hostname.endsWith('github.com')) {
      return null;
    }

    // Split path: /owner/repo/tree/branch/path or /owner/repo
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) {
      return null;
    }

    const owner = pathParts[0];
    const repo = pathParts[1].replace(/\.git$/, ''); // Remove .git suffix if present

    // Basic validation
    if (!owner || !repo) {
      return null;
    }

    const result: ParsedGitHubUrl = { owner, repo };

    // Check for tree/blob/branch specifier
    if (pathParts.length >= 4 && (pathParts[2] === 'tree' || pathParts[2] === 'blob')) {
      result.branch = pathParts[3];

      // If there's a path after branch
      if (pathParts.length > 4) {
        result.path = pathParts.slice(4).join('/');
      }
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Validate that a parsed URL looks valid
 */
export function isValidGitHubUrl(url: string): boolean {
  return parseGitHubUrl(url) !== null;
}

/**
 * Build a GitHub URL from components
 */
export function buildGitHubUrl(
  owner: string,
  repo: string,
  branch?: string,
  path?: string
): string {
  let url = `https://github.com/${owner}/${repo}`;

  if (branch) {
    url += `/tree/${branch}`;
    if (path) {
      url += `/${path}`;
    }
  }

  return url;
}

/**
 * Build a GitHub file URL for linking
 */
export function buildFileUrl(
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): string {
  return `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
}
