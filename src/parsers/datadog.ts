import type { Alert, Parser, Severity } from '../types'

/**
 * Datadog webhook payload structure
 */
interface DatadogWebhook {
  id?: string
  event_id?: string
  title: string
  text?: string
  date?: number
  date_happened?: number
  priority?: 'normal' | 'low'
  alert_type?: 'error' | 'warning' | 'info' | 'success'
  tags?: string[]
  event_msg?: string
  snapshot_url?: string
  url?: string
  alert_query?: string
  alert_metric?: string
  org?: {
    id: number
    name: string
  }
}

/**
 * Parser for Datadog webhook payloads
 */
export class DatadogParser implements Parser {
  name = 'datadog' as const

  canParse(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) {
      return false
    }
    const p = payload as Record<string, unknown>
    // Datadog webhooks have title and typically date or date_happened
    return (
      'title' in p &&
      typeof p.title === 'string' &&
      ('date' in p || 'date_happened' in p || 'alert_type' in p)
    )
  }

  parse(payload: unknown): Alert {
    const webhook = payload as DatadogWebhook

    // Extract ID
    const id = webhook.id || webhook.event_id || String(Date.now())

    // Extract timestamp
    const timestamp = webhook.date || webhook.date_happened
    const isoTimestamp = timestamp
      ? new Date(timestamp * 1000).toISOString()
      : new Date().toISOString()

    // Extract stack trace from text if present (often in code blocks)
    const stackTrace = this.extractStackTrace(webhook.text || '')

    // Extract service from tags
    const service = this.extractTagValue(webhook.tags, 'service')

    // Map alert type to severity
    const severity = this.mapSeverity(webhook.alert_type, webhook.priority)

    // Build tags from Datadog tags array
    const tags = this.parseTags(webhook.tags)

    return {
      source: 'datadog',
      id,
      title: webhook.title,
      description: webhook.text || webhook.event_msg || webhook.title,
      severity,
      stackTrace,
      service,
      timestamp: isoTimestamp,
      url: webhook.url || webhook.snapshot_url,
      tags,
      raw: payload
    }
  }

  private extractStackTrace(text: string): string | undefined {
    // Look for code blocks that might contain stack traces
    const codeBlockMatch = text.match(/```[\s\S]*?```/g)
    if (codeBlockMatch) {
      const stackContent = codeBlockMatch[0].replace(/```/g, '').trim()
      // Check if it looks like a stack trace
      if (stackContent.includes(' at ') || stackContent.includes('Traceback')) {
        return stackContent
      }
    }

    // Look for inline stack trace patterns
    if (text.includes(' at ') && text.includes(':')) {
      const lines = text.split('\n')
      const stackLines = lines.filter(
        line => line.includes(' at ') || line.match(/^\s+at\s+/)
      )
      if (stackLines.length > 0) {
        return stackLines.join('\n')
      }
    }

    return undefined
  }

  private extractTagValue(tags: string[] | undefined, key: string): string | undefined {
    if (!tags) return undefined
    const tag = tags.find(t => t.startsWith(`${key}:`))
    return tag?.split(':')[1]
  }

  private mapSeverity(
    alertType: DatadogWebhook['alert_type'],
    priority: DatadogWebhook['priority']
  ): Severity {
    if (alertType === 'error') return 'critical'
    if (alertType === 'warning') return 'warning'
    if (priority === 'low') return 'info'
    return 'warning'
  }

  private parseTags(tags: string[] | undefined): Record<string, string> {
    if (!tags) return {}
    const result: Record<string, string> = {}
    for (const tag of tags) {
      const [key, ...valueParts] = tag.split(':')
      if (key) {
        result[key] = valueParts.join(':') || 'true'
      }
    }
    return result
  }
}
