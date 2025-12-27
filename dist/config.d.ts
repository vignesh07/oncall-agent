import type { Config } from './types';
/**
 * Load configuration from the repository
 * Looks for config file in standard locations
 */
export declare function loadConfig(): Promise<Config>;
/**
 * Get default configuration
 */
export declare function getDefaultConfig(): Config;
/**
 * Validate that config file is well-formed
 */
export declare function validateConfig(config: unknown): config is Config;
