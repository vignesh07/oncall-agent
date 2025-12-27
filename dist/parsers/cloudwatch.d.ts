import type { Alert, Parser } from '../types';
/**
 * Parser for CloudWatch alarms delivered via SNS
 */
export declare class CloudWatchParser implements Parser {
    name: "cloudwatch";
    canParse(payload: unknown): boolean;
    parse(payload: unknown): Alert;
    private extractService;
    private mapSeverity;
}
//# sourceMappingURL=cloudwatch.d.ts.map