import type { Alert, Parser } from '../types';
/**
 * Generic fallback parser for unknown alert formats
 * Attempts to extract common fields from any JSON payload
 */
export declare class GenericParser implements Parser {
    name: "generic";
    canParse(_payload: unknown): boolean;
    parse(payload: unknown): Alert;
    private extractId;
    private extractTitle;
    private extractDescription;
    private extractSeverity;
    private extractStackTrace;
    private extractService;
    private extractTimestamp;
    private extractUrl;
    private extractTags;
}
//# sourceMappingURL=generic.d.ts.map