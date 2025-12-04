/**
 * Skills Registry
 *
 * Central registry for all available skills.
 * Similar pattern to tool registry.
 */

import { Skill } from './types';
import { paperReaderSkill } from './paper-reader-skill';

// Export types
export * from './types';
export { BaseSkill } from './base-skill';

// All available skills
const allSkills: Skill[] = [
  paperReaderSkill,
];

// Skill registry map
const skillRegistry = new Map<string, Skill>(
  allSkills.map(skill => [skill.id, skill])
);

/**
 * Get a skill by ID
 */
export function getSkill(id: string): Skill | undefined {
  return skillRegistry.get(id);
}

/**
 * Get all available skills
 */
export function getSkills(): Skill[] {
  return allSkills;
}

/**
 * Get all skill IDs
 */
export function getSkillIds(): string[] {
  return allSkills.map(s => s.id);
}

/**
 * Check if a skill exists
 */
export function hasSkill(id: string): boolean {
  return skillRegistry.has(id);
}

/**
 * Format skill for prompt (for agent to understand available skills)
 */
export function formatSkillForPrompt(skill: Skill): string {
  return `- ${skill.id}: ${skill.description}
  Required tools: ${skill.requiredTools.join(', ')}`;
}

/**
 * Get all skills formatted for prompt
 */
export function formatAllSkillsForPrompt(): string {
  return allSkills.map(formatSkillForPrompt).join('\n\n');
}

// Export individual skills for direct access
export { paperReaderSkill } from './paper-reader-skill';
