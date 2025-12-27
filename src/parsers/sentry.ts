import type { Alert, Parser, Severity } from '../types'

/**
 * Sentry webhook payload structure
 */
interface SentryWebhook {
  action?: string
  data: {
    event?: {
      event_id: string
      title?: string
      message?: string
      level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
      platform?: string
      timestamp?: number
      tags?: Array<{ key: string; value: string }>
      exception?: {
        values?: Array<{
          type: string
          value: string
          stacktrace?: {
            frames?: Array<{
              filename?: string
              function?: string
              lineno?: number
              context_line?: string
            }>
          }
        }>
      }
    }
    issue?: {
      id: string
      title: string
      shortId: string
      project?: {
        slug: string
        name: string
      }
    }
  }
  installation?: {
    uuid: string
  }
  actor?: {
    type: string
    name: string
  }
}

/**
 * Parser for Sentry webhook payloads
 */
export class SentryParser implements Parser {
  name = 'sentry' as const

  canParse(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) {
      return false
    }
    const p = payload as Record<string, unknown>

    // Sentry webhooks have a data object with event or issue
    if ('data' in p && typeof p.data === 'object' && p.data !== null) {
      const data = p.data as Record<string, unknown>
      return 'event' in data || 'issue' in data
    }

    return false
  }

  parse(payload: unknown): Alert {
    const webhook = payload as SentryWebhook
    const { data } = webhook
    const event = data.event
    const issue = data.issue

    // Get ID
    const id = event?.event_id || issue?.id || String(Date.now())

    // Get title
    const title = event?.title || issue?.title || 'Unknown Sentry Error'

    // Get description
    const description = this.buildDescription(event, issue)

    // Get severity
    const severity = this.mapSeverity(event?.level)

    // Get stack trace
    const stackTrace = this.extractStackTrace(event)

    // Get service (project name)
    const service = issue?.project?.name || issue?.project?.slug

    // Get timestamp
    const timestamp = event?.timestamp
      ? new Date(event.timestamp * 1000).toISOString()
      : new Date().toISOString()

    // Get URL
    const url = issue?.shortId
      ? `https://sentry.io/issues/${issue.id}/`
      : undefined

    // Build tags
    const tags = this.extractTags(event, issue)

    return {
      source: 'sentry',
      id,
      title,
      description,
      severity,
      stackTrace,
      service,
      timestamp,
      url,
      tags,
      raw: payload
    }
  }

  private buildDescription(
    event: SentryWebhook['data']['event'],
    issue: SentryWebhook['data']['issue']
  ): string {
    const parts: string[] = []

    if (event?.message) {
      parts.push(event.message)
    }

    if (event?.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.type && exc.value) {
          parts.push(`${exc.type}: ${exc.value}`)
        }
      }
    }

    if (parts.length === 0 && issue?.title) {
      parts.push(issue.title)
    }

    return parts.join('\n\n') || 'No description available'
  }

  private extractStackTrace(event: SentryWebhook['data']['event']): string | undefined {
    if (!event?.exception?.values) return undefined

    const lines: string[] = []
    for (const exc of event.exception.values) {
      if (exc.type && exc.value) {
        lines.push(`${exc.type}: ${exc.value}`)
      }
      if (exc.stacktrace?.frames) {
        // Frames are in reverse order (most recent last)
        const frames = [...exc.stacktrace.frames].reverse()
        for (const frame of frames.slice(0, 20)) { // Limit to 20 frames
          const location = [frame.filename, frame.lineno]
            .filter(Boolean)
            .join(':')
          const fn = frame.function || '<anonymous>'
          lines.push(`    at ${fn} (${location})`)
        }
      }
    }

    return lines.length > 0 ? lines.join('\n') : undefined
  }

  private mapSeverity(level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' | undefined): Severity {
    switch (level) {
      case 'fatal':
      case 'error':
        return 'critical'
      case 'warning':
        return 'warning'
      default:
        return 'info'
    }
  }

  private extractTags(
    event: SentryWebhook['data']['event'],
    issue: SentryWebhook['data']['issue']
  ): Record<string, string> {
    const tags: Record<string, string> = {}

    if (event?.platform) {
      tags.platform = event.platform
    }

    if (event?.tags) {
      for (const tag of event.tags) {
        tags[tag.key] = tag.value
      }
    }

    if (issue?.shortId) {
      tags.issue_id = issue.shortId
    }

    if (issue?.project?.slug) {
      tags.project = issue.project.slug
    }

    return tags
  }
}
