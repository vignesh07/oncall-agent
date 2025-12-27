import { describe, it, expect } from 'vitest'
import { SentryParser } from '../../src/parsers/sentry'
import fixture from '../fixtures/sentry-event.json'

describe('SentryParser', () => {
  const parser = new SentryParser()

  describe('canParse', () => {
    it('should detect Sentry payloads', () => {
      expect(parser.canParse(fixture)).toBe(true)
    })

    it('should reject non-Sentry payloads', () => {
      expect(parser.canParse({ random: 'object' })).toBe(false)
      expect(parser.canParse({ data: 'not an object' })).toBe(false)
    })
  })

  describe('parse', () => {
    it('should parse alert correctly', () => {
      const alert = parser.parse(fixture)

      expect(alert.source).toBe('sentry')
      expect(alert.id).toBe('abc123def456')
      expect(alert.title).toBe("TypeError: Cannot read property 'id' of undefined")
      expect(alert.severity).toBe('critical')
    })

    it('should extract service from project', () => {
      const alert = parser.parse(fixture)
      expect(alert.service).toBe('Web Application')
    })

    it('should extract stack trace from exception', () => {
      const alert = parser.parse(fixture)
      expect(alert.stackTrace).toBeDefined()
      expect(alert.stackTrace).toContain('TypeError')
      expect(alert.stackTrace).toContain('getUserData')
    })

    it('should include Sentry-specific tags', () => {
      const alert = parser.parse(fixture)
      expect(alert.tags).toBeDefined()
      expect(alert.tags!.platform).toBe('javascript')
      expect(alert.tags!.project).toBe('web-app')
    })
  })
})
