import type { Alert, Parser } from '../types';
/**
 * Parser for Prometheus Alertmanager webhook payloads
 */
export declare class PrometheusParser implements Parser {
    name: "prometheus";
    canParse(payload: unknown): boolean;
    parse(payload: unknown): Alert;
    private getTitle;
    private getDescription;
    private getSeverity;
    private getService;
    private buildTags;
    private generateId;
}
//# sourceMappingURL=prometheus.d.ts.map