import type { Alert, Parser } from '../types';
/**
 * Parser for Sentry webhook payloads
 */
export declare class SentryParser implements Parser {
    name: "sentry";
    canParse(payload: unknown): boolean;
    parse(payload: unknown): Alert;
    private buildDescription;
    private extractStackTrace;
    private mapSeverity;
    private extractTags;
}
//# sourceMappingURL=sentry.d.ts.map