import type { Alert, Parser, Severity } from '../types'

/**
 * Opsgenie webhook payload structure
 */
interface OpsgenieWebhook {
  action?: string
  alert?: {
    alertId: string
    message: string
    description?: string
    priority?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
    source?: string
    tags?: string[]
    details?: Record<string, string>
    createdAt?: number
    tinyId?: string
  }
  source?: {
    name: string
    type: string
  }
  integrationId?: string
  integrationName?: string
}

/**
 * Parser for Opsgenie webhook payloads
 */
export class OpsgenieParser implements Parser {
  name = 'opsgenie' as const

  canParse(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) {
      return false
    }
    const p = payload as Record<string, unknown>

    // Opsgenie webhooks have an alert object with alertId
    if ('alert' in p && typeof p.alert === 'object' && p.alert !== null) {
      const alert = p.alert as Record<string, unknown>
      return 'alertId' in alert && 'message' in alert
    }

    return false
  }

  parse(payload: unknown): Alert {
    const webhook = payload as OpsgenieWebhook
    const { alert } = webhook

    if (!alert) {
      throw new Error('Opsgenie webhook missing alert object')
    }

    // Map priority to severity
    const severity = this.mapSeverity(alert.priority)

    // Get timestamp
    const timestamp = alert.createdAt
      ? new Date(alert.createdAt).toISOString()
      : new Date().toISOString()

    // Build URL
    const url = alert.tinyId
      ? `https://app.opsgenie.com/alert/detail/${alert.alertId}/details`
      : undefined

    // Extract stack trace from details if present
    const stackTrace = this.extractStackTrace(alert.details, alert.description)

    // Get service from source or tags
    const service = this.extractService(webhook, alert.tags)

    // Build tags
    const tags = this.buildTags(alert, webhook)

    return {
      source: 'opsgenie',
      id: alert.alertId,
      title: alert.message,
      description: alert.description || alert.message,
      severity,
      stackTrace,
      service,
      timestamp,
      url,
      tags,
      raw: payload
    }
  }

  private mapSeverity(priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | undefined): Severity {
    switch (priority) {
      case 'P1':
      case 'P2':
        return 'critical'
      case 'P3':
        return 'warning'
      default:
        return 'info'
    }
  }

  private extractStackTrace(
    details: Record<string, string> | undefined,
    description: string | undefined
  ): string | undefined {
    // Check details for stack trace
    if (details) {
      for (const key of ['stackTrace', 'stack_trace', 'stack', 'backtrace']) {
        if (details[key]) {
          return details[key]
        }
      }
    }

    // Check description for stack trace patterns
    if (description) {
      if (description.includes(' at ') && description.includes(':')) {
        const lines = description.split('\n')
        const stackLines = lines.filter(
          line => line.includes(' at ') || line.match(/^\s+at\s+/)
        )
        if (stackLines.length > 2) {
          return stackLines.join('\n')
        }
      }
    }

    return undefined
  }

  private extractService(
    webhook: OpsgenieWebhook,
    tags: string[] | undefined
  ): string | undefined {
    // Try source name
    if (webhook.source?.name) {
      return webhook.source.name
    }

    // Try integration name
    if (webhook.integrationName) {
      return webhook.integrationName
    }

    // Try service tag
    if (tags) {
      const serviceTag = tags.find(
        t => t.toLowerCase().startsWith('service:')
      )
      if (serviceTag) {
        return serviceTag.split(':')[1]
      }
    }

    return undefined
  }

  private buildTags(
    alert: NonNullable<OpsgenieWebhook['alert']>,
    webhook: OpsgenieWebhook
  ): Record<string, string> {
    const tags: Record<string, string> = {}

    // Add priority
    if (alert.priority) {
      tags.priority = alert.priority
    }

    // Add source
    if (alert.source) {
      tags.alert_source = alert.source
    }

    // Add tiny ID
    if (alert.tinyId) {
      tags.tiny_id = alert.tinyId
    }

    // Add integration
    if (webhook.integrationName) {
      tags.integration = webhook.integrationName
    }

    // Add action
    if (webhook.action) {
      tags.action = webhook.action
    }

    // Add custom tags
    if (alert.tags) {
      for (const tag of alert.tags) {
        if (tag.includes(':')) {
          const [key, ...value] = tag.split(':')
          tags[key] = value.join(':')
        } else {
          tags[tag] = 'true'
        }
      }
    }

    // Add details
    if (alert.details) {
      for (const [key, value] of Object.entries(alert.details)) {
        if (!['stackTrace', 'stack_trace', 'stack', 'backtrace'].includes(key)) {
          tags[`detail:${key}`] = value
        }
      }
    }

    return tags
  }
}
