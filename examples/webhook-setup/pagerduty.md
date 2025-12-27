# PagerDuty Webhook Setup

This guide explains how to configure PagerDuty to send alerts to oncall-agent.

## Option 1: Using a Webhook Forwarder (Recommended)

Since GitHub's `repository_dispatch` requires authentication, you'll need a middleware service to forward PagerDuty webhooks.

### Cloudflare Worker Example

1. Create a new Cloudflare Worker
2. Deploy this code:

```javascript
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    try {
      const payload = await request.json()

      // Forward to GitHub repository_dispatch
      const response = await fetch(
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'oncall-agent-forwarder'
          },
          body: JSON.stringify({
            event_type: 'pagerduty-alert',
            client_payload: payload
          })
        }
      )

      if (!response.ok) {
        const error = await response.text()
        console.error('GitHub API error:', error)
        return new Response('GitHub API error', { status: 500 })
      }

      return new Response('OK', { status: 200 })
    } catch (error) {
      console.error('Error:', error)
      return new Response('Internal error', { status: 500 })
    }
  }
}
```

3. Set environment variables in Cloudflare:
   - `GITHUB_OWNER`: Your GitHub username or org
   - `GITHUB_REPO`: Your repository name
   - `GITHUB_TOKEN`: A personal access token with `repo` scope

4. Configure PagerDuty webhook (see below)

### AWS Lambda Example

```python
import json
import urllib.request
import os

def lambda_handler(event, context):
    github_token = os.environ['GITHUB_TOKEN']
    github_owner = os.environ['GITHUB_OWNER']
    github_repo = os.environ['GITHUB_REPO']

    payload = json.loads(event['body'])

    dispatch_payload = {
        'event_type': 'pagerduty-alert',
        'client_payload': payload
    }

    url = f'https://api.github.com/repos/{github_owner}/{github_repo}/dispatches'
    headers = {
        'Authorization': f'token {github_token}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'oncall-agent-forwarder'
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(dispatch_payload).encode('utf-8'),
        headers=headers,
        method='POST'
    )

    try:
        urllib.request.urlopen(req)
        return {'statusCode': 200, 'body': 'OK'}
    except Exception as e:
        return {'statusCode': 500, 'body': str(e)}
```

## Configuring PagerDuty Webhooks

1. Go to **Services** → Select your service → **Integrations**
2. Click **Add an extension**
3. Select **Generic V2 Webhook**
4. Configure:
   - **Name**: `oncall-agent`
   - **Endpoint URL**: Your Cloudflare Worker or Lambda URL
   - **Events**: Select events to forward (recommended: `incident.triggered`, `incident.acknowledged`)

## Option 2: GitHub Issues Integration

PagerDuty can create GitHub issues directly without middleware:

1. Go to **Services** → Select your service → **Integrations**
2. Add **GitHub Integration**
3. Configure to create issues on incident

Then use this workflow:

```yaml
name: On-Call Agent

on:
  issues:
    types: [opened]

jobs:
  respond:
    if: contains(github.event.issue.labels.*.name, 'pagerduty')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: vignesh07/oncall-agent@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          alert_payload: ${{ toJson(github.event.issue) }}
          alert_source: generic
```

## Verifying Setup

1. Trigger a test incident in PagerDuty
2. Check:
   - Your forwarder logs (Cloudflare/Lambda)
   - GitHub Actions runs
   - Created issues/PRs in your repository
