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

  // Write prompt to a file to avoid shell escaping issues
  const promptFile = path.join(cwd, '.oncall-agent-prompt.md')
  fs.writeFileSync(promptFile, prompt)

  let stdout = ''
  let stderr = ''

  try {
    core.info('Installing Claude Code CLI...')

    // Install Claude Code CLI globally
    await exec.exec('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
      silent: true,
      ignoreReturnCode: true
    })

    core.info('Running Claude Code analysis...')

    // Build the command arguments
    // -p: print mode (non-interactive)
    // --output-format json: structured output
    // --verbose: for debugging
    // --allowedTools: specify which tools Claude can use
    const args = [
      '-p',  // Print mode (non-interactive)
      '--output-format', 'json',
      '--max-turns', '10',
      // Allow read-only tools for analysis, plus Edit for fixes
      '--allowedTools', 'Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash',
      prompt  // The prompt is the last argument
    ]

    core.info(`Executing: claude ${args.slice(0, 5).join(' ')} ...`)

    const exitCode = await exec.exec('claude', args, {
      cwd,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: core.getInput('anthropic_api_key'),
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
    })

    // Clean up prompt file
    if (fs.existsSync(promptFile)) {
      fs.unlinkSync(promptFile)
    }

    core.info(`Claude exited with code ${exitCode}`)
    core.debug(`stdout length: ${stdout.length}`)
    core.debug(`stderr length: ${stderr.length}`)

    // Parse Claude's output
    let claudeOutput: ClaudeJsonOutput = {}
    let analysisText = ''

    try {
      // Try to parse as JSON
      const jsonMatch = stdout.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        claudeOutput = JSON.parse(jsonMatch[0])
        analysisText = claudeOutput.result || ''
      }
    } catch {
      core.debug('Could not parse Claude output as JSON, using raw output')
      analysisText = stdout
    }

    // If no analysis from JSON, use stdout
    if (!analysisText) {
      analysisText = stdout || stderr || 'No analysis output received'
    }

    // Check for file changes
    const changedFiles = await getChangedFiles(cwd)
    const hasChanges = changedFiles.length > 0

    core.info(`Changed files: ${changedFiles.length}`)

    // Check file count limit
    if (changedFiles.length > maxFilesChanged) {
      core.warning(`Claude modified ${changedFiles.length} files, exceeding limit of ${maxFilesChanged}`)
      await exec.exec('git', ['checkout', '.'], { cwd, silent: true })
      await exec.exec('git', ['clean', '-fd'], { cwd, silent: true })
      return {
        success: false,
        analysis: `Claude attempted to modify ${changedFiles.length} files, which exceeds the safety limit of ${maxFilesChanged}. Changes were reverted.`,
        confidence: 'low',
        hasChanges: false,
        changedFiles: [],
        error: 'Too many files modified'
      }
    }

    // Determine confidence
    const confidence = extractConfidence(analysisText)

    // Consider it a success if we got output, even with non-zero exit
    const success = analysisText.length > 50 || hasChanges

    return {
      success,
      analysis: analysisText,
      confidence,
      hasChanges,
      changedFiles,
      error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined
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
      analysis: `Claude Code execution failed: ${message}\n\nStdout: ${stdout}\n\nStderr: ${stderr}`,
      confidence: 'low',
      hasChanges: false,
      changedFiles: [],
      error: message
    }
  }
}

/**
 * Get list of files changed by Claude
 */
async function getChangedFiles(cwd: string): Promise<string[]> {
  let output = ''
  let untracked = ''

  try {
    await exec.exec('git', ['diff', '--name-only'], {
      cwd,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        }
      },
      ignoreReturnCode: true
    })

    await exec.exec('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          untracked += data.toString()
        }
      },
      ignoreReturnCode: true
    })
  } catch {
    // Git commands failed, likely not a git repo
    return []
  }

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
