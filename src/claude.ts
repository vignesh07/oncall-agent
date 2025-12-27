import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
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

  let stdout = ''
  let stderr = ''

  try {
    core.info('Installing Claude Code CLI...')

    // Install Claude Code CLI globally
    await execCommand('npm', ['install', '-g', '@anthropic-ai/claude-code'], { cwd, silent: true })

    core.info('Running Claude Code analysis...')

    // Write prompt to file to avoid argument length issues
    const promptFile = path.join(cwd, '.oncall-prompt.txt')
    fs.writeFileSync(promptFile, prompt)

    // Run claude with prompt from stdin
    // Using -p for print mode (non-interactive)
    // Using --output-format json for structured output
    const result = await runClaudeWithStdin(prompt, {
      cwd,
      timeoutMs: timeoutMinutes * 60 * 1000,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: core.getInput('anthropic_api_key'),
        CI: 'true',
        TERM: 'dumb'
      }
    })

    stdout = result.stdout
    stderr = result.stderr
    const exitCode = result.exitCode

    // Clean up
    if (fs.existsSync(promptFile)) {
      fs.unlinkSync(promptFile)
    }

    core.info(`Claude exited with code ${exitCode}`)
    core.info(`stdout length: ${stdout.length}`)
    if (stderr) {
      core.info(`stderr: ${stderr.substring(0, 500)}`)
    }

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
      await execCommand('git', ['checkout', '.'], { cwd, silent: true })
      await execCommand('git', ['clean', '-fd'], { cwd, silent: true })
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
 * Run Claude CLI with prompt via stdin
 */
function runClaudeWithStdin(
  prompt: string,
  options: {
    cwd: string
    timeoutMs: number
    env: NodeJS.ProcessEnv
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json']

    core.info(`Executing: claude ${args.join(' ')} (with prompt via stdin)`)

    const child = spawn('claude', args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      // Log progress
      if (text.includes('Tool:') || text.includes('Result:')) {
        core.info(text.substring(0, 200))
      }
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      })
    })

    // Set timeout
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Claude Code timed out after ${options.timeoutMs / 1000} seconds`))
    }, options.timeoutMs)

    child.on('close', () => {
      clearTimeout(timeout)
    })

    // Write prompt to stdin and close
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

/**
 * Execute a command and return the result
 */
function execCommand(
  cmd: string,
  args: string[],
  options: { cwd: string; silent?: boolean }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: options.silent ? 'pipe' : 'inherit'
    })

    let stdout = ''
    let stderr = ''

    if (options.silent && child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })
    }
    if (options.silent && child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })
    }

    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })
  })
}

/**
 * Get list of files changed by Claude
 */
async function getChangedFiles(cwd: string): Promise<string[]> {
  try {
    const diffResult = await execCommand('git', ['diff', '--name-only'], { cwd, silent: true })
    const untrackedResult = await execCommand('git', ['ls-files', '--others', '--exclude-standard'], { cwd, silent: true })

    const modified = diffResult.stdout.trim().split('\n').filter(Boolean)
    const newFiles = untrackedResult.stdout.trim().split('\n').filter(Boolean)

    return [...modified, ...newFiles]
  } catch {
    return []
  }
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
