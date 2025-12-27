import type { Alert, Config } from './types'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Build the prompt for Claude Code to investigate and fix the alert
 */
export function buildPrompt(alert: Alert, config: Config): string {
  const sections: string[] = []

  // Header
  sections.push(`You are an on-call engineer responding to a production alert.`)

  // Alert details section
  sections.push(`
## Alert Details

| Field | Value |
|-------|-------|
| Source | ${alert.source} |
| Title | ${alert.title} |
| Severity | ${alert.severity} |
| Service | ${alert.service || 'Unknown'} |
| Time | ${alert.timestamp} |
${alert.url ? `| Link | ${alert.url} |` : ''}`)

  // Description section
  sections.push(`
## Description

${alert.description}`)

  // Stack trace section
  if (alert.stackTrace) {
    sections.push(`
## Stack Trace

\`\`\`
${alert.stackTrace}
\`\`\``)
  }

  // Tags section
  if (alert.tags && Object.keys(alert.tags).length > 0) {
    const tagList = Object.entries(alert.tags)
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n')
    sections.push(`
## Additional Context

${tagList}`)
  }

  // Repository context from config
  if (config.context) {
    sections.push(`
## Repository Context

${config.context}`)
  }

  // Runbook content if available
  const runbookContent = getRunbookContent(alert, config)
  if (runbookContent) {
    sections.push(`
## Runbook

${runbookContent}`)
  }

  // Protected paths warning
  if (config.protectedPaths && config.protectedPaths.length > 0) {
    sections.push(`
## Protected Paths (DO NOT MODIFY)

The following paths should never be modified by automated fixes:
${config.protectedPaths.map(p => `- ${p}`).join('\n')}`)
  }

  // Instructions
  sections.push(`
## Instructions

1. **Analyze** the alert and identify the root cause
2. **Investigate** the codebase to find related code
3. **Assess** whether this is fixable via code change:
   - Config changes (timeouts, limits, feature flags)
   - Bug fixes (null checks, error handling, logic errors)
   - Resource adjustments (memory limits, pool sizes)
4. **If fixable:** Make the fix. Be conservative - prefer safe, minimal changes.
5. **If not fixable via code:** Document your analysis including:
   - What you investigated
   - Possible causes
   - Recommended actions for humans
   - What additional information would help

## Confidence Rating

After your analysis, rate your confidence:
- **high**: Stack trace points directly to bug, fix is obvious and safe
- **medium**: Likely cause identified, fix is reasonable but should be reviewed carefully
- **low**: Uncertain about cause or fix, needs human investigation

Always explain your reasoning for the confidence level.

## Important Guidelines

- Be conservative. Prefer safe, minimal changes over comprehensive refactoring.
- Do not modify protected paths.
- If you make changes, ensure they are backward compatible.
- Run tests if available to verify your fix.
- If unsure, err on the side of providing analysis rather than making changes.`)

  return sections.join('\n')
}

/**
 * Get runbook content if a matching runbook exists
 */
function getRunbookContent(alert: Alert, config: Config): string | undefined {
  if (!config.runbooks) return undefined

  // Try to match alert title/description to runbook patterns
  const alertText = `${alert.title} ${alert.description}`.toLowerCase()

  for (const [pattern, runbookPath] of Object.entries(config.runbooks)) {
    if (alertText.includes(pattern.toLowerCase())) {
      try {
        const fullPath = path.resolve(process.cwd(), runbookPath)
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          // Limit runbook content to avoid overwhelming the prompt
          const maxLength = 2000
          if (content.length > maxLength) {
            return content.substring(0, maxLength) + '\n\n... (runbook truncated)'
          }
          return content
        }
      } catch {
        // Ignore errors reading runbook
      }
    }
  }

  return undefined
}

/**
 * Build a shorter analysis-only prompt
 */
export function buildAnalysisPrompt(alert: Alert, config: Config): string {
  return `You are analyzing a production alert. Provide a detailed analysis but do not make any code changes.

## Alert

**${alert.title}** (${alert.severity})

${alert.description}

${alert.stackTrace ? `Stack trace:\n\`\`\`\n${alert.stackTrace}\n\`\`\`` : ''}

${config.context ? `## Context\n${config.context}` : ''}

## Instructions

1. Investigate the codebase to understand the issue
2. Identify likely root causes
3. Suggest potential fixes (but do not implement them)
4. Rate your confidence (high/medium/low)
5. List any additional information that would help diagnose the issue

Provide your analysis in a clear, structured format.`
}
