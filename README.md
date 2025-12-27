# oncall-agent

A GitHub Action that responds to production alerts with AI-powered analysis and fixes.

When an alert fires from PagerDuty, Datadog, CloudWatch, Sentry, Opsgenie, or Prometheus, this action:

1. Parses the alert into a normalized format
2. Checks for duplicate/similar existing issues
3. Creates a GitHub issue to track the alert
4. Uses Claude Code to investigate the codebase
5. Either creates a PR with a fix, or posts an analysis comment
6. Updates the source system (e.g., adds a note to PagerDuty)

## Features

- **Multi-source support**: PagerDuty, Datadog, CloudWatch, Sentry, Opsgenie, Prometheus
- **Automatic fixes**: Claude analyzes code and creates PRs with fixes
- **Test integration**: Run tests after fixes to verify they work
- **PR review mode**: Respond to PR comments and push updates
- **Deduplication**: Prevents duplicate issues for similar alerts
- **Safety first**: Never auto-merges, configurable protected paths

## Quick Start

### 1. Add the workflow

Create `.github/workflows/oncall.yml`:

```yaml
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
      - uses: vignesh07/oncall-agent@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          alert_payload: ${{ toJson(github.event.client_payload) }}
          alert_source: ${{ github.event.action }}
          # Run tests after fixing to verify changes
          test_command: 'npm test'
          # Create ready-to-merge PRs (not drafts)
          draft_pr: 'false'
```

### 2. Add your API key

Go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add `ANTHROPIC_API_KEY` with your Anthropic API key.

### 3. Configure webhook forwarding

See [Webhook Setup Guides](./examples/webhook-setup/) for your alert source:
- [PagerDuty](./examples/webhook-setup/pagerduty.md)
- [Datadog](./examples/webhook-setup/datadog.md)
- [CloudWatch](./examples/webhook-setup/cloudwatch.md)

## PR Review Mode

oncall-agent can also respond to PR review comments and push fixes. When someone mentions `@oncall-agent` in a PR comment, it will:

1. Check out the PR branch
2. Analyze the review feedback
3. Make the requested changes
4. Run tests (if configured)
5. Commit and push to the PR
6. Comment with what it did

### Setup PR Review Workflow

Create `.github/workflows/oncall-pr-review.yml`:

```yaml
name: oncall-agent PR Review

on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  respond-to-review:
    if: |
      github.event.issue.pull_request &&
      contains(github.event.comment.body, '@oncall-agent')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: vignesh07/oncall-agent@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: review
          pr_number: ${{ github.event.issue.number }}
          comment_body: ${{ github.event.comment.body }}
          test_command: 'npm test'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## How It Works

```
Alert Source (PagerDuty/Datadog/etc)
        ↓
Webhook → Forwarder → GitHub repository_dispatch
        ↓
oncall-agent Action
        ↓
┌─────────────────────────────────┐
│ 1. Parse alert                  │
│ 2. Check for duplicates         │
│ 3. Create tracking issue        │
│ 4. Invoke Claude Code           │
│ 5. Run tests (if configured)    │
│ 6. Create PR or post analysis   │
│ 7. Update source system         │
└─────────────────────────────────┘
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `anthropic_api_key` | Yes | - | Anthropic API key |
| `alert_payload` | Yes* | - | JSON alert payload (*not required for review mode) |
| `alert_source` | No | `auto` | Source: pagerduty, datadog, cloudwatch, sentry, opsgenie, prometheus, generic, auto |
| `mode` | No | `auto` | Mode: pr, analyze, auto, **review** |
| `create_issue` | No | `true` | Create GitHub issue |
| `pagerduty_api_key` | No | - | PagerDuty API key for updates |
| `confidence_threshold` | No | `medium` | Minimum confidence for PR: high, medium, low |
| `timeout_minutes` | No | `10` | Max time for Claude |
| `max_files_changed` | No | `10` | Max files in a fix |
| `draft_pr` | No | `true` | Create PRs as drafts |
| `test_command` | No | - | Command to run tests (e.g., `npm test`, `pytest`) |

### Review Mode Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pr_number` | Yes* | - | PR number to respond to (*required for review mode) |
| `comment_body` | Yes* | - | Comment text to respond to (*required for review mode) |
| `comment_id` | No | - | Comment ID for threading |

## Outputs

| Output | Description |
|--------|-------------|
| `action_taken` | What happened: pr_created, analysis_only, duplicate, error |
| `pr_number` | PR number if created |
| `issue_number` | Issue number |
| `analysis` | Claude's analysis |
| `confidence` | Confidence level |
| `duplicate_of` | Issue number if duplicate |

## Configuration

Create `.oncall-agent/config.yml` in your repository:

```yaml
# Services this repo handles
services:
  - user-service
  - auth-service

# Paths that should never be modified
protected_paths:
  - src/core/security/**
  - migrations/**

# Context for Claude
context: |
  This is a Node.js monorepo using TypeScript.
  Feature flags are in src/config/flags.ts.

# Runbook mappings
runbooks:
  high-memory: docs/runbooks/high-memory.md
  database-connection: docs/runbooks/db-connections.md

# Deduplication
deduplication:
  enabled: true
  similarity_threshold: 0.7
  lookback_hours: 24
```

## Supported Alert Sources

| Source | Parser | Webhook Docs |
|--------|--------|--------------|
| PagerDuty | V3 Webhooks | [Setup](./examples/webhook-setup/pagerduty.md) |
| Datadog | Webhooks | [Setup](./examples/webhook-setup/datadog.md) |
| CloudWatch | SNS → Lambda | [Setup](./examples/webhook-setup/cloudwatch.md) |
| Sentry | Webhooks | Coming soon |
| Opsgenie | Webhooks | Coming soon |
| Prometheus | Alertmanager | Coming soon |
| Generic | Auto-detect | Any JSON payload |

## Safety Features

- **Never auto-merges**: PRs always require human review
- **Protected paths**: Configurable paths that won't be modified
- **Confidence thresholds**: Only creates PRs when confident
- **Deduplication**: Prevents alert spam
- **Timeout limits**: Bounded execution time
- **Test verification**: Run tests before creating PRs

## Examples

### Basic Workflow

See [examples/workflows/oncall.yml](./examples/workflows/oncall.yml)

### Advanced Workflow with Slack

See [examples/workflows/oncall-advanced.yml](./examples/workflows/oncall-advanced.yml)

### PR Review Workflow

See [examples/workflows/oncall-pr-review.yml](./examples/workflows/oncall-pr-review.yml)

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build
```

## License

MIT
