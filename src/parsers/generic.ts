import type { Alert, Parser, Severity } from '../types'

/**
 * Generic fallback parser for unknown alert formats
 * Attempts to extract common fields from any JSON payload
 */
export class GenericParser implements Parser {
  name = 'generic' as const

  canParse(_payload: unknown): boolean {
    // Generic parser accepts anything
    return true
  }

  parse(payload: unknown): Alert {
    if (typeof payload !== 'object' || payload === null) {
      return {
        source: 'generic',
        id: String(Date.now()),
        title: 'Unknown Alert',
        description: String(payload),
        severity: 'warning',
        timestamp: new Date().toISOString(),
        raw: payload
      }
    }

    const p = payload as Record<string, unknown>

    return {
      source: 'generic',
      id: this.extractId(p),
      title: this.extractTitle(p),
      description: this.extractDescription(p),
      severity: this.extractSeverity(p),
      stackTrace: this.extractStackTrace(p),
      service: this.extractService(p),
      timestamp: this.extractTimestamp(p),
      url: this.extractUrl(p),
      tags: this.extractTags(p),
      raw: payload
    }
  }

  private extractId(p: Record<string, unknown>): string {
    const idFields = ['id', 'incident_id', 'alert_id', 'event_id', 'uuid', 'key']
    for (const field of idFields) {
      if (p[field] !== undefined && p[field] !== null) {
        return String(p[field])
      }
    }
    return String(Date.now())
  }

  private extractTitle(p: Record<string, unknown>): string {
    const titleFields = ['title', 'summary', 'subject', 'name', 'message', 'alert']
    for (const field of titleFields) {
      if (typeof p[field] === 'string' && p[field]) {
        return p[field] as string
      }
    }
    return 'Unknown Alert'
  }

  private extractDescription(p: Record<string, unknown>): string {
    const descFields = ['description', 'message', 'body', 'text', 'content', 'details']
    for (const field of descFields) {
      if (typeof p[field] === 'string' && p[field]) {
        return p[field] as string
      }
      // Handle nested description object
      if (typeof p[field] === 'object' && p[field] !== null) {
        const nested = p[field] as Record<string, unknown>
        if (typeof nested.message === 'string') {
          return nested.message
        }
        if (typeof nested.text === 'string') {
          return nested.text
        }
      }
    }
    // Fallback to title
    return this.extractTitle(p)
  }

  private extractSeverity(p: Record<string, unknown>): Severity {
    const sevFields = ['severity', 'priority', 'urgency', 'level', 'status']
    for (const field of sevFields) {
      if (typeof p[field] === 'string') {
        const sev = (p[field] as string).toLowerCase()
        if (['critical', 'high', 'p1', 'emergency', 'fatal', 'error'].includes(sev)) {
          return 'critical'
        }
        if (['warning', 'medium', 'p2', 'warn'].includes(sev)) {
          return 'warning'
        }
        if (['info', 'low', 'p3', 'p4', 'p5', 'debug'].includes(sev)) {
          return 'info'
        }
      }
    }
    return 'warning' // Default to warning for unknown
  }

  private extractStackTrace(p: Record<string, unknown>): string | undefined {
    // Direct stack trace fields
    const stackFields = ['stack_trace', 'stackTrace', 'stack', 'backtrace', 'traceback']
    for (const field of stackFields) {
      if (typeof p[field] === 'string') {
        return p[field] as string
      }
    }

    // Check nested objects
    for (const key of ['details', 'data', 'error', 'exception']) {
      if (typeof p[key] === 'object' && p[key] !== null) {
        const nested = this.extractStackTrace(p[key] as Record<string, unknown>)
        if (nested) return nested
      }
    }

    // Look for stack-like patterns in description
    const desc = this.extractDescription(p)
    if (desc.includes(' at ') && (desc.includes(':') || desc.includes('('))) {
      // Looks like it might contain a stack trace
      const lines = desc.split('\n')
      const stackLines = lines.filter(
        line => line.includes(' at ') || line.match(/^\s+at\s+/) || line.match(/File ".*", line \d+/)
      )
      if (stackLines.length >= 2) {
        return stackLines.join('\n')
      }
    }

    return undefined
  }

  private extractService(p: Record<string, unknown>): string | undefined {
    const serviceFields = ['service', 'service_name', 'serviceName', 'app', 'application', 'component']
    for (const field of serviceFields) {
      if (typeof p[field] === 'string' && p[field]) {
        return p[field] as string
      }
    }

    // Check nested service object
    if (typeof p.service === 'object' && p.service !== null) {
      const service = p.service as Record<string, unknown>
      if (typeof service.name === 'string') {
        return service.name
      }
    }

    return undefined
  }

  private extractTimestamp(p: Record<string, unknown>): string {
    const timeFields = ['timestamp', 'created_at', 'createdAt', 'time', 'date', 'occurred_at']
    for (const field of timeFields) {
      const value = p[field]
      if (typeof value === 'string') {
        // Try to parse as date
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
        return value
      }
      if (typeof value === 'number') {
        // Unix timestamp (seconds or milliseconds)
        const ms = value > 9999999999 ? value : value * 1000
        return new Date(ms).toISOString()
      }
    }
    return new Date().toISOString()
  }

  private extractUrl(p: Record<string, unknown>): string | undefined {
    const urlFields = ['url', 'link', 'href', 'html_url', 'web_url', 'incident_url']
    for (const field of urlFields) {
      if (typeof p[field] === 'string' && p[field]) {
        return p[field] as string
      }
    }
    return undefined
  }

  private extractTags(p: Record<string, unknown>): Record<string, string> {
    const tags: Record<string, string> = {}

    // Check for tags/labels fields
    if (typeof p.tags === 'object' && p.tags !== null) {
      if (Array.isArray(p.tags)) {
        // Array of tags (e.g., ["env:prod", "team:backend"])
        for (const tag of p.tags) {
          if (typeof tag === 'string') {
            if (tag.includes(':')) {
              const [key, ...value] = tag.split(':')
              tags[key] = value.join(':')
            } else {
              tags[tag] = 'true'
            }
          }
        }
      } else {
        // Object of tags
        for (const [key, value] of Object.entries(p.tags as Record<string, unknown>)) {
          if (typeof value === 'string' || typeof value === 'number') {
            tags[key] = String(value)
          }
        }
      }
    }

    if (typeof p.labels === 'object' && p.labels !== null && !Array.isArray(p.labels)) {
      for (const [key, value] of Object.entries(p.labels as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'number') {
          tags[key] = String(value)
        }
      }
    }

    return tags
  }
}
