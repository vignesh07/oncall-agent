import { describe, it, expect } from 'vitest'
import { jaccardSimilarity, calculateSimilarity } from '../src/dedup'
import type { Alert } from '../src/types'

describe('Deduplication', () => {
  describe('jaccardSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(jaccardSimilarity('hello world', 'hello world')).toBe(1)
    })

    it('should return 0 for completely different strings', () => {
      expect(jaccardSimilarity('hello world', 'foo bar baz')).toBe(0)
    })

    it('should handle partial overlap', () => {
      const similarity = jaccardSimilarity(
        'High error rate on user-service',
        'High error rate on auth-service'
      )
      expect(similarity).toBeGreaterThan(0.5)
      expect(similarity).toBeLessThan(1)
    })

    it('should be case insensitive', () => {
      expect(jaccardSimilarity('Hello World', 'hello world')).toBe(1)
    })

    it('should ignore punctuation', () => {
      expect(jaccardSimilarity('hello, world!', 'hello world')).toBe(1)
    })

    it('should handle empty strings', () => {
      expect(jaccardSimilarity('', '')).toBe(0)
      expect(jaccardSimilarity('hello', '')).toBe(0)
    })
  })

  describe('calculateSimilarity', () => {
    const baseAlert: Alert = {
      source: 'pagerduty',
      id: 'test-1',
      title: 'High Error Rate on user-service',
      description: 'Error rate exceeded 5% threshold',
      severity: 'critical',
      timestamp: '2024-01-15T10:00:00Z',
      raw: {}
    }

    it('should return high similarity for matching titles', () => {
      const issue = {
        title: '[pagerduty] High Error Rate on user-service',
        body: 'Error rate exceeded 5% threshold on user-service'
      }
      const similarity = calculateSimilarity(baseAlert, issue)
      // Title + body combined should give reasonable similarity
      expect(similarity).toBeGreaterThan(0.4)
    })

    it('should return low similarity for different alerts', () => {
      const issue = {
        title: 'Database connection timeout',
        body: 'Connection pool exhausted'
      }
      const similarity = calculateSimilarity(baseAlert, issue)
      expect(similarity).toBeLessThan(0.3)
    })

    it('should consider stack trace when present', () => {
      const alertWithStack: Alert = {
        ...baseAlert,
        stackTrace: 'at UserController.getUser(UserController.java:42)'
      }
      const issue = {
        title: 'Error on user-service',
        body: '```\nat UserController.getUser(UserController.java:42)\n```'
      }
      const similarity = calculateSimilarity(alertWithStack, issue)
      expect(similarity).toBeGreaterThan(0.5)
    })

    it('should handle null body', () => {
      const issue = {
        title: 'High Error Rate on user-service',
        body: null
      }
      const similarity = calculateSimilarity(baseAlert, issue)
      expect(similarity).toBeGreaterThan(0)
    })
  })
})
