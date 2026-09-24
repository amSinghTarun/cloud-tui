import {
	PreparedSubAgent,
	StartSubAgentArgs,
	SubAgentResult,
	SubAgentRunResult,
	SubAgentErrorResult,
	MergeConflictResult,
} from '../../types';
import {throwIfRunCancelled} from '../agent';
import {commandErrorMessage} from './git';
import {
	inspectWorktreeConflict,
	mergeWorktree,
	syncTargetIntoWorktree,
} from './mergeWorktree';
import {
	checkpointWorktree,
	cleanupSubAgentWorktree,
	scheduleSubAgentCleanup,
} from './worktree';

const MAX_INTEGRATION_ROUNDS = 8;
const MAX_CONFLICT_RESOLUTION_ATTEMPTS = 3;

function subAgentError(
	id: string,
	...messages: Array<string | undefined>
): SubAgentErrorResult {
	return {
		id,
		status: 'ERROR',
		error: messages.filter(Boolean).join('\n'),
	};
}

export const prepareSubAgent = async (
	args: StartSubAgentArgs,
): Promise<PreparedSubAgent | SubAgentResult> => {
	throwIfRunCancelled(args.signal);

	const response = await args.run(
		{
			id: args.id,
			prompt: args.initialPrompt,
			cwd: args.worktree.worktreePath,
			systemPrompt: args.systemPrompt,
		},
		args.signal,
	);
	throwIfRunCancelled(args.signal);

	if (response.status !== 'SUCCEEDED') {
		const cleanupWarning = await discardSubAgentResources(args);
		return subAgentError(
			args.id,
			response.summary || `Sub-agent ended with status ${response.status}.`,
			cleanupWarning,
		);
	}

	const changed = await checkpointWorktree({
		worktreePath: args.worktree.worktreePath,
		message: `Sub-agent ${args.id} completed delegated work`,
		signal: args.signal,
	});
	if (!changed) {
		const cleanupWarning = await discardSubAgentResources(args);
		return subAgentError(
			args.id,
			'Sub-agent completed without changing its worktree.',
			cleanupWarning,
		);
	}

	let discarded = false;
	return {
		id: args.id,
		status: 'READY',
		integrate: () => integratePreparedSubAgent(args, response),
		discard: async () => {
			if (discarded) return;
			discarded = true;
			const warning = await discardSubAgentResources(args);
			if (warning)
				console.error('Unable to discard sub-agent worktree:', warning);
		},
	};
};

const discardSubAgentResources = async (
	args: StartSubAgentArgs,
): Promise<string | undefined> => {
	try {
		return await cleanupSubAgentWorktree(args.worktree);
	} finally {
		args.dispose();
	}
};

const recordSuccessfulMerge = async (_args: StartSubAgentArgs) => {
	try {
		// await prisma.conversationHistory.create({
		// 	data: {
		// 		contents: JSON.stringify({
		// 			args: {
		// 				id: args.id,
		// 				targetBranch: args.worktree.targetBranch,
		// 				mainWorktreePath: args.worktree.mainWorktreePath,
		// 			},
		// 		}),
		// 		from: 'LOOP',
		// 		toolCall: 'subAgentMerge',
		// 		projectId: args.projectId,
		// 		type: 'TOOL_CALL',
		// 		agentId: args.parentAgentId,
		// 	},
		// });
	} catch (error) {
		console.error('Unable to record the sub-agent merge:', error);
	}
};

const integratePreparedSubAgent = async (
	args: StartSubAgentArgs,
	initialResponse: SubAgentRunResult,
): Promise<SubAgentResult> => {
	let conflictAttempts = 0;
	let integrationRounds = 0;
	let lastConflict: MergeConflictResult | undefined;

	try {
		while (integrationRounds < MAX_INTEGRATION_ROUNDS) {
			integrationRounds += 1;
			throwIfRunCancelled(args.signal);

			const mergeResult = await mergeWorktree(args.worktree, args.signal);
			if (mergeResult.status === 'MERGED') {
				await recordSuccessfulMerge(args);
				return {
					id: args.id,
					status: 'MERGED',
					summary: initialResponse.summary,
					...(mergeResult.cleanupWarning && {
						cleanupWarning: mergeResult.cleanupWarning,
					}),
				};
			}

			lastConflict = mergeResult;
			const syncResult = await syncTargetIntoWorktree(
				args.worktree,
				args.signal,
			);
			if (syncResult.status === 'SYNCED') continue;

			let conflictEvidence = {
				conflictingFiles: syncResult.conflictingFiles,
				gitStatus: syncResult.gitStatus,
			};
			let previousFailure: string | undefined;
			let resolutionCommitted = false;

			while (
				!resolutionCommitted &&
				conflictAttempts < MAX_CONFLICT_RESOLUTION_ATTEMPTS
			) {
				conflictAttempts += 1;

				args.onConflict({
					id: args.id,
					attempt: conflictAttempts,
					conflictingFiles: conflictEvidence.conflictingFiles,
				});

				//  agent loop to correct the conflicts
				const response = await args.run(
					{
						id: args.id,
						prompt: conflictResolutionPrompt({
							conflict: mergeResult,
							attempt: conflictAttempts,
							conflictingFiles: conflictEvidence.conflictingFiles,
							gitStatus: conflictEvidence.gitStatus,
							previousFailure,
						}),
						cwd: args.worktree.worktreePath,
						systemPrompt: args.systemPrompt,
					},
					args.signal,
				);
				throwIfRunCancelled(args.signal);

				// didn't succeed, try again
				if (response.status !== 'SUCCEEDED') {
					previousFailure =
						response.summary ||
						`Sub-agent conflict resolution ended with status ${response.status}.`;
					continue;
				}

				try {
					// commits the changes
					resolutionCommitted = await checkpointWorktree({
						worktreePath: args.worktree.worktreePath,
						message: `Resolve target conflicts for sub-agent ${args.id}`,
						signal: args.signal,
					});
					if (!resolutionCommitted) {
						throw new Error(
							'The sub-agent did not produce a conflict resolution commit.',
						);
					}
				} catch (error) {
					throwIfRunCancelled(args.signal);
					previousFailure = commandErrorMessage(error);
					conflictEvidence = await inspectWorktreeConflict(
						args.worktree.worktreePath,
					);
				}

				if (!resolutionCommitted) break;
			}
		}
		// we are here it means, weren't able to resolve issue, so we notify the main agent of the issue and clear the worktree

		const evidence = await inspectWorktreeConflict(args.worktree.worktreePath);
		const terminalConflict: SubAgentResult = {
			id: args.id,
			status: 'MERGE_CONFLICT',
			error:
				lastConflict?.error ||
				'The target branch kept changing while the sub-agent was integrating.',
			branchName: args.worktree.branchName,
			worktreePath: args.worktree.worktreePath,
			conflictingFiles:
				evidence.conflictingFiles.length > 0
					? evidence.conflictingFiles
					: lastConflict?.conflictingFiles ?? [],
			gitStatus: evidence.gitStatus || lastConflict?.gitStatus || '',
		};
		scheduleSubAgentCleanup(args.worktree);
		return terminalConflict;
	} catch (error) {
		const cleanupWarning = await cleanupSubAgentWorktree(args.worktree);
		return subAgentError(args.id, commandErrorMessage(error), cleanupWarning);
	} finally {
		args.dispose();
	}
};

function conflictResolutionPrompt(args: {
	conflict: MergeConflictResult;
	attempt: number;
	conflictingFiles: string[];
	gitStatus: string;
	previousFailure?: string;
}): string {
	return `Your completed implementation conflicts with changes that reached the target branch while you were working.

Resolve the merge currently open in your existing worktree. Do not abort the merge, create another worktree, or delegate this resolution.

Resolution attempt: ${args.attempt}/${MAX_CONFLICT_RESOLUTION_ATTEMPTS}
Conflicting files:
${
	args.conflictingFiles.length > 0
		? args.conflictingFiles.map(file => `- ${file}`).join('\n')
		: '- Git has staged the attempted resolution; inspect the files shown by status for remaining conflict markers.'
}

Current Git status:
${args.gitStatus || 'clean status unavailable'}

Original merge diagnostic:
${args.conflict.error}
${
	args.previousFailure
		? `\nThe previous resolution was rejected:\n${args.previousFailure}\n`
		: ''
}
Preserve the intended behavior from both branches, remove every conflict marker, inspect affected callers, and run the relevant checks. Finish only after the files contain the correct integrated implementation.`;
}
