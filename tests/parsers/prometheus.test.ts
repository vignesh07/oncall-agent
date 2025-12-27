import { describe, it, expect } from 'vitest'
import { PrometheusParser } from '../../src/parsers/prometheus'
import fixture from '../fixtures/prometheus-alert.json'

describe('PrometheusParser', () => {
  const parser = new PrometheusParser()

  describe('canParse', () => {
    it('should detect Prometheus/Alertmanager payloads', () => {
      expect(parser.canParse(fixture)).toBe(true)
    })

    it('should reject non-Prometheus payloads', () => {
      expect(parser.canParse({ random: 'object' })).toBe(false)
      expect(parser.canParse({ status: 'firing' })).toBe(false) // missing alerts array
      expect(parser.canParse({ alerts: [], status: 'invalid' })).toBe(false)
    })
  })

  describe('parse', () => {
    it('should parse alert correctly', () => {
      const alert = parser.parse(fixture)

      expect(alert.source).toBe('prometheus')
      expect(alert.title).toBe('HighMemoryUsage')
      expect(alert.severity).toBe('warning')
    })

    it('should extract service from labels', () => {
      const alert = parser.parse(fixture)
      expect(alert.service).toBe('api-server')
    })

    it('should extract description from annotations', () => {
      const alert = parser.parse(fixture)
      expect(alert.description).toContain('Memory usage is above 80%')
    })

    it('should include all labels as tags', () => {
      const alert = parser.parse(fixture)
      expect(alert.tags).toBeDefined()
      expect(alert.tags!.namespace).toBe('production')
      expect(alert.tags!.pod).toBe('api-server-abc123')
      expect(alert.tags!.status).toBe('firing')
    })

    it('should include generator URL', () => {
      const alert = parser.parse(fixture)
      expect(alert.url).toContain('prometheus.example.com')
    })
  })
})
