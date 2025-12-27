import { describe, it, expect } from 'vitest'
import { CloudWatchParser } from '../../src/parsers/cloudwatch'
import fixture from '../fixtures/cloudwatch-alert.json'

describe('CloudWatchParser', () => {
  const parser = new CloudWatchParser()

  describe('canParse', () => {
    it('should detect CloudWatch/SNS payloads', () => {
      expect(parser.canParse(fixture)).toBe(true)
    })

    it('should reject non-CloudWatch payloads', () => {
      expect(parser.canParse({ random: 'object' })).toBe(false)
      expect(parser.canParse({ Type: 'Notification', Message: 'not json' })).toBe(false)
    })

    it('should handle direct CloudWatch alarm without SNS wrapper', () => {
      const directAlarm = {
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test',
        Trigger: { MetricName: 'Test', Namespace: 'Test' }
      }
      expect(parser.canParse(directAlarm)).toBe(true)
    })
  })

  describe('parse', () => {
    it('should parse alert correctly', () => {
      const alert = parser.parse(fixture)

      expect(alert.source).toBe('cloudwatch')
      expect(alert.id).toBe('HighLatency-API')
      expect(alert.title).toBe('HighLatency-API')
      expect(alert.severity).toBe('critical')
    })

    it('should extract description from alarm', () => {
      const alert = parser.parse(fixture)
      expect(alert.description).toBe('API latency exceeds 500ms')
    })

    it('should include metric info in tags', () => {
      const alert = parser.parse(fixture)
      expect(alert.tags).toBeDefined()
      expect(alert.tags!.metric).toBe('Latency')
      expect(alert.tags!.namespace).toBe('AWS/ApiGateway')
      expect(alert.tags!.region).toBe('us-east-1')
    })
  })
})
