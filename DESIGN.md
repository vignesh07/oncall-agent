# oncall-agent Design Document

## Overview

**oncall-agent** is a GitHub Action that receives production alerts from monitoring systems (PagerDuty, Datadog, CloudWatch, Sentry, Opsgenie, Prometheus) and uses Claude Code to investigate and potentially fix issues automatically.

## Problem Statement

When a production alert fires:
1. On-call engineer gets paged
2. They have to context-switch, understand the alert
3. Investigate the codebase to find the issue
4. Either fix it or escalate

This process is time-consuming, especially for routine issues that have clear fixes (null checks, config tweaks, timeout adjustments).

## Solution

Automate the initial investigation and fix attempt:
1. Alert triggers a GitHub Action via webhook
2. Action parses the alert, creates a tracking issue
3. Claude Code investigates the codebase
4. Either creates a PR with a fix, or leaves detailed analysis
5. Human reviews and merges (never auto-merge)

## Architecture

```
┌─────────────────┐     ┌────────────────┐     ┌──────────────────────┐
│  Alert Source   │────▶│   Middleware   │────▶│  GitHub repository_  │
│  (PagerDuty,    │     │   (optional)   │     │  dispatch event      │
│   Datadog, etc) │     └────────────────┘     └──────────┬───────────┘
└─────────────────┘                                       │
                                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        oncall-agent Action                           │
├─────────────────────────────────────────────────────────────────────┤
│  1. Parse Alert                                                      │
│     └─▶ Detect source → Use appropriate parser → Normalize to Alert │
│                                                                      │
│  2. Check Duplicates                                                 │
│     └─▶ Similarity match against recent issues → Skip if duplicate  │
│                                                                      │
│  3. Create Tracking Issue                                            │
│     └─▶ GitHub issue with alert details, labels, links              │
│                                                                      │
│  4. Build Prompt                                                     │
│     └─▶ Alert context + repo context + runbook content              │
│                                                                      │
│  5. Invoke Claude                                                    │
│     └─▶ anthropics/claude-code-action with constructed prompt       │
│                                                                      │
│  6. Handle Result                                                    │
│     ├─▶ If fix found: Create PR linked to issue                     │
│     └─▶ If no fix: Comment analysis on issue                        │
│                                                                      │
│  7. Update Source System                                             │
│     └─▶ Add note to PagerDuty incident with results                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Wrapper Around anthropics/claude-code-action

**Decision:** Use the official Claude Code Action as our execution engine.

**Rationale:**
- Anthropic maintains the Claude invocation logic
- We get updates, security fixes, and improvements for free
- Our code focuses on the alert-specific value-add
- Reduces maintenance burden

**Trade-offs:**
- Dependency on external action
- Less control over Claude execution details

### 2. Never Auto-Merge

**Decision:** PRs always require human review and approval.

**Rationale:**
- AI fixes can be subtly wrong
- Production code changes need human accountability
- Builds trust in the system over time
- Aligns with existing code review practices

**Implementation:**
- PRs are created in draft mode
- Clear labeling as AI-generated
- Confidence level displayed prominently

### 3. Similarity-Based Deduplication

**Decision:** Use Jaccard similarity on alert titles + optional stack trace comparison.

**Rationale:**
- Prevents alert storms from creating dozens of duplicate issues
- Links related alerts together
- Configurable threshold for different use cases

**Algorithm:**
```typescript
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/))
  const setB = new Set(b.toLowerCase().split(/\s+/))
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}
```

### 4. Extensible Parser System

**Decision:** Plugin-based parser architecture with auto-detection.

**Rationale:**
- Different organizations use different alerting tools
- Easy to add new sources without modifying core code
- Users can implement custom parsers for internal tools

**Interface:**
```typescript
interface Parser {
  name: AlertSource
  canParse(payload: unknown): boolean
  parse(payload: unknown): Alert
}
```

## Data Types

### Alert (Normalized)

```typescript
interface Alert {
  source: AlertSource
  id: string                    // Unique ID from source
  title: string                 // Human-readable title
  description: string           // Detailed description
  severity: 'critical' | 'warning' | 'info'
  stackTrace?: string           // If available
  service?: string              // Affected service name
  timestamp: string             // ISO 8601
  url?: string                  // Link to alert in source
  tags?: Record<string, string> // Additional metadata
  raw: unknown                  // Original payload
}

type AlertSource =
  | 'pagerduty'
  | 'datadog'
  | 'cloudwatch'
  | 'sentry'
  | 'opsgenie'
  | 'prometheus'
  | 'generic'
```

### ActionResult

```typescript
interface ActionResult {
  actionTaken: 'pr_created' | 'analysis_only' | 'duplicate' | 'error'
  issueNumber?: number
  prNumber?: number
  duplicateOf?: number
  analysis: string
  confidence: 'high' | 'medium' | 'low'
  error?: string
}
```

## Configuration

Users can customize behavior via `.oncall-agent/config.yml`:

```yaml
# Services this repo handles
services:
  - user-service
  - auth-service

# Protected paths (never auto-modify)
protected_paths:
  - src/core/security/**
  - migrations/**

# Additional context for prompts
context: |
  This is a Node.js monorepo using TypeScript.
  Feature flags are in src/config/flags.ts.

# Runbook mappings
runbooks:
  high-memory: docs/runbooks/high-memory.md
  database-connection: docs/runbooks/db-connections.md

# Deduplication settings
deduplication:
  enabled: true
  similarity_threshold: 0.7
  lookback_hours: 24
```

## Security Considerations

### Threat Model

1. **Malicious Alert Payload**
   - Mitigation: Strict payload validation, no eval/exec on payload data

2. **AI Introducing Vulnerabilities**
   - Mitigation: Never auto-merge, require CI checks, protected paths

3. **API Key Exposure**
   - Mitigation: All keys in GitHub Secrets, never logged

4. **Excessive Costs**
   - Mitigation: Rate limiting, timeout settings, configurable per-repo

### Protected Paths

Paths in `protected_paths` config are:
- Never modified by Claude
- Flagged if changes are suggested
- Require explicit human acknowledgment

## Testing Strategy

### Unit Tests
- Parser tests with real webhook fixtures
- Similarity algorithm edge cases
- Prompt building with various inputs
- Config loading and validation

### Integration Tests
- Full flow with mocked GitHub API
- Mocked Claude responses
- Error handling scenarios

### End-to-End Tests
- Real alerts in sandbox repository
- Verify issue/PR creation
- Verify PagerDuty updates

## Metrics & Observability

### Success Metrics
- Time from alert to PR/analysis
- Fix success rate (merged PRs that resolve alerts)
- Duplicate detection accuracy

### Logs & Outputs
- GitHub Action logs
- Structured outputs for automation
- PagerDuty incident notes

## Rollout Plan

### Phase 1: Internal Testing
- Deploy to internal repositories
- Low-severity alerts only
- Gather feedback

### Phase 2: Beta Release
- Public release with clear "beta" labeling
- Comprehensive documentation
- Community feedback collection

### Phase 3: General Availability
- Stable API
- SLA commitments
- Premium features (if applicable)

## Future Enhancements

1. **Learning from Past Fixes**
   - Store successful fix patterns
   - Reference in future prompts

2. **Multi-Repo Support**
   - Single alert triggers investigation across repos

3. **Slack/Discord Integration**
   - Real-time notifications
   - Interactive commands

4. **Metrics Dashboard**
   - Track fix rates
   - Cost monitoring
   - Performance trends

## References

- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PagerDuty Webhooks](https://developer.pagerduty.com/docs/webhooks/v3-overview/)
- [Datadog Webhooks](https://docs.datadoghq.com/integrations/webhooks/)
