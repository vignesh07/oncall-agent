import type { Alert, Parser } from '../types'

/**
 * PagerDuty V3 webhook payload structure
 */
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
      custom_fields?: Record<string, unknown>
    }
  }
}

/**
 * Parser for PagerDuty webhook payloads
 */
export class PagerDutyParser implements Parser {
  name = 'pagerduty' as const

  canParse(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) {
      return false
    }
    const p = payload as Record<string, unknown>
    return (
      'event' in p &&
      typeof p.event === 'object' &&
      p.event !== null &&
      'data' in (p.event as Record<string, unknown>) &&
      typeof (p.event as Record<string, unknown>).data === 'object'
    )
  }

  parse(payload: unknown): Alert {
    const webhook = payload as PagerDutyWebhook
    const { event } = webhook
    const { data } = event

    // Extract error details from body
    const details = data.body?.details
    const errorMessage = details?.error_message
    const stackTrace = details?.stack_trace

    // Build description
    let description = data.title
    if (errorMessage && errorMessage !== data.title) {
      description = errorMessage
    }

    return {
      source: 'pagerduty',
      id: data.id,
      title: data.title,
      description,
      severity: data.urgency === 'high' ? 'critical' : 'warning',
      stackTrace: typeof stackTrace === 'string' ? stackTrace : undefined,
      service: data.service?.name,
      timestamp: data.created_at,
      url: data.html_url,
      tags: this.extractTags(data),
      raw: payload
    }
  }

  private extractTags(data: PagerDutyWebhook['event']['data']): Record<string, string> {
    const tags: Record<string, string> = {
      incident_number: String(data.number),
      service_id: data.service?.id || ''
    }

    // Add custom fields as tags
    if (data.custom_fields) {
      for (const [key, value] of Object.entries(data.custom_fields)) {
        if (typeof value === 'string' || typeof value === 'number') {
          tags[key] = String(value)
        }
      }
    }

    return tags
  }
}
