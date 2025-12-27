import { describe, it, expect } from 'vitest'
import { meetsConfidenceThreshold } from '../src/claude'

describe('Claude integration', () => {
  describe('meetsConfidenceThreshold', () => {
    it('should pass when confidence equals threshold', () => {
      expect(meetsConfidenceThreshold('high', 'high')).toBe(true)
      expect(meetsConfidenceThreshold('medium', 'medium')).toBe(true)
      expect(meetsConfidenceThreshold('low', 'low')).toBe(true)
    })

    it('should pass when confidence exceeds threshold', () => {
      expect(meetsConfidenceThreshold('high', 'medium')).toBe(true)
      expect(meetsConfidenceThreshold('high', 'low')).toBe(true)
      expect(meetsConfidenceThreshold('medium', 'low')).toBe(true)
    })

    it('should fail when confidence is below threshold', () => {
      expect(meetsConfidenceThreshold('low', 'medium')).toBe(false)
      expect(meetsConfidenceThreshold('low', 'high')).toBe(false)
      expect(meetsConfidenceThreshold('medium', 'high')).toBe(false)
    })
  })
})
