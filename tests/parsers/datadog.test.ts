import { describe, it, expect } from 'vitest'
import { DatadogParser } from '../../src/parsers/datadog'
import fixture from '../fixtures/datadog-alert.json'

describe('DatadogParser', () => {
  const parser = new DatadogParser()

  describe('canParse', () => {
    it('should detect Datadog payloads', () => {
      expect(parser.canParse(fixture)).toBe(true)
    })

    it('should reject non-Datadog payloads', () => {
      expect(parser.canParse({ random: 'object' })).toBe(false)
      expect(parser.canParse({ title: 'no date field' })).toBe(false)
    })
  })

  describe('parse', () => {
    it('should parse alert correctly', () => {
      const alert = parser.parse(fixture)

      expect(alert.source).toBe('datadog')
      expect(alert.id).toBe('evt-12345')
      expect(alert.title).toBe('High CPU Usage on web-server-01')
      expect(alert.severity).toBe('warning')
    })

    it('should extract service from tags', () => {
      const alert = parser.parse(fixture)
      expect(alert.service).toBe('web-frontend')
    })

    it('should convert unix timestamp to ISO', () => {
      const alert = parser.parse(fixture)
      expect(alert.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should parse tags correctly', () => {
      const alert = parser.parse(fixture)
      expect(alert.tags).toBeDefined()
      expect(alert.tags!.env).toBe('production')
      expect(alert.tags!.team).toBe('platform')
    })
  })
})
