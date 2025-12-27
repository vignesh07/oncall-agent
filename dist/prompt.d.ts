import type { Alert, Config } from './types';
/**
 * Build the prompt for Claude Code to investigate and fix the alert
 */
export declare function buildPrompt(alert: Alert, config: Config, testCommand?: string): string;
/**
 * Build prompt for responding to PR review comments
 */
export declare function buildReviewPrompt(options: {
    prNumber: number;
    prTitle: string;
    prBody: string;
    commentBody: string;
    changedFiles: string[];
    testCommand?: string;
}): string;
/**
 * Build a shorter analysis-only prompt
 */
export declare function buildAnalysisPrompt(alert: Alert, config: Config): string;
