/**
 * Create a new branch for the fix
 */
export declare function createFixBranch(alertId: string): Promise<string>;
/**
 * Stage all changes made by Claude
 */
export declare function stageChanges(): Promise<string[]>;
/**
 * Commit the staged changes
 */
export declare function commitChanges(alertTitle: string, alertSource: string): Promise<boolean>;
/**
 * Push the branch to remote
 */
export declare function pushBranch(branchName: string): Promise<void>;
/**
 * Get the current branch name
 */
export declare function getCurrentBranch(): Promise<string>;
/**
 * Get the default branch name
 */
export declare function getDefaultBranch(): Promise<string>;
/**
 * Check if there are uncommitted changes
 */
export declare function hasUncommittedChanges(): Promise<boolean>;
/**
 * Discard all local changes
 */
export declare function discardChanges(): Promise<void>;
/**
 * Configure git for commits in CI
 */
export declare function configureGit(): Promise<void>;
/**
 * Fetch and checkout a PR branch
 */
export declare function checkoutPRBranch(prNumber: number): Promise<string>;
/**
 * Push changes to the PR branch
 */
export declare function pushToPRBranch(prNumber: number, remoteBranch: string): Promise<void>;
/**
 * Commit changes for a PR review response
 */
export declare function commitReviewChanges(commentSummary: string): Promise<boolean>;
