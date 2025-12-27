/**
 * Alert sources supported by oncall-agent
 */
export type AlertSource =
  | 'pagerduty'
  | 'datadog'
  | 'cloudwatch'
  | 'sentry'
  | 'opsgenie'
  | 'prometheus'
  | 'generic'

/**
 * Severity levels for alerts
 */
export type Severity = 'critical' | 'warning' | 'info'

/**
 * Confidence levels for AI analysis
 */
export type Confidence = 'high' | 'medium' | 'low'

/**
 * Normalized alert structure
 * All parsers convert source-specific payloads to this format
 */
export interface Alert {
  /** Source system that generated the alert */
  source: AlertSource
  /** Unique identifier from the source system */
  id: string
  /** Human-readable alert title */
  title: string
  /** Detailed description of the alert */
  description: string
  /** Alert severity level */
  severity: Severity
  /** Stack trace if available */
  stackTrace?: string
  /** Name of the affected service */
  service?: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** URL to the alert in the source system */
  url?: string
  /** Additional metadata as key-value pairs */
  tags?: Record<string, string>
  /** Original raw payload for reference */
  raw: unknown
}

/**
 * Result of the oncall-agent action
 */
export interface ActionResult {
  /** What action was taken */
  actionTaken: 'pr_created' | 'analysis_only' | 'duplicate' | 'error'
  /** GitHub issue number if created */
  issueNumber?: number
  /** GitHub PR number if created */
  prNumber?: number
  /** Issue number this is a duplicate of */
  duplicateOf?: number
  /** AI analysis summary */
  analysis: string
  /** Confidence level of the analysis/fix */
  confidence: Confidence
  /** Error message if actionTaken is 'error' */
  error?: string
}

/**
 * Parser interface for converting source payloads to normalized Alert
 */
export interface Parser {
  /** Name of the alert source this parser handles */
  name: AlertSource
  /** Check if this parser can handle the given payload */
  canParse(payload: unknown): boolean
  /** Parse the payload into a normalized Alert */
  parse(payload: unknown): Alert
}

/**
 * Configuration for oncall-agent loaded from .oncall-agent/config.yml
 */
export interface Config {
  /** Services this repository is responsible for */
  services?: string[]
  /** Paths that should never be modified */
  protectedPaths?: string[]
  /** Additional context to include in prompts */
  context?: string
  /** Mapping of alert patterns to runbook paths */
  runbooks?: Record<string, string>
  /** Deduplication settings */
  deduplication?: {
    enabled?: boolean
    similarityThreshold?: number
    lookbackHours?: number
  }
  /** Auto-merge settings (always disabled for safety) */
  autoMerge?: {
    enabled: false
  }
}

/**
 * Action inputs from action.yml
 */
export interface ActionInputs {
  anthropicApiKey: string
  alertPayload: string
  alertSource: string
  mode: 'auto' | 'pr' | 'analyze'
  createIssue: boolean
  pagerdutyApiKey?: string
  confidenceThreshold: Confidence
  timeoutMinutes: number
  maxFilesChanged: number
}
