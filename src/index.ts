import * as core from '@actions/core'
import * as github from '@actions/github'
import { parseAlert } from './parsers'
import { buildPrompt } from './prompt'
import { createIssue, commentOnIssue } from './clients/github'
import { findDuplicates } from './dedup'
import { loadConfig } from './config'
import type { ActionInputs, ActionResult, Alert } from './types'

/**
 * Get action inputs from environment
 */
function getInputs(): ActionInputs {
  return {
    anthropicApiKey: core.getInput('anthropic_api_key', { required: true }),
    alertPayload: core.getInput('alert_payload', { required: true }),
    alertSource: core.getInput('alert_source') || 'auto',
    mode: (core.getInput('mode') || 'auto') as ActionInputs['mode'],
    createIssue: core.getInput('create_issue') !== 'false',
    pagerdutyApiKey: core.getInput('pagerduty_api_key') || undefined,
    confidenceThreshold: (core.getInput('confidence_threshold') || 'medium') as ActionInputs['confidenceThreshold'],
    timeoutMinutes: parseInt(core.getInput('timeout_minutes') || '10', 10),
    maxFilesChanged: parseInt(core.getInput('max_files_changed') || '10', 10)
  }
}

/**
 * Format issue body from alert
 */
function formatIssueBody(alert: Alert): string {
  let body = `## Alert Details

| Field | Value |
|-------|-------|
| Source | ${alert.source} |
| Severity | ${alert.severity} |
| Service | ${alert.service || 'N/A'} |
| Time | ${alert.timestamp} |
${alert.url ? `| Link | [View in ${alert.source}](${alert.url}) |` : ''}

## Description

${alert.description}
`

  if (alert.stackTrace) {
    body += `
## Stack Trace

\`\`\`
${alert.stackTrace}
\`\`\`
`
  }

  if (alert.tags && Object.keys(alert.tags).length > 0) {
    body += `
## Tags

${Object.entries(alert.tags).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}
`
  }

  body += `
---
*This issue was created automatically by [oncall-agent](https://github.com/vignesh07/oncall-agent)*
`

  return body
}

/**
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs()
    core.info('oncall-agent starting...')

    // Parse the alert payload
    let payload: unknown
    try {
      payload = JSON.parse(inputs.alertPayload)
    } catch {
      throw new Error('Failed to parse alert_payload as JSON')
    }

    const alert = parseAlert(payload, inputs.alertSource)
    core.info(`Parsed alert: "${alert.title}" from ${alert.source} (severity: ${alert.severity})`)

    // Load repository config
    const config = await loadConfig()

    // Check for duplicates
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN || '')
    const duplicates = await findDuplicates(alert, octokit, config)

    if (duplicates.length > 0) {
      const dup = duplicates[0]
      core.info(`Found duplicate issue #${dup.number} (similarity: ${(dup.similarity * 100).toFixed(0)}%)`)

      // Comment on existing issue
      await commentOnIssue(
        octokit,
        dup.number,
        `New alert received that appears related to this issue:\n\n**${alert.title}**\n\n${alert.description}`
      )

      core.setOutput('action_taken', 'duplicate')
      core.setOutput('duplicate_of', dup.number)
      core.setOutput('issue_number', dup.number)
      return
    }

    // Create tracking issue if enabled
    let issueNumber: number | undefined
    if (inputs.createIssue) {
      const labels = ['oncall-agent', alert.severity]
      if (alert.service) {
        labels.push(`service:${alert.service}`)
      }

      issueNumber = await createIssue(octokit, {
        title: `[${alert.source}] ${alert.title}`,
        body: formatIssueBody(alert),
        labels
      })
      core.info(`Created tracking issue #${issueNumber}`)
      core.setOutput('issue_number', issueNumber)
    }

    // Build prompt for Claude
    const prompt = buildPrompt(alert, config)
    core.debug(`Built prompt (${prompt.length} chars)`)

    // TODO: Invoke anthropics/claude-code-action
    // For now, just post analysis placeholder
    const result: ActionResult = {
      actionTaken: 'analysis_only',
      issueNumber,
      analysis: 'Claude Code analysis will be integrated here.',
      confidence: 'low'
    }

    // Post analysis to issue
    if (issueNumber) {
      await commentOnIssue(
        octokit,
        issueNumber,
        `## Analysis\n\n${result.analysis}\n\n**Confidence:** ${result.confidence}`
      )
    }

    // Set outputs
    core.setOutput('action_taken', result.actionTaken)
    core.setOutput('analysis', result.analysis)
    core.setOutput('confidence', result.confidence)
    if (result.prNumber) {
      core.setOutput('pr_number', result.prNumber)
    }

    core.info(`Action completed: ${result.actionTaken}`)

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.setFailed(`oncall-agent failed: ${message}`)
    core.setOutput('action_taken', 'error')
  }
}

run()
