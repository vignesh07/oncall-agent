import type { Alert, Parser } from '../types';
/**
 * Parser for Datadog webhook payloads
 */
export declare class DatadogParser implements Parser {
    name: "datadog";
    canParse(payload: unknown): boolean;
    parse(payload: unknown): Alert;
    private extractStackTrace;
    private extractTagValue;
    private mapSeverity;
    private parseTags;
}
//# sourceMappingURL=datadog.d.ts.map