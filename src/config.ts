import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import type { Config } from './types'

const CONFIG_PATHS = [
  '.oncall-agent/config.yml',
  '.oncall-agent/config.yaml',
  '.github/oncall-agent.yml',
  '.github/oncall-agent.yaml'
]

/**
 * Load configuration from the repository
 * Looks for config file in standard locations
 */
export async function loadConfig(): Promise<Config> {
  const cwd = process.cwd()

  for (const configPath of CONFIG_PATHS) {
    const fullPath = path.join(cwd, configPath)
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        const parsed = yaml.parse(content) as Config
        return normalizeConfig(parsed)
      } catch (error) {
        // Log warning but continue with defaults
        console.warn(`Failed to parse config at ${configPath}:`, error)
      }
    }
  }

  // Return default config if no file found
  return getDefaultConfig()
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): Config {
  return {
    services: [],
    protectedPaths: [
      '**/migrations/**',
      '**/*.lock',
      '**/package-lock.json',
      '**/yarn.lock'
    ],
    deduplication: {
      enabled: true,
      similarityThreshold: 0.7,
      lookbackHours: 24
    },
    autoMerge: {
      enabled: false
    }
  }
}

/**
 * Normalize and validate configuration
 */
function normalizeConfig(config: Partial<Config>): Config {
  const defaults = getDefaultConfig()

  return {
    services: config.services || defaults.services,
    protectedPaths: [
      ...(defaults.protectedPaths || []),
      ...(config.protectedPaths || [])
    ],
    context: config.context,
    runbooks: config.runbooks,
    deduplication: {
      enabled: config.deduplication?.enabled ?? defaults.deduplication?.enabled,
      similarityThreshold:
        config.deduplication?.similarityThreshold ??
        defaults.deduplication?.similarityThreshold,
      lookbackHours:
        config.deduplication?.lookbackHours ??
        defaults.deduplication?.lookbackHours
    },
    autoMerge: {
      enabled: false // Always disabled for safety
    }
  }
}

/**
 * Validate that config file is well-formed
 */
export function validateConfig(config: unknown): config is Config {
  if (typeof config !== 'object' || config === null) {
    return false
  }

  const c = config as Record<string, unknown>

  // Validate services
  if (c.services !== undefined) {
    if (!Array.isArray(c.services)) return false
    if (!c.services.every(s => typeof s === 'string')) return false
  }

  // Validate protectedPaths
  if (c.protectedPaths !== undefined) {
    if (!Array.isArray(c.protectedPaths)) return false
    if (!c.protectedPaths.every(s => typeof s === 'string')) return false
  }

  // Validate context
  if (c.context !== undefined && typeof c.context !== 'string') {
    return false
  }

  // Validate runbooks
  if (c.runbooks !== undefined) {
    if (typeof c.runbooks !== 'object' || c.runbooks === null) return false
    for (const value of Object.values(c.runbooks)) {
      if (typeof value !== 'string') return false
    }
  }

  // Validate deduplication
  if (c.deduplication !== undefined) {
    if (typeof c.deduplication !== 'object' || c.deduplication === null) {
      return false
    }
    const dedup = c.deduplication as Record<string, unknown>
    if (dedup.enabled !== undefined && typeof dedup.enabled !== 'boolean') {
      return false
    }
    if (
      dedup.similarityThreshold !== undefined &&
      typeof dedup.similarityThreshold !== 'number'
    ) {
      return false
    }
    if (
      dedup.lookbackHours !== undefined &&
      typeof dedup.lookbackHours !== 'number'
    ) {
      return false
    }
  }

  return true
}
