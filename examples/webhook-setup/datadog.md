# Datadog Webhook Setup

This guide explains how to configure Datadog to send alerts to oncall-agent.

## Step 1: Create a Webhook Integration

1. Go to **Integrations** → **Webhooks**
2. Click **New Webhook**
3. Configure:
   - **Name**: `oncall-agent`
   - **URL**: Your webhook forwarder URL (see below)
   - **Payload**: Leave default or customize

### Payload Template (Optional)

You can customize the payload sent to oncall-agent:

```json
{
  "id": "$ID",
  "title": "$EVENT_TITLE",
  "text": "$EVENT_MSG",
  "date": $DATE,
  "priority": "$PRIORITY",
  "alert_type": "$ALERT_TYPE",
  "tags": $TAGS,
  "url": "$LINK"
}
```

## Step 2: Set Up Webhook Forwarder

Since GitHub's repository_dispatch requires authentication, use a forwarder:

### Cloudflare Worker

```javascript
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const payload = await request.json()

    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: 'datadog-alert',
          client_payload: payload
        })
      }
    )

    return new Response(response.ok ? 'OK' : 'Error', {
      status: response.ok ? 200 : 500
    })
  }
}
```

## Step 3: Use in Monitors

Add the webhook notification to your Datadog monitors:

1. Go to **Monitors** → Select a monitor → **Edit**
2. In the notification section, add: `@webhook-oncall-agent`
3. Save the monitor

### Example Monitor Configuration

```
Alert: {{#is_alert}}@webhook-oncall-agent{{/is_alert}}
Recovery: {{#is_recovery}}Service recovered{{/is_recovery}}
```

## Step 4: Configure GitHub Workflow

Ensure your workflow handles Datadog events:

```yaml
on:
  repository_dispatch:
    types: [datadog-alert]
```

## Service Tags

For best results, include service information in your Datadog alerts:

- Add `service:your-service-name` tag to monitors
- oncall-agent will use this to filter relevant code

## Testing

1. Create a test monitor that triggers on demand
2. Or use Datadog's **Test Notification** feature
3. Verify the alert appears in your GitHub Actions runs
