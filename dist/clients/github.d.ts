import type { GitHub } from '@actions/github/lib/utils';
type Octokit = InstanceType<typeof GitHub>;
interface CreateIssueOptions {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
}
interface CreatePROptions {
    title: string;
    body: string;
    head: string;
    base?: string;
    draft?: boolean;
    labels?: string[];
}
/**
 * Create a new GitHub issue
 */
export declare function createIssue(octokit: Octokit, options: CreateIssueOptions): Promise<number>;
/**
 * Add a comment to an existing issue
 */
export declare function commentOnIssue(octokit: Octokit, issueNumber: number, body: string): Promise<number>;
/**
 * Create a pull request
 */
export declare function createPR(octokit: Octokit, options: CreatePROptions): Promise<number>;
/**
 * List recent issues with a specific label
 */
export declare function listRecentIssues(octokit: Octokit, options?: {
    labels?: string[];
    state?: 'open' | 'closed' | 'all';
    since?: string;
    perPage?: number;
}): Promise<Array<{
    number: number;
    title: string;
    body: string | null;
    state: string;
    createdAt: string;
}>>;
/**
 * Link a PR to an issue
 */
export declare function linkPRToIssue(octokit: Octokit, prNumber: number, issueNumber: number): Promise<void>;
/**
 * Get the default branch for the repository
 */
export declare function getDefaultBranch(octokit: Octokit): Promise<string>;
/**
 * Create a new branch from the default branch
 */
export declare function createBranch(octokit: Octokit, branchName: string): Promise<void>;
export {};
//# sourceMappingURL=github.d.ts.map