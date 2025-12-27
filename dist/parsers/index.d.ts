import type { Alert, AlertSource, Parser } from '../types';
/**
 * Registry of all available parsers
 */
declare const parsers: Parser[];
/**
 * Get parser by source name
 */
export declare function getParser(source: AlertSource): Parser | undefined;
/**
 * Auto-detect parser from payload
 */
export declare function detectParser(payload: unknown): Parser;
/**
 * Parse alert payload using specified or auto-detected parser
 */
export declare function parseAlert(payload: unknown, source?: string): Alert;
export { parsers };
//# sourceMappingURL=index.d.ts.map