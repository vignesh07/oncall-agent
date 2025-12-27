import { describe, it, expect } from 'vitest'
import { PagerDutyParser } from '../../src/parsers/pagerduty'
import fixture from '../fixtures/pagerduty-alert.json'

describe('PagerDutyParser', () => {
  const parser = new PagerDutyParser()

  describe('canParse', () => {
    it('should detect PagerDuty payloads', () => {
      expect(parser.canParse(fixture)).toBe(true)
    })

    it('should reject non-PagerDuty payloads', () => {
      expect(parser.canParse({ random: 'object' })).toBe(false)
      expect(parser.canParse(null)).toBe(false)
      expect(parser.canParse('string')).toBe(false)
      expect(parser.canParse({ event: 'not an object' })).toBe(false)
    })
  })

  describe('parse', () => {
    it('should parse alert correctly', () => {
      const alert = parser.parse(fixture)

      expect(alert.source).toBe('pagerduty')
      expect(alert.id).toBe('P123ABC')
      expect(alert.title).toBe('High Error Rate on user-service')
      expect(alert.severity).toBe('critical')
      expect(alert.service).toBe('user-service')
      expect(alert.url).toBe('https://example.pagerduty.com/incidents/P123ABC')
    })

    it('should extract stack trace', () => {
      const alert = parser.parse(fixture)
      expect(alert.stackTrace).toContain('NullPointerException')
      expect(alert.stackTrace).toContain('UserController.java:42')
    })

    it('should extract error message as description', () => {
      const alert = parser.parse(fixture)
      expect(alert.description).toContain('NullPointerException')
    })

    it('should include custom fields in tags', () => {
      const alert = parser.parse(fixture)
      expect(alert.tags).toBeDefined()
      expect(alert.tags!.team).toBe('backend')
      expect(alert.tags!.incident_number).toBe('42')
    })

    it('should store raw payload', () => {
      const alert = parser.parse(fixture)
      expect(alert.raw).toEqual(fixture)
    })
  })
})
