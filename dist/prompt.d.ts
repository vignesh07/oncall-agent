import type { Alert, Config } from './types';
/**
 * Build the prompt for Claude Code to investigate and fix the alert
 */
export declare function buildPrompt(alert: Alert, config: Config): string;
/**
 * Build a shorter analysis-only prompt
 */
export declare function buildAnalysisPrompt(alert: Alert, config: Config): string;
