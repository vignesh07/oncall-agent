import type { Alert, Parser, Severity } from '../types'

/**
 * SNS message wrapper for CloudWatch alarms
 */
interface SNSMessage {
  Type: string
  Message: string
  Timestamp: string
  MessageId?: string
  TopicArn?: string
}

/**
 * CloudWatch Alarm payload (inside SNS Message)
 */
interface CloudWatchAlarm {
  AlarmName: string
  AlarmDescription?: string
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA'
  NewStateReason: string
  OldStateValue?: string
  StateChangeTime?: string
  Region?: string
  AWSAccountId?: string
  Trigger: {
    MetricName: string
    Namespace: string
    Dimensions?: Array<{ name: string; value: string }>
    Statistic?: string
    Period?: number
    EvaluationPeriods?: number
    Threshold?: number
  }
}

/**
 * Parser for CloudWatch alarms delivered via SNS
 */
export class CloudWatchParser implements Parser {
  name = 'cloudwatch' as const

  canParse(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) {
      return false
    }
    const p = payload as Record<string, unknown>

    // Check for SNS wrapper with CloudWatch alarm inside
    if ('Type' in p && 'Message' in p && typeof p.Message === 'string') {
      try {
        const message = JSON.parse(p.Message as string)
        return 'AlarmName' in message && 'NewStateValue' in message
      } catch {
        return false
      }
    }

    // Direct CloudWatch alarm (without SNS wrapper)
    return 'AlarmName' in p && 'NewStateValue' in p
  }

  parse(payload: unknown): Alert {
    const p = payload as Record<string, unknown>
    let alarm: CloudWatchAlarm
    let snsTimestamp: string | undefined

    // Handle SNS wrapper
    if ('Type' in p && 'Message' in p) {
      const sns = payload as SNSMessage
      alarm = JSON.parse(sns.Message) as CloudWatchAlarm
      snsTimestamp = sns.Timestamp
    } else {
      alarm = payload as unknown as CloudWatchAlarm
    }

    // Extract service from dimensions
    const service = this.extractService(alarm.Trigger.Dimensions)

    // Determine severity from state
    const severity = this.mapSeverity(alarm.NewStateValue)

    // Build description
    const description = alarm.AlarmDescription || alarm.NewStateReason

    // Determine timestamp
    const timestamp =
      alarm.StateChangeTime ||
      snsTimestamp ||
      new Date().toISOString()

    // Build tags from trigger info
    const tags: Record<string, string> = {
      metric: alarm.Trigger.MetricName,
      namespace: alarm.Trigger.Namespace
    }
    if (alarm.Region) {
      tags.region = alarm.Region
    }
    if (alarm.AWSAccountId) {
      tags.account = alarm.AWSAccountId
    }
    if (alarm.Trigger.Dimensions) {
      for (const dim of alarm.Trigger.Dimensions) {
        tags[`dimension:${dim.name}`] = dim.value
      }
    }

    return {
      source: 'cloudwatch',
      id: alarm.AlarmName,
      title: alarm.AlarmName,
      description,
      severity,
      service,
      timestamp,
      tags,
      raw: payload
    }
  }

  private extractService(
    dimensions: CloudWatchAlarm['Trigger']['Dimensions']
  ): string | undefined {
    if (!dimensions) return undefined

    // Common service-identifying dimension names
    const serviceKeys = [
      'ServiceName',
      'FunctionName',
      'TableName',
      'QueueName',
      'ClusterName',
      'DBInstanceIdentifier',
      'LoadBalancerName',
      'TargetGroup',
      'AutoScalingGroupName'
    ]

    for (const key of serviceKeys) {
      const dim = dimensions.find(d => d.name === key)
      if (dim) return dim.value
    }

    return undefined
  }

  private mapSeverity(state: CloudWatchAlarm['NewStateValue']): Severity {
    switch (state) {
      case 'ALARM':
        return 'critical'
      case 'INSUFFICIENT_DATA':
        return 'warning'
      default:
        return 'info'
    }
  }
}
