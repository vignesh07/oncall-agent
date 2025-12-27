import * as github from '@actions/github'
import type { GitHub } from '@actions/github/lib/utils'

type Octokit = InstanceType<typeof GitHub>

interface CreateIssueOptions {
  title: string
  body: string
  labels?: string[]
  assignees?: string[]
}

interface CreatePROptions {
  title: string
  body: string
  head: string
  base?: string
  draft?: boolean
  labels?: string[]
}

/**
 * Get repository owner and name from GitHub context
 */
function getRepo() {
  return {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo
  }
}

/**
 * Create a new GitHub issue
 */
export async function createIssue(
  octokit: Octokit,
  options: CreateIssueOptions
): Promise<number> {
  const { owner, repo } = getRepo()

  const response = await octokit.rest.issues.create({
    owner,
    repo,
    title: options.title,
    body: options.body,
    labels: options.labels,
    assignees: options.assignees
  })

  return response.data.number
}

/**
 * Add a comment to an existing issue
 */
export async function commentOnIssue(
  octokit: Octokit,
  issueNumber: number,
  body: string
): Promise<number> {
  const { owner, repo } = getRepo()

  const response = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body
  })

  return response.data.id
}

/**
 * Create a pull request
 */
export async function createPR(
  octokit: Octokit,
  options: CreatePROptions
): Promise<number> {
  const { owner, repo } = getRepo()

  const response = await octokit.rest.pulls.create({
    owner,
    repo,
    title: options.title,
    body: options.body,
    head: options.head,
    base: options.base || 'main',
    draft: options.draft ?? true // Default to draft
  })

  // Add labels if specified
  if (options.labels && options.labels.length > 0) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: response.data.number,
      labels: options.labels
    })
  }

  return response.data.number
}

/**
 * List recent issues with a specific label
 */
export async function listRecentIssues(
  octokit: Octokit,
  options: {
    labels?: string[]
    state?: 'open' | 'closed' | 'all'
    since?: string
    perPage?: number
  } = {}
): Promise<Array<{
  number: number
  title: string
  body: string | null
  state: string
  createdAt: string
}>> {
  const { owner, repo } = getRepo()

  const response = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    labels: options.labels?.join(','),
    state: options.state || 'all',
    since: options.since,
    per_page: options.perPage || 50,
    sort: 'created',
    direction: 'desc'
  })

  return response.data
    .filter(issue => !issue.pull_request) // Exclude PRs
    .map(issue => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      state: issue.state,
      createdAt: issue.created_at
    }))
}

/**
 * Link a PR to an issue
 */
export async function linkPRToIssue(
  octokit: Octokit,
  prNumber: number,
  issueNumber: number
): Promise<void> {
  const { owner, repo } = getRepo()

  // Add a comment to the issue linking to the PR
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `PR #${prNumber} has been created to address this issue.`
  })

  // Update PR body to reference the issue (for auto-closing)
  const pr = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  })

  const currentBody = pr.data.body || ''
  if (!currentBody.includes(`#${issueNumber}`)) {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      body: `${currentBody}\n\nCloses #${issueNumber}`
    })
  }
}

/**
 * Get the default branch for the repository
 */
export async function getDefaultBranch(octokit: Octokit): Promise<string> {
  const { owner, repo } = getRepo()

  const response = await octokit.rest.repos.get({
    owner,
    repo
  })

  return response.data.default_branch
}

/**
 * Create a new branch from the default branch
 */
export async function createBranch(
  octokit: Octokit,
  branchName: string
): Promise<void> {
  const { owner, repo } = getRepo()
  const defaultBranch = await getDefaultBranch(octokit)

  // Get the SHA of the default branch
  const ref = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`
  })

  // Create the new branch
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.data.object.sha
  })
}
