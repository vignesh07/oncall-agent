# CloudWatch Alarms Setup

This guide explains how to configure AWS CloudWatch alarms to trigger oncall-agent.

## Architecture

```
CloudWatch Alarm → SNS Topic → Lambda Function → GitHub repository_dispatch
```

## Step 1: Create SNS Topic

```bash
aws sns create-topic --name oncall-agent-alerts
```

Note the TopicArn from the output.

## Step 2: Create Lambda Function

### Lambda Code (Python)

```python
import json
import urllib.request
import os

def lambda_handler(event, context):
    github_token = os.environ['GITHUB_TOKEN']
    github_owner = os.environ['GITHUB_OWNER']
    github_repo = os.environ['GITHUB_REPO']

    for record in event.get('Records', []):
        # SNS message
        sns_message = record.get('Sns', {})

        # Build payload for GitHub
        dispatch_payload = {
            'event_type': 'cloudwatch-alert',
            'client_payload': {
                'Type': 'Notification',
                'Message': sns_message.get('Message', '{}'),
                'Timestamp': sns_message.get('Timestamp', ''),
                'MessageId': sns_message.get('MessageId', ''),
                'TopicArn': sns_message.get('TopicArn', '')
            }
        }

        url = f'https://api.github.com/repos/{github_owner}/{github_repo}/dispatches'
        headers = {
            'Authorization': f'token {github_token}',
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'oncall-agent-lambda'
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(dispatch_payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )

        try:
            urllib.request.urlopen(req)
            print(f'Successfully forwarded alert: {sns_message.get("MessageId")}')
        except Exception as e:
            print(f'Error forwarding alert: {e}')
            raise

    return {'statusCode': 200, 'body': 'OK'}
```

### Deploy Lambda

```bash
# Create deployment package
zip function.zip lambda_function.py

# Create function
aws lambda create-function \
  --function-name oncall-agent-forwarder \
  --runtime python3.11 \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://function.zip \
  --environment "Variables={GITHUB_TOKEN=ghp_xxx,GITHUB_OWNER=your-org,GITHUB_REPO=your-repo}"
```

## Step 3: Subscribe Lambda to SNS

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:REGION:ACCOUNT:oncall-agent-alerts \
  --protocol lambda \
  --notification-endpoint arn:aws:lambda:REGION:ACCOUNT:function:oncall-agent-forwarder
```

## Step 4: Configure CloudWatch Alarms

Update your CloudWatch alarms to notify the SNS topic:

### Via Console

1. Go to **CloudWatch** → **Alarms**
2. Select an alarm → **Edit**
3. Under **Notification**, select your SNS topic
4. Save

### Via CLI

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "HighLatency-API" \
  --alarm-description "API latency exceeds 500ms" \
  --metric-name Latency \
  --namespace AWS/ApiGateway \
  --statistic Average \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 500 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:REGION:ACCOUNT:oncall-agent-alerts
```

## Step 5: Configure GitHub Workflow

```yaml
on:
  repository_dispatch:
    types: [cloudwatch-alert]
```

## Service Identification

oncall-agent extracts service names from CloudWatch dimensions:

- `ServiceName`
- `FunctionName` (Lambda)
- `TableName` (DynamoDB)
- `QueueName` (SQS)
- `ClusterName` (ECS/EKS)

Ensure your alarms include these dimensions for better alert routing.

## Testing

1. Manually set an alarm to ALARM state:
   ```bash
   aws cloudwatch set-alarm-state \
     --alarm-name "TestAlarm" \
     --state-value ALARM \
     --state-reason "Testing oncall-agent"
   ```
2. Verify the GitHub Action runs
