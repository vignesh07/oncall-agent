import type { Confidence } from './types';
export interface ClaudeResult {
    success: boolean;
    analysis: string;
    confidence: Confidence;
    hasChanges: boolean;
    changedFiles: string[];
    error?: string;
}
/**
 * Run Claude Code CLI to analyze and potentially fix an issue
 */
export declare function runClaudeCode(prompt: string, options: {
    timeoutMinutes: number;
    maxFilesChanged: number;
    workingDirectory?: string;
}): Promise<ClaudeResult>;
/**
 * Check if confidence meets threshold
 */
export declare function meetsConfidenceThreshold(confidence: Confidence, threshold: Confidence): boolean;
