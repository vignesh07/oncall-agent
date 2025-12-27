/**
 * PagerDuty API client for updating incidents
 */

interface UpdateIncidentOptions {
  note?: string
  status?: 'acknowledged' | 'resolved'
}

interface PagerDutyError {
  message: string
  code?: number
}

/**
 * Add a note to a PagerDuty incident
 */
export async function addIncidentNote(
  apiKey: string,
  incidentId: string,
  content: string,
  userEmail?: string
): Promise<void> {
  const headers: Record<string, string> = {
    'Authorization': `Token token=${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.pagerduty+json;version=2'
  }

  // PagerDuty requires a From header with user email for write operations
  if (userEmail) {
    headers['From'] = userEmail
  }

  const response = await fetch(
    `https://api.pagerduty.com/incidents/${incidentId}/notes`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        note: {
          content
        }
      })
    }
  )

  if (!response.ok) {
    const error = await response.json() as { error?: PagerDutyError }
    throw new Error(
      `PagerDuty API error: ${error.error?.message || response.statusText}`
    )
  }
}

/**
 * Update incident status
 */
export async function updateIncidentStatus(
  apiKey: string,
  incidentId: string,
  status: 'acknowledged' | 'resolved',
  userEmail?: string
): Promise<void> {
  const headers: Record<string, string> = {
    'Authorization': `Token token=${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.pagerduty+json;version=2'
  }

  if (userEmail) {
    headers['From'] = userEmail
  }

  const response = await fetch(
    `https://api.pagerduty.com/incidents/${incidentId}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        incident: {
          type: 'incident_reference',
          status
        }
      })
    }
  )

  if (!response.ok) {
    const error = await response.json() as { error?: PagerDutyError }
    throw new Error(
      `PagerDuty API error: ${error.error?.message || response.statusText}`
    )
  }
}

/**
 * Update a PagerDuty incident with results from oncall-agent
 */
export async function updateIncident(
  apiKey: string,
  incidentId: string,
  options: UpdateIncidentOptions,
  userEmail?: string
): Promise<void> {
  // Add note if provided
  if (options.note) {
    await addIncidentNote(apiKey, incidentId, options.note, userEmail)
  }

  // Update status if provided
  if (options.status) {
    await updateIncidentStatus(apiKey, incidentId, options.status, userEmail)
  }
}

/**
 * Format a note for PagerDuty based on oncall-agent results
 */
export function formatIncidentNote(
  actionTaken: string,
  analysis: string,
  confidence: string,
  prNumber?: number,
  issueNumber?: number
): string {
  const lines: string[] = []

  lines.push('🤖 oncall-agent Analysis')
  lines.push('')

  if (actionTaken === 'pr_created' && prNumber) {
    lines.push(`✅ Created PR #${prNumber} with a potential fix`)
  } else if (actionTaken === 'analysis_only') {
    lines.push('📋 Analysis completed (no automated fix attempted)')
  } else if (actionTaken === 'duplicate') {
    lines.push('🔄 Detected as duplicate of existing issue')
  } else if (actionTaken === 'error') {
    lines.push('❌ Error during analysis')
  }

  if (issueNumber) {
    lines.push(`📝 Tracking issue: #${issueNumber}`)
  }

  lines.push('')
  lines.push(`Confidence: ${confidence}`)
  lines.push('')
  lines.push('Summary:')
  lines.push(analysis.substring(0, 500)) // PagerDuty has note length limits

  if (analysis.length > 500) {
    lines.push('... (truncated, see GitHub issue for full analysis)')
  }

  return lines.join('\n')
}
