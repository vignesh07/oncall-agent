import type { Alert, Parser } from '../types';
/**
 * Parser for Opsgenie webhook payloads
 */
export declare class OpsgenieParser implements Parser {
    name: "opsgenie";
    canParse(payload: unknown): boolean;
    parse(payload: unknown): Alert;
    private mapSeverity;
    private extractStackTrace;
    private extractService;
    private buildTags;
}
//# sourceMappingURL=opsgenie.d.ts.map