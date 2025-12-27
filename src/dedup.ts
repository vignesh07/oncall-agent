import type { Alert, Config } from './types'
import type { GitHub } from '@actions/github/lib/utils'
import { listRecentIssues } from './clients/github'

type Octokit = InstanceType<typeof GitHub>

interface DuplicateMatch {
  number: number
  title: string
  similarity: number
}

/**
 * Calculate Jaccard similarity between two strings
 * Uses word-level comparison for better matching
 */
export function jaccardSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2) // Ignore short words

  const setA = new Set(normalize(a))
  const setB = new Set(normalize(b))

  if (setA.size === 0 || setB.size === 0) {
    return 0
  }

  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])

  return intersection.size / union.size
}

/**
 * Calculate similarity score between an alert and an issue
 * Combines title similarity with optional stack trace comparison
 */
export function calculateSimilarity(
  alert: Alert,
  issue: { title: string; body: string | null }
): number {
  // Title similarity (weighted heavily)
  const titleSimilarity = jaccardSimilarity(alert.title, issue.title)

  // Description/body similarity
  let bodySimilarity = 0
  if (issue.body) {
    bodySimilarity = jaccardSimilarity(alert.description, issue.body)
  }

  // Stack trace matching (if present in both)
  let stackSimilarity = 0
  if (alert.stackTrace && issue.body) {
    // Extract potential stack trace from issue body
    const bodyStackMatch = issue.body.match(/```[\s\S]*?```/)
    if (bodyStackMatch) {
      const issueStack = bodyStackMatch[0].replace(/```/g, '').trim()
      stackSimilarity = jaccardSimilarity(alert.stackTrace, issueStack)
    }
  }

  // Weighted combination
  // Title is most important, then stack trace, then description
  const weights = {
    title: 0.5,
    stack: alert.stackTrace ? 0.3 : 0,
    body: alert.stackTrace ? 0.2 : 0.5
  }

  return (
    titleSimilarity * weights.title +
    stackSimilarity * weights.stack +
    bodySimilarity * weights.body
  )
}

/**
 * Find duplicate or similar issues for an alert
 */
export async function findDuplicates(
  alert: Alert,
  octokit: Octokit,
  config: Config
): Promise<DuplicateMatch[]> {
  // Get deduplication settings
  const dedupConfig = config.deduplication || {}
  const enabled = dedupConfig.enabled !== false // Default to enabled
  const threshold = dedupConfig.similarityThreshold ?? 0.7
  const lookbackHours = dedupConfig.lookbackHours ?? 24

  if (!enabled) {
    return []
  }

  // Calculate the since date
  const since = new Date()
  since.setHours(since.getHours() - lookbackHours)

  // Fetch recent OPEN issues with oncall-agent label
  const recentIssues = await listRecentIssues(octokit, {
    labels: ['oncall-agent'],
    state: 'open',
    since: since.toISOString(),
    perPage: 50
  })

  // Calculate similarity for each issue
  const matches: DuplicateMatch[] = []

  for (const issue of recentIssues) {
    const similarity = calculateSimilarity(alert, issue)

    if (similarity >= threshold) {
      matches.push({
        number: issue.number,
        title: issue.title,
        similarity
      })
    }
  }

  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity)

  return matches
}

/**
 * Check if an alert ID has already been processed
 * Uses exact ID matching as a fast first check
 */
export async function isAlertProcessed(
  alert: Alert,
  octokit: Octokit
): Promise<{ processed: boolean; issueNumber?: number }> {
  // Search for issues with the exact alert ID in the title or body
  const recentIssues = await listRecentIssues(octokit, {
    labels: ['oncall-agent'],
    state: 'open',
    perPage: 100
  })

  for (const issue of recentIssues) {
    // Check if alert ID appears in title or body
    if (
      issue.title.includes(alert.id) ||
      (issue.body && issue.body.includes(alert.id))
    ) {
      return { processed: true, issueNumber: issue.number }
    }
  }

  return { processed: false }
}
