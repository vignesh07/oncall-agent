import type { Alert, Parser, Severity } from '../types'

/**
 * Prometheus Alertmanager webhook payload structure
 */
interface PrometheusWebhook {
  version?: string
  groupKey?: string
  truncatedAlerts?: number
  status: 'firing' | 'resolved'
  receiver?: string
  groupLabels?: Record<string, string>
  commonLabels?: Record<string, string>
  commonAnnotations?: Record<string, string>
  externalURL?: string
  alerts: Array<{
    status: 'firing' | 'resolved'
    labels: Record<string, string>
    annotations?: Record<string, string>
    startsAt?: string
    endsAt?: string
    generatorURL?: string
    fingerprint?: string
  }>
}

/**
 * Parser for Prometheus Alertmanager webhook payloads
 */
export class PrometheusParser implements Parser {
  name = 'prometheus' as const

  canParse(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) {
      return false
    }
    const p = payload as Record<string, unknown>

    // Prometheus/Alertmanager webhooks have alerts array and status
    return (
      'alerts' in p &&
      Array.isArray(p.alerts) &&
      'status' in p &&
      (p.status === 'firing' || p.status === 'resolved')
    )
  }

  parse(payload: unknown): Alert {
    const webhook = payload as PrometheusWebhook

    // Get the first firing alert (or first alert if none firing)
    const alert = webhook.alerts.find(a => a.status === 'firing') || webhook.alerts[0]

    if (!alert) {
      throw new Error('Prometheus webhook contains no alerts')
    }

    // Get title from alertname label or summary annotation
    const title = this.getTitle(alert, webhook)

    // Get description from description/summary annotation
    const description = this.getDescription(alert, webhook)

    // Get severity from labels
    const severity = this.getSeverity(alert, webhook)

    // Get service from labels
    const service = this.getService(alert, webhook)

    // Get timestamp
    const timestamp = alert.startsAt || new Date().toISOString()

    // Get URL
    const url = alert.generatorURL || webhook.externalURL

    // Build tags from labels
    const tags = this.buildTags(alert, webhook)

    // Build ID from fingerprint or labels
    const id = alert.fingerprint || this.generateId(alert)

    return {
      source: 'prometheus',
      id,
      title,
      description,
      severity,
      service,
      timestamp,
      url,
      tags,
      raw: payload
    }
  }

  private getTitle(
    alert: PrometheusWebhook['alerts'][0],
    webhook: PrometheusWebhook
  ): string {
    // Try alertname label
    if (alert.labels.alertname) {
      return alert.labels.alertname
    }

    // Try common labels
    if (webhook.commonLabels?.alertname) {
      return webhook.commonLabels.alertname
    }

    // Try summary annotation
    if (alert.annotations?.summary) {
      return alert.annotations.summary
    }

    return 'Unknown Prometheus Alert'
  }

  private getDescription(
    alert: PrometheusWebhook['alerts'][0],
    webhook: PrometheusWebhook
  ): string {
    const parts: string[] = []

    // Add description annotation
    if (alert.annotations?.description) {
      parts.push(alert.annotations.description)
    } else if (webhook.commonAnnotations?.description) {
      parts.push(webhook.commonAnnotations.description)
    }

    // Add summary if different from description
    if (alert.annotations?.summary) {
      if (!parts.includes(alert.annotations.summary)) {
        parts.push(alert.annotations.summary)
      }
    }

    // Add message annotation if present
    if (alert.annotations?.message) {
      parts.push(alert.annotations.message)
    }

    // Fallback to title
    if (parts.length === 0) {
      parts.push(this.getTitle(alert, webhook))
    }

    return parts.join('\n\n')
  }

  private getSeverity(
    alert: PrometheusWebhook['alerts'][0],
    webhook: PrometheusWebhook
  ): Severity {
    const severityLabel =
      alert.labels.severity ||
      webhook.commonLabels?.severity ||
      ''

    switch (severityLabel.toLowerCase()) {
      case 'critical':
      case 'page':
      case 'pager':
        return 'critical'
      case 'warning':
      case 'warn':
        return 'warning'
      default:
        // If alert is firing, default to warning
        return alert.status === 'firing' ? 'warning' : 'info'
    }
  }

  private getService(
    alert: PrometheusWebhook['alerts'][0],
    webhook: PrometheusWebhook
  ): string | undefined {
    // Common service-identifying labels
    const serviceLabels = [
      'service',
      'job',
      'app',
      'application',
      'deployment',
      'container',
      'namespace'
    ]

    for (const label of serviceLabels) {
      if (alert.labels[label]) {
        return alert.labels[label]
      }
      if (webhook.commonLabels?.[label]) {
        return webhook.commonLabels[label]
      }
    }

    return undefined
  }

  private buildTags(
    alert: PrometheusWebhook['alerts'][0],
    webhook: PrometheusWebhook
  ): Record<string, string> {
    const tags: Record<string, string> = {
      ...alert.labels
    }

    // Add group labels
    if (webhook.groupLabels) {
      for (const [key, value] of Object.entries(webhook.groupLabels)) {
        tags[`group:${key}`] = value
      }
    }

    // Add status
    tags.status = alert.status

    // Add receiver
    if (webhook.receiver) {
      tags.receiver = webhook.receiver
    }

    return tags
  }

  private generateId(alert: PrometheusWebhook['alerts'][0]): string {
    // Generate ID from labels
    const labelString = Object.entries(alert.labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')
    return `prometheus-${labelString.substring(0, 64)}`
  }
}
