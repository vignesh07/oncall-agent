import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import type { Confidence } from './types'

export interface ClaudeResult {
  success: boolean
  analysis: string
  confidence: Confidence
  hasChanges: boolean
  changedFiles: string[]
  error?: string
}

interface ClaudeJsonOutput {
  result?: string
  error?: string
  cost_usd?: number
  duration_ms?: number
  turns?: number
}

/**
 * Run Claude Code CLI to analyze and potentially fix an issue
 */
export async function runClaudeCode(
  prompt: string,
  options: {
    timeoutMinutes: number
    maxFilesChanged: number
    workingDirectory?: string
  }
): Promise<ClaudeResult> {
  const { timeoutMinutes, maxFilesChanged, workingDirectory } = options
  const cwd = workingDirectory || process.cwd()

  // Write prompt to temp file (avoids shell escaping issues)
  const promptFile = path.join(cwd, '.oncall-agent-prompt.md')
  fs.writeFileSync(promptFile, prompt)

  // Get list of files before Claude runs (to detect changes)
  const filesBefore = await getTrackedFiles(cwd)

  let stdout = ''
  let stderr = ''

  try {
    core.info('Installing Claude Code CLI...')

    // Install Claude Code CLI
    await exec.exec('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
      silent: true
    })

    core.info('Running Claude Code analysis...')

    // Run Claude Code with the prompt
    // --print: non-interactive mode
    // --output-format json: structured output
    // --max-turns: limit iterations
    // --dangerously-skip-permissions: required for CI (no TTY)
    const exitCode = await exec.exec(
      'claude',
      [
        '--print',
        '--output-format', 'json',
        '--max-turns', '20',
        '--dangerously-skip-permissions',
        prompt
      ],
      {
        cwd,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: core.getInput('anthropic_api_key'),
          // Disable interactive features
          CI: 'true',
          TERM: 'dumb'
        },
        silent: false,
        listeners: {
          stdout: (data: Buffer) => {
            stdout += data.toString()
          },
          stderr: (data: Buffer) => {
            stderr += data.toString()
          }
        },
        ignoreReturnCode: true
      }
    )

    // Clean up prompt file
    if (fs.existsSync(promptFile)) {
      fs.unlinkSync(promptFile)
    }

    // Parse Claude's output
    let claudeOutput: ClaudeJsonOutput = {}
    try {
      // Find JSON in output (may have other text around it)
      const jsonMatch = stdout.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        claudeOutput = JSON.parse(jsonMatch[0])
      }
    } catch {
      core.debug('Could not parse Claude output as JSON')
    }

    // Check for changes
    const filesAfter = await getTrackedFiles(cwd)
    const changedFiles = await getChangedFiles(cwd)

    // Determine if we have meaningful changes
    const hasChanges = changedFiles.length > 0

    // Check file count limit
    if (changedFiles.length > maxFilesChanged) {
      core.warning(`Claude modified ${changedFiles.length} files, exceeding limit of ${maxFilesChanged}`)
      // Revert changes
      await exec.exec('git', ['checkout', '.'], { cwd, silent: true })
      return {
        success: false,
        analysis: `Claude attempted to modify ${changedFiles.length} files, which exceeds the safety limit of ${maxFilesChanged}. Changes were reverted.`,
        confidence: 'low',
        hasChanges: false,
        changedFiles: [],
        error: 'Too many files modified'
      }
    }

    // Extract analysis from Claude's response
    const analysis = claudeOutput.result || stdout || 'No analysis available'

    // Determine confidence from the analysis
    const confidence = extractConfidence(analysis)

    if (exitCode !== 0 && !hasChanges) {
      return {
        success: false,
        analysis: stderr || analysis,
        confidence: 'low',
        hasChanges: false,
        changedFiles: [],
        error: `Claude exited with code ${exitCode}`
      }
    }

    return {
      success: true,
      analysis,
      confidence,
      hasChanges,
      changedFiles
    }

  } catch (error) {
    // Clean up prompt file on error
    if (fs.existsSync(promptFile)) {
      fs.unlinkSync(promptFile)
    }

    const message = error instanceof Error ? error.message : String(error)
    core.error(`Claude Code failed: ${message}`)

    return {
      success: false,
      analysis: `Claude Code execution failed: ${message}`,
      confidence: 'low',
      hasChanges: false,
      changedFiles: [],
      error: message
    }
  }
}

/**
 * Get list of tracked files in git
 */
async function getTrackedFiles(cwd: string): Promise<Set<string>> {
  let output = ''
  await exec.exec('git', ['ls-files'], {
    cwd,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      }
    }
  })
  return new Set(output.trim().split('\n').filter(Boolean))
}

/**
 * Get list of files changed by Claude
 */
async function getChangedFiles(cwd: string): Promise<string[]> {
  let output = ''

  // Get modified files
  await exec.exec('git', ['diff', '--name-only'], {
    cwd,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      }
    }
  })

  // Also get untracked files
  let untracked = ''
  await exec.exec('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        untracked += data.toString()
      }
    }
  })

  const modified = output.trim().split('\n').filter(Boolean)
  const newFiles = untracked.trim().split('\n').filter(Boolean)

  return [...modified, ...newFiles]
}

/**
 * Extract confidence level from Claude's analysis
 */
function extractConfidence(analysis: string): Confidence {
  const lower = analysis.toLowerCase()

  // Look for explicit confidence statements
  if (lower.includes('confidence: high') || lower.includes('high confidence')) {
    return 'high'
  }
  if (lower.includes('confidence: medium') || lower.includes('medium confidence')) {
    return 'medium'
  }
  if (lower.includes('confidence: low') || lower.includes('low confidence')) {
    return 'low'
  }

  // Look for confidence indicators in the text
  const highIndicators = [
    'clearly shows',
    'obvious fix',
    'straightforward',
    'definitely',
    'certain that',
    'root cause is'
  ]
  const lowIndicators = [
    'not sure',
    'unclear',
    'might be',
    'could be',
    'possibly',
    'need more information',
    'requires investigation',
    'cannot determine'
  ]

  for (const indicator of highIndicators) {
    if (lower.includes(indicator)) return 'high'
  }
  for (const indicator of lowIndicators) {
    if (lower.includes(indicator)) return 'low'
  }

  // Default to medium
  return 'medium'
}

/**
 * Check if confidence meets threshold
 */
export function meetsConfidenceThreshold(
  confidence: Confidence,
  threshold: Confidence
): boolean {
  const levels: Confidence[] = ['low', 'medium', 'high']
  return levels.indexOf(confidence) >= levels.indexOf(threshold)
}
