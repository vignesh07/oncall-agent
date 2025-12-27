import type { Alert, Parser } from '../types';
/**
 * Parser for PagerDuty webhook payloads
 */
export declare class PagerDutyParser implements Parser {
    name: "pagerduty";
    canParse(payload: unknown): boolean;
    parse(payload: unknown): Alert;
    private extractTags;
}
//# sourceMappingURL=pagerduty.d.ts.map