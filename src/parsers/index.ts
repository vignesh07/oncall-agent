import type { Alert, AlertSource, Parser } from '../types'
import { PagerDutyParser } from './pagerduty'
import { DatadogParser } from './datadog'
import { CloudWatchParser } from './cloudwatch'
import { SentryParser } from './sentry'
import { OpsgenieParser } from './opsgenie'
import { PrometheusParser } from './prometheus'
import { GenericParser } from './generic'

/**
 * Registry of all available parsers
 */
const parsers: Parser[] = [
  new PagerDutyParser(),
  new DatadogParser(),
  new CloudWatchParser(),
  new SentryParser(),
  new OpsgenieParser(),
  new PrometheusParser(),
  new GenericParser() // Fallback, must be last
]

/**
 * Get parser by source name
 */
export function getParser(source: AlertSource): Parser | undefined {
  return parsers.find(p => p.name === source)
}

/**
 * Auto-detect parser from payload
 */
export function detectParser(payload: unknown): Parser {
  for (const parser of parsers) {
    if (parser.canParse(payload)) {
      return parser
    }
  }
  // Generic parser is always last and always returns true
  return parsers[parsers.length - 1]
}

/**
 * Parse alert payload using specified or auto-detected parser
 */
export function parseAlert(payload: unknown, source: string = 'auto'): Alert {
  let parser: Parser

  if (source === 'auto') {
    parser = detectParser(payload)
  } else {
    const specificParser = getParser(source as AlertSource)
    if (!specificParser) {
      throw new Error(`Unknown alert source: ${source}`)
    }
    if (!specificParser.canParse(payload)) {
      throw new Error(`Parser ${source} cannot parse the given payload`)
    }
    parser = specificParser
  }

  return parser.parse(payload)
}

export { parsers }
