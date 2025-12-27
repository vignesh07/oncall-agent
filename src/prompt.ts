import type { Alert, Config } from './types'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Build the prompt for Claude Code to investigate and fix the alert
 */
export function buildPrompt(alert: Alert, config: Config, testCommand?: string): string {
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
  let instructions = `
## Instructions

Your PRIMARY goal is to FIX the issue if possible. Follow these steps:

1. **Investigate** - Read the files mentioned in the stack trace and find the bug
2. **Fix it** - If you can identify the bug, USE THE EDIT TOOL to fix it immediately`

  if (testCommand) {
    instructions += `
3. **Run tests** - After making your fix, run: \`${testCommand}\`
4. **Fix test failures** - If tests fail, analyze the output and fix the issues
5. **Repeat** - Keep running tests until they pass`
  } else {
    instructions += `
3. **Verify** - Check that your fix is correct and doesn't break anything`
  }

  instructions += `

### What to fix:
- Null/undefined checks
- Division by zero checks
- Error handling
- Logic errors
- Missing validation

### IMPORTANT: You MUST use the Edit tool to make changes if you find a fixable bug.
Do not just analyze - actually fix the code!`

  if (testCommand) {
    instructions += `

### IMPORTANT: After fixing, run \`${testCommand}\` to verify your changes work.
If tests fail, fix the issues and run again until all tests pass.`
  }

  instructions += `

## If Not Fixable

Only if you cannot identify a code fix, provide analysis:
- What you investigated
- Possible causes
- Recommended actions

## Confidence Rating

After your fix or analysis:
- **high**: Bug found and fixed${testCommand ? ', tests passing' : ''}, or obvious issue identified
- **medium**: Likely fix applied, should be reviewed
- **low**: Uncertain, needs human investigation

## Guidelines

- Make minimal, safe changes
- Do not modify protected paths
- Ensure backward compatibility`

  sections.push(instructions)

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
 * Build prompt for responding to PR review comments
 */
export function buildReviewPrompt(options: {
  prNumber: number
  prTitle: string
  prBody: string
  commentBody: string
  changedFiles: string[]
  testCommand?: string
}): string {
  const { prNumber, prTitle, prBody, commentBody, changedFiles, testCommand } = options

  let prompt = `You are responding to a code review comment on PR #${prNumber}.

## PR Information

**Title:** ${prTitle}

**Description:**
${prBody}

**Files changed in this PR:**
${changedFiles.map(f => `- ${f}`).join('\n')}

## Review Comment

The reviewer has left the following feedback:

> ${commentBody.split('\n').join('\n> ')}

## Instructions

Your task is to address the reviewer's feedback:

1. **Understand** - Read the files mentioned and understand the current implementation
2. **Address** - Make the changes requested by the reviewer
3. **Fix** - USE THE EDIT TOOL to implement the changes`

  if (testCommand) {
    prompt += `
4. **Run tests** - After making changes, run: \`${testCommand}\`
5. **Fix failures** - If tests fail, fix the issues and run again until they pass`
  }

  prompt += `

### IMPORTANT: You MUST use the Edit tool to make changes.
Do not just analyze - actually fix the code based on the feedback!`

  if (testCommand) {
    prompt += `

### IMPORTANT: After making changes, run \`${testCommand}\` to verify your changes work.
If tests fail, fix the issues and run again until all tests pass.`
  }

  prompt += `

### Guidelines

- Make minimal, focused changes that address the specific feedback
- Maintain consistency with existing code style
- Ensure changes don't break existing functionality
- If the request is unclear or not feasible, explain why

After making changes, summarize what you did.`

  return prompt
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
