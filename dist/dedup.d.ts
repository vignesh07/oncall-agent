import type { Alert, Config } from './types';
import type { GitHub } from '@actions/github/lib/utils';
type Octokit = InstanceType<typeof GitHub>;
interface DuplicateMatch {
    number: number;
    title: string;
    similarity: number;
}
/**
 * Calculate Jaccard similarity between two strings
 * Uses word-level comparison for better matching
 */
export declare function jaccardSimilarity(a: string, b: string): number;
/**
 * Calculate similarity score between an alert and an issue
 * Combines title similarity with optional stack trace comparison
 */
export declare function calculateSimilarity(alert: Alert, issue: {
    title: string;
    body: string | null;
}): number;
/**
 * Find duplicate or similar issues for an alert
 */
export declare function findDuplicates(alert: Alert, octokit: Octokit, config: Config): Promise<DuplicateMatch[]>;
/**
 * Check if an alert ID has already been processed
 * Uses exact ID matching as a fast first check
 */
export declare function isAlertProcessed(alert: Alert, octokit: Octokit): Promise<{
    processed: boolean;
    issueNumber?: number;
}>;
export {};
