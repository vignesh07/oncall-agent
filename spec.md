# oncall-agent

A GitHub Action that receives alerts (PagerDuty, Datadog, CloudWatch) and either fixes the issue with a PR or leaves an analysis comment.

## How it works

```
Alert webhook → GitHub repository_dispatch → Action runs Claude Code → PR or Issue comment
                                                      ↓
                                         Update source (PagerDuty) with results
```

## Repository structure

```
oncall-agent/
├── action.yml                 # GitHub Action definition
├── src/
│   ├── index.ts              # Entry point
│   ├── parsers/
│   │   ├── index.ts          # Parser registry
│   │   ├── pagerduty.ts      # PagerDuty webhook parser
│   │   ├── datadog.ts        # Datadog webhook parser
│   │   ├── cloudwatch.ts     # CloudWatch/SNS parser
│   │   └── generic.ts        # Fallback parser
│   ├── clients/
│   │   ├── pagerduty.ts      # PagerDuty API client (update incidents)
│   │   └── github.ts         # GitHub API helpers
│   ├── prompt.ts             # Prompt construction
│   ├── types.ts              # Type definitions
│   └── utils.ts              # Helpers
├── examples/
│   ├── workflows/
│   │   └── oncall.yml        # Example workflow for users
│   └── webhook-setup/
│       ├── pagerduty.md      # PagerDuty webhook configuration guide
│       ├── datadog.md        # Datadog webhook configuration guide
│       └── cloudwatch.md     # CloudWatch/SNS configuration guide
├── tests/
│   ├── parsers/
│   │   ├── pagerduty.test.ts
│   │   ├── datadog.test.ts
│   │   └── cloudwatch.test.ts
│   └── fixtures/
│       ├── pagerduty-alert.json
│       ├── datadog-alert.json
│       └── cloudwatch-alert.json
├── README.md
├── LICENSE                    # MIT
├── package.json
└── tsconfig.json
```

## Core types

```typescript
// src/types.ts

interface Alert {
  source: 'pagerduty' | 'datadog' | 'cloudwatch' | 'generic'
  id: string                    // Alert/incident ID from source
  title: string
  description: string
  severity: 'critical' | 'warning' | 'info'
  stackTrace?: string
  service?: string              // Affected service name
  timestamp: string             // ISO 8601
  url?: string                  // Link back to incident in source system
  tags?: Record<string, string> // Additional metadata
  raw: unknown                  // Original payload for reference
}

interface ActionResult {
  actionTaken: 'pr_created' | 'analysis_only' | 'error'
  issueNumber?: number
  prNumber?: number
  analysis: string
  confidence: 'high' | 'medium' | 'low'
  error?: string
}

type AlertSource = 'pagerduty' | 'datadog' | 'cloudwatch' | 'generic'

interface Parser {
  parse(payload: unknown): Alert
  canParse(payload: unknown): boolean
}
```

## Action definition

```yaml
# action.yml
name: 'oncall-agent'
description: 'AI-powered on-call agent that responds to alerts with PRs or analysis'
author: 'YOUR_USERNAME'

inputs:
  anthropic_api_key:
    description: 'Anthropic API key'
    required: true
  
  alert_payload:
    description: 'JSON alert payload from webhook'
    required: true
  
  alert_source:
    description: 'Source of alert'
    required: false
    default: 'generic'
  
  mode:
    description: 'pr = attempt fix, analyze = comment only, auto = decide based on context'
    required: false
    default: 'auto'
  
  create_issue:
    description: 'Create GitHub issue to track the alert'
    required: false
    default: 'true'
  
  pagerduty_api_key:
    description: 'PagerDuty API key for updating incidents (optional)'
    required: false
  
  confidence_threshold:
    description: 'Minimum confidence to create PR (high, medium, low)'
    required: false
    default: 'medium'
  
  claude_model:
    description: 'Claude model to use'
    required: false
    default: 'claude-sonnet-4-20250514'
  
  timeout_minutes:
    description: 'Max time for Claude to work'
    required: false
    default: '10'

outputs:
  action_taken:
    description: 'What the agent did: pr_created, analysis_only, error'
  
  pr_number:
    description: 'PR number if created'
  
  issue_number:
    description: 'GitHub issue number'
  
  analysis:
    description: 'Agent analysis summary'
  
  confidence:
    description: 'Agent confidence in the fix: high, medium, low'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

## Parsers

### PagerDuty

```typescript
// src/parsers/pagerduty.ts

interface PagerDutyWebhook {
  event: {
    event_type: string
    data: {
      id: string
      type: string
      self: string
      html_url: string
      number: number
      title: string
      service: {
        id: string
        name: string
      }
      urgency: 'high' | 'low'
      created_at: string
      body?: {
        details?: {
          stack_trace?: string
          error_message?: string
          [key: string]: unknown
        }
      }
    }
  }
}

export function parse(payload: PagerDutyWebhook): Alert {
  const { event } = payload
  const { data } = event
  
  return {
    source: 'pagerduty',
    id: data.id,
    title: data.title,
    description: data.body?.details?.error_message || data.title,
    severity: data.urgency === 'high' ? 'critical' : 'warning',
    stackTrace: data.body?.details?.stack_trace,
    service: data.service?.name,
    timestamp: data.created_at,
    url: data.html_url,
    raw: payload
  }
}

export function canParse(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'event' in payload &&
    typeof (payload as any).event?.data?.id === 'string'
  )
}
```

### Datadog

```typescript
// src/parsers/datadog.ts

interface DatadogWebhook {
  id: string
  title: string
  text: string
  date: number
  priority: 'normal' | 'low'
  tags: string[]
  alert_type: 'error' | 'warning' | 'info' | 'success'
  event_msg?: string
  snapshot_url?: string
}

export function parse(payload: DatadogWebhook): Alert {
  // Extract stack trace from text if present
  const stackTraceMatch = payload.text?.match(/```[\s\S]*?```/g)
  const stackTrace = stackTraceMatch?.[0]?.replace(/```/g, '').trim()
  
  // Extract service from tags
  const serviceTag = payload.tags?.find(t => t.startsWith('service:'))
  const service = serviceTag?.split(':')[1]
  
  return {
    source: 'datadog',
    id: payload.id,
    title: payload.title,
    description: payload.text || payload.title,
    severity: payload.alert_type === 'error' ? 'critical' : 
              payload.alert_type === 'warning' ? 'warning' : 'info',
    stackTrace,
    service,
    timestamp: new Date(payload.date * 1000).toISOString(),
    url: payload.snapshot_url,
    tags: Object.fromEntries(
      payload.tags?.map(t => t.split(':')) || []
    ),
    raw: payload
  }
}
```

### CloudWatch (via SNS)

```typescript
// src/parsers/cloudwatch.ts

interface SNSMessage {
  Type: string
  Message: string  // JSON stringified CloudWatch alarm
  Timestamp: string
}

interface CloudWatchAlarm {
  AlarmName: string
  AlarmDescription: string
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA'
  NewStateReason: string
  Trigger: {
    MetricName: string
    Namespace: string
    Dimensions: Array<{ name: string; value: string }>
  }
}

export function parse(payload: SNSMessage): Alert {
  const alarm: CloudWatchAlarm = JSON.parse(payload.Message)
  
  const service = alarm.Trigger.Dimensions?.find(
    d => d.name === 'ServiceName' || d.name === 'FunctionName'
  )?.value
  
  return {
    source: 'cloudwatch',
    id: alarm.AlarmName,
    title: alarm.AlarmName,
    description: alarm.NewStateReason,
    severity: alarm.NewStateValue === 'ALARM' ? 'critical' : 'warning',
    service,
    timestamp: payload.Timestamp,
    tags: {
      metric: alarm.Trigger.MetricName,
      namespace: alarm.Trigger.Namespace
    },
    raw: payload
  }
}
```

### Generic

```typescript
// src/parsers/generic.ts

export function parse(payload: unknown): Alert {
  const p = payload as Record<string, unknown>
  
  return {
    source: 'generic',
    id: String(p.id || p.incident_id || p.alert_id || Date.now()),
    title: String(p.title || p.summary || p.name || 'Unknown Alert'),
    description: String(p.description || p.message || p.body || p.text || ''),
    severity: inferSeverity(p),
    stackTrace: findStackTrace(p),
    service: String(p.service || p.service_name || ''),
    timestamp: String(p.timestamp || p.created_at || new Date().toISOString()),
    url: String(p.url || p.link || ''),
    raw: payload
  }
}

function inferSeverity(p: Record<string, unknown>): Alert['severity'] {
  const sev = String(p.severity || p.priority || p.urgency || '').toLowerCase()
  if (['critical', 'high', 'p1', 'emergency'].includes(sev)) return 'critical'
  if (['warning', 'medium', 'p2'].includes(sev)) return 'warning'
  return 'info'
}

function findStackTrace(p: Record<string, unknown>): string | undefined {
  // Check common fields
  for (const key of ['stack_trace', 'stackTrace', 'stack', 'backtrace', 'traceback']) {
    if (typeof p[key] === 'string') return p[key] as string
  }
  
  // Check nested
  if (typeof p.details === 'object' && p.details !== null) {
    return findStackTrace(p.details as Record<string, unknown>)
  }
  
  // Look for stack-like patterns in description
  const desc = String(p.description || p.message || '')
  if (desc.includes(' at ') && desc.includes(':')) {
    return desc
  }
  
  return undefined
}
```

## Prompt construction

```typescript
// src/prompt.ts

export function buildPrompt(alert: Alert, repoContext: string): string {
  return `You are an on-call engineer responding to a production alert.

## Alert Details

**Source:** ${alert.source}
**Title:** ${alert.title}
**Severity:** ${alert.severity}
**Service:** ${alert.service || 'Unknown'}
**Time:** ${alert.timestamp}
${alert.url ? `**Link:** ${alert.url}` : ''}

## Description

${alert.description}

${alert.stackTrace ? `## Stack Trace

\`\`\`
${alert.stackTrace}
\`\`\`
` : ''}

## Repository Context

${repoContext}

## Instructions

1. **Analyze** the alert and identify the root cause
2. **Assess** whether this is fixable via code change:
   - Config changes (timeouts, limits, feature flags)
   - Bug fixes (null checks, error handling, logic errors)
   - Resource adjustments (memory limits, pool sizes)
3. **If fixable:** Make the fix. Be conservative - prefer safe, minimal changes.
4. **If not fixable:** Document your analysis including:
   - What you investigated
   - Possible causes
   - Recommended actions for humans
   - What additional information would help

## Confidence

After your analysis, rate your confidence:
- **high**: Stack trace points directly to bug, fix is obvious and safe
- **medium**: Likely cause identified, fix is reasonable but should be reviewed
- **low**: Uncertain about cause or fix, needs human investigation

Always explain your reasoning.`
}
```

## Main logic

```typescript
// src/index.ts

import * as core from '@actions/core'
import * as github from '@actions/github'
import { parseAlert } from './parsers'
import { buildPrompt } from './prompt'
import { runClaudeCode } from './claude'
import { createIssue, createPR, commentOnIssue } from './clients/github'
import { updateIncident } from './clients/pagerduty'
import type { Alert, ActionResult } from './types'

async function run(): Promise<void> {
  try {
    // Get inputs
    const alertPayload = JSON.parse(core.getInput('alert_payload'))
    const alertSource = core.getInput('alert_source')
    const mode = core.getInput('mode')
    const shouldCreateIssue = core.getInput('create_issue') === 'true'
    const confidenceThreshold = core.getInput('confidence_threshold')
    const pagerdutyApiKey = core.getInput('pagerduty_api_key')
    
    // Parse alert
    const alert = parseAlert(alertPayload, alertSource)
    core.info(`Parsed alert: ${alert.title} (${alert.source})`)
    
    // Create tracking issue if enabled
    let issueNumber: number | undefined
    if (shouldCreateIssue) {
      issueNumber = await createIssue(alert)
      core.info(`Created issue #${issueNumber}`)
    }
    
    // Build prompt with repo context
    const repoContext = await getRepoContext()
    const prompt = buildPrompt(alert, repoContext)
    
    // Run Claude Code
    const result = await runClaudeCode(prompt, {
      mode,
      confidenceThreshold,
      timeoutMinutes: parseInt(core.getInput('timeout_minutes'))
    })
    
    // Handle results
    if (result.hasChanges && meetsConfidenceThreshold(result.confidence, confidenceThreshold)) {
      // Create PR
      const prNumber = await createPR({
        title: `fix: ${alert.title}`,
        body: formatPRBody(alert, result),
        issueNumber
      })
      
      core.info(`Created PR #${prNumber}`)
      core.setOutput('action_taken', 'pr_created')
      core.setOutput('pr_number', prNumber)
      
      // Update PagerDuty if configured
      if (pagerdutyApiKey && alert.source === 'pagerduty') {
        await updateIncident(pagerdutyApiKey, alert.id, {
          note: `AI agent created PR #${prNumber}: ${result.analysis}`
        })
      }
    } else {
      // Comment with analysis
      if (issueNumber) {
        await commentOnIssue(issueNumber, formatAnalysisComment(alert, result))
      }
      
      core.info('Posted analysis comment')
      core.setOutput('action_taken', 'analysis_only')
      
      // Update PagerDuty if configured
      if (pagerdutyApiKey && alert.source === 'pagerduty') {
        await updateIncident(pagerdutyApiKey, alert.id, {
          note: `AI agent analysis: ${result.analysis}`
        })
      }
    }
    
    // Set common outputs
    if (issueNumber) core.setOutput('issue_number', issueNumber)
    core.setOutput('analysis', result.analysis)
    core.setOutput('confidence', result.confidence)
    
  } catch (error) {
    core.setFailed(`Action failed: ${error}`)
    core.setOutput('action_taken', 'error')
  }
}

function meetsConfidenceThreshold(
  confidence: string, 
  threshold: string
): boolean {
  const levels = ['low', 'medium', 'high']
  return levels.indexOf(confidence) >= levels.indexOf(threshold)
}

function formatPRBody(alert: Alert, result: ActionResult): string {
  return `## Alert Response

This PR was automatically generated by oncall-agent in response to an alert.

### Alert Details

| Field | Value |
|-------|-------|
| Source | ${alert.source} |
| Title | ${alert.title} |
| Severity | ${alert.severity} |
| Service | ${alert.service || 'N/A'} |
${alert.url ? `| Link | ${alert.url} |` : ''}

### Analysis

${result.analysis}

### Confidence: ${result.confidence}

---
⚠️ **Please review carefully before merging.**
`
}

function formatAnalysisComment(alert: Alert, result: ActionResult): string {
  return `## 🤖 oncall-agent Analysis

I investigated this alert but did not find a code fix I'm confident in.

### What I Found

${result.analysis}

### Confidence: ${result.confidence}

### Recommended Next Steps

- Review the analysis above
- Check related logs and metrics
- Consider whether this requires infrastructure changes

---
*This analysis was generated automatically. Please verify before taking action.*
`
}

run()
```

## PagerDuty client

```typescript
// src/clients/pagerduty.ts

interface UpdateIncidentOptions {
  note?: string
  status?: 'acknowledged' | 'resolved'
}

export async function updateIncident(
  apiKey: string,
  incidentId: string,
  options: UpdateIncidentOptions
): Promise<void> {
  const headers = {
    'Authorization': `Token token=${apiKey}`,
    'Content-Type': 'application/json'
  }
  
  if (options.note) {
    await fetch(`https://api.pagerduty.com/incidents/${incidentId}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        note: {
          content: options.note
        }
      })
    })
  }
  
  if (options.status) {
    await fetch(`https://api.pagerduty.com/incidents/${incidentId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        incident: {
          type: 'incident_reference',
          status: options.status
        }
      })
    })
  }
}
```

## Example user workflow

```yaml
# .github/workflows/oncall.yml
name: On-Call Agent

on:
  repository_dispatch:
    types: [pagerduty-alert, datadog-alert, cloudwatch-alert, alert]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  respond:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: YOUR_USERNAME/oncall-agent@v1
        id: oncall
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          alert_payload: ${{ toJson(github.event.client_payload) }}
          alert_source: ${{ github.event.action }}
          pagerduty_api_key: ${{ secrets.PAGERDUTY_API_KEY }}  # Optional
          confidence_threshold: medium
      
      - name: Summary
        run: |
          echo "Action: ${{ steps.oncall.outputs.action_taken }}"
          echo "Issue: ${{ steps.oncall.outputs.issue_number }}"
          echo "PR: ${{ steps.oncall.outputs.pr_number }}"
          echo "Confidence: ${{ steps.oncall.outputs.confidence }}"
```

## Webhook setup guides

### PagerDuty

Create a webhook subscription that POSTs to GitHub's repository_dispatch:

**Option 1: PagerDuty Webhooks V3 + Middleware**

Use a Cloudflare Worker, AWS Lambda, or similar to transform and forward:

```typescript
// Cloudflare Worker example
export default {
  async fetch(request) {
    const payload = await request.json()
    
    await fetch('https://api.github.com/repos/OWNER/REPO/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: 'pagerduty-alert',
        client_payload: payload
      })
    })
    
    return new Response('OK')
  }
}
```

**Option 2: PagerDuty → GitHub Issue (native)**

PagerDuty can create GitHub issues directly. Then use an issue-triggered workflow:

```yaml
on:
  issues:
    types: [opened]

jobs:
  respond:
    if: contains(github.event.issue.labels.*.name, 'pagerduty')
    # ... rest of workflow
```

### Datadog

1. Go to Integrations → Webhooks
2. Create a new webhook pointing to your middleware
3. Use the webhook in Monitor notifications: `@webhook-oncall-agent`

### CloudWatch

1. Create an SNS topic
2. Subscribe a Lambda that forwards to GitHub repository_dispatch
3. Configure CloudWatch Alarms to notify the SNS topic

## Duplicate detection

```typescript
// src/utils.ts

export async function findSimilarIssues(
  alert: Alert,
  octokit: Octokit
): Promise<Array<{ number: number; title: string; similarity: number }>> {
  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    state: 'all',
    labels: 'oncall-agent',
    per_page: 50
  })
  
  return issues
    .map(issue => ({
      number: issue.number,
      title: issue.title,
      similarity: calculateSimilarity(alert.title, issue.title)
    }))
    .filter(i => i.similarity > 0.7)
    .sort((a, b) => b.similarity - a.similarity)
}

function calculateSimilarity(a: string, b: string): number {
  // Simple Jaccard similarity on words
  const wordsA = new Set(a.toLowerCase().split(/\s+/))
  const wordsB = new Set(b.toLowerCase().split(/\s+/))
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)))
  const union = new Set([...wordsA, ...wordsB])
  return intersection.size / union.size
}
```

## Learning from past fixes

When a PR is merged, store the alert → fix mapping:

```yaml
# .github/workflows/learn.yml
name: Learn from merged fix

on:
  pull_request:
    types: [closed]

jobs:
  learn:
    if: github.event.pull_request.merged && contains(github.event.pull_request.labels.*.name, 'oncall-agent')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Store fix pattern
        run: |
          # Append to .oncall-agent/fixes.jsonl
          echo '${{ toJson(github.event.pull_request) }}' >> .oncall-agent/fixes.jsonl
          git add .oncall-agent/fixes.jsonl
          git commit -m "chore: record successful fix pattern"
          git push
```

The agent can reference this file for similar future alerts.

## Configuration file

Users can customize behavior with `.oncall-agent/config.yml`:

```yaml
# .oncall-agent/config.yml

# Services this repo is responsible for
services:
  - user-service
  - auth-service

# Files/paths the agent should never modify
protected_paths:
  - src/core/security/**
  - migrations/**

# Additional context to include in prompts
context: |
  This is a Node.js monorepo using TypeScript.
  We use PostgreSQL for persistence and Redis for caching.
  Feature flags are in src/config/flags.ts.

# Runbooks to reference
runbooks:
  high-memory: docs/runbooks/high-memory.md
  database-connection: docs/runbooks/db-connections.md

# Auto-merge settings
auto_merge:
  enabled: false
  require_tests: true
  max_files_changed: 3
```

## Testing

```typescript
// tests/parsers/pagerduty.test.ts

import { parse, canParse } from '../../src/parsers/pagerduty'
import fixture from '../fixtures/pagerduty-alert.json'

describe('PagerDuty parser', () => {
  it('should detect PagerDuty payloads', () => {
    expect(canParse(fixture)).toBe(true)
    expect(canParse({ random: 'object' })).toBe(false)
  })
  
  it('should parse alert correctly', () => {
    const alert = parse(fixture)
    
    expect(alert.source).toBe('pagerduty')
    expect(alert.title).toBe('High Error Rate on user-service')
    expect(alert.severity).toBe('critical')
    expect(alert.stackTrace).toContain('NullPointerException')
  })
})
```

## README outline

1. **What it does** — One sentence
2. **Demo GIF** — Show alert → PR flow
3. **Quick start** — Copy workflow file, add secrets, configure webhook
4. **How it works** — Simple diagram
5. **Configuration** — Inputs, config file, examples
6. **Webhook setup** — PagerDuty, Datadog, CloudWatch guides
7. **FAQ** — Cost, security, limitations
8. **Contributing**