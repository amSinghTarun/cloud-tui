import {SubAgentWorktree} from '../../types';
import {throwIfRunCancelled} from '../agent';
import {commandErrorMessage, queueRepositoryOperation, runGit} from './git';
import {cleanupSubAgentWorktree} from './worktree';

export type MergeResult =
	| {status: 'MERGED'; cleanupWarning?: string}
	| {
			status: 'MERGE_CONFLICT';
			error: string;
			branchName: string;
			worktreePath: string;
			conflictingFiles: string[];
			gitStatus: string;
	  };

export type MergeConflictResult = Extract<
	MergeResult,
	{status: 'MERGE_CONFLICT'}
>;

export type WorktreeSyncResult =
	| {status: 'SYNCED'}
	| {
			status: 'CONFLICT_READY';
			conflictingFiles: string[];
			gitStatus: string;
	  };

// Brings the latest target branch into a prepared sub-agent worktree.
// D
export async function syncTargetIntoWorktree(
	worktree: SubAgentWorktree,
	signal?: AbortSignal,
): Promise<WorktreeSyncResult> {
	try {
		await runGit(
			worktree.worktreePath,
			['merge', '--no-edit', worktree.targetBranch],
			{signal},
		);
		return {status: 'SYNCED'};
	} catch (error) {
		throwIfRunCancelled(signal);
		const conflictingFiles = (
			await runGit(worktree.worktreePath, [
				'diff',
				'--name-only',
				'--diff-filter=U',
			])
		)
			.split('\n')
			.map(file => file.trim())
			.filter(Boolean);

		if (conflictingFiles.length === 0) throw error;
		return {
			status: 'CONFLICT_READY',
			conflictingFiles,
			gitStatus: await runGit(worktree.worktreePath, ['status', '--short']),
		};
	}
}

// Returns current conflict evidence for a repeated AI resolution attempt.
// D
export async function inspectWorktreeConflict(
	worktreePath: string,
): Promise<{conflictingFiles: string[]; gitStatus: string}> {
	const conflictingFiles = (
		(await runGit(worktreePath, ['diff', '--name-only', '--diff-filter=U'], {
			allowFailure: true,
		})) ?? ''
	)
		.split('\n')
		.map(file => file.trim())
		.filter(Boolean);
	return {
		conflictingFiles,
		gitStatus:
			(await runGit(worktreePath, ['status', '--short'], {
				allowFailure: true,
			})) ?? '',
	};
}

// Validates and commits a merge resolution left in the isolated worktree.
// D
export async function completeWorktreeConflictResolution(
	worktreePath: string,
	signal?: AbortSignal,
): Promise<void> {
	const mergeHead = await runGit(
		worktreePath,
		['rev-parse', '-q', '--verify', 'MERGE_HEAD'],
		{signal, allowFailure: true},
	);
	if (!mergeHead) return;

	await runGit(worktreePath, ['add', '-A'], {signal});
	await runGit(worktreePath, ['diff', '--cached', '--check'], {signal});
	const unresolvedFiles = await runGit(
		worktreePath,
		['diff', '--name-only', '--diff-filter=U'],
		{signal},
	);
	if (unresolvedFiles) {
		throw new Error(
			`The sub-agent left unresolved merge entries:\n${unresolvedFiles}`,
		);
	}
	await runGit(worktreePath, ['commit', '--no-edit'], {signal});
}

// Integrates one committed delegate branch and reports cleanup independently from merge success.
// Merge the worktree in the main branch.
// if there are conflicting files, or the main branch has moved return error
// queueRepositoryOperation is used to sequantialise the merge.
// D
export function mergeWorktree(
	worktree: SubAgentWorktree,
	signal?: AbortSignal,
): Promise<MergeResult> {
	return queueRepositoryOperation(worktree.mainWorktreePath, async () => {
		throwIfRunCancelled(signal);
		const currentBranch = await runGit(
			worktree.mainWorktreePath,
			['symbolic-ref', '--quiet', '--short', 'HEAD'],
			{signal},
		);
		// It can happen only if something explicitly changes the main worktree’s branch while a sub-agent is running, like :
		// The main agent uses executeBash to run:
		// git checkout experimental
		// git switch experimental
		//
		// It does not happen when:
		// - Another sub-agent finishes.
		// - Another sub-agent merges.
		// - The main branch receives new commits.
		// - checkpointWorktree() creates a commit.
		// - Kubernetes restarts the workspace.
		if (currentBranch !== worktree.targetBranch) {
			throw new Error(
				`Main worktree moved from ${worktree.targetBranch} to ${currentBranch}; refusing to merge automatically.`,
			);
		}

		try {
			await runGit(
				worktree.mainWorktreePath,
				['merge', '--no-edit', worktree.branchName],
				{signal},
			);
		} catch (error) {
			throwIfRunCancelled(signal);
			const conflictingFiles = (
				await runGit(worktree.mainWorktreePath, [
					'diff',
					'--name-only',
					'--diff-filter=U',
				])
			)
				.split('\n')
				.map(file => file.trim())
				.filter(Boolean);
			if (conflictingFiles.length === 0) throw error;

			const gitStatus = await runGit(worktree.mainWorktreePath, [
				'status',
				'--short',
			]);
			const conflictError = commandErrorMessage(error);
			try {
				await runGit(worktree.mainWorktreePath, ['merge', '--abort']);
			} catch (abortError) {
				throw new Error(
					`Merge conflict detected, but the merge could not be aborted safely. ${commandErrorMessage(
						abortError,
					)}`,
				);
			}

			return {
				status: 'MERGE_CONFLICT',
				error: conflictError,
				branchName: worktree.branchName,
				worktreePath: worktree.worktreePath,
				conflictingFiles,
				gitStatus,
			};
		}

		const cleanupWarning = await cleanupSubAgentWorktree(worktree);
		return {
			status: 'MERGED',
			...(cleanupWarning && {cleanupWarning}),
		};
	});
}
