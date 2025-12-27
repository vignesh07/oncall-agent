/**
 * PagerDuty API client for updating incidents
 */
interface UpdateIncidentOptions {
    note?: string;
    status?: 'acknowledged' | 'resolved';
}
/**
 * Add a note to a PagerDuty incident
 */
export declare function addIncidentNote(apiKey: string, incidentId: string, content: string, userEmail?: string): Promise<void>;
/**
 * Update incident status
 */
export declare function updateIncidentStatus(apiKey: string, incidentId: string, status: 'acknowledged' | 'resolved', userEmail?: string): Promise<void>;
/**
 * Update a PagerDuty incident with results from oncall-agent
 */
export declare function updateIncident(apiKey: string, incidentId: string, options: UpdateIncidentOptions, userEmail?: string): Promise<void>;
/**
 * Format a note for PagerDuty based on oncall-agent results
 */
export declare function formatIncidentNote(actionTaken: string, analysis: string, confidence: string, prNumber?: number, issueNumber?: number): string;
export {};
//# sourceMappingURL=pagerduty.d.ts.map