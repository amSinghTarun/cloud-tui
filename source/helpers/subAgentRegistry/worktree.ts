import {createHash} from 'node:crypto';
import {SubAgentWorktree} from '../../types';
import {commandErrorMessage, runGit} from './git';
import path from 'node:path';

const CONFLICT_WORKTREE_TTL_MS = 15 * 60 * 1000;
const PROVISIONED_WORKTREE_TTL_MS = 5 * 60 * 1000;

// <worktree.worktreePath, timer>
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Removes an isolated worktree and branch, aborting any unfinished merge first.
export const cleanupSubAgentWorktree = async (
	worktree: SubAgentWorktree,
): Promise<string | undefined> => {
	const errors: string[] = [];
	retainSubAgentWorktree(worktree);
	await runGit(worktree.worktreePath, ['merge', '--abort'], {
		allowFailure: true,
	});
	await runGit(
		worktree.mainWorktreePath,
		['worktree', 'unlock', worktree.worktreePath],
		{allowFailure: true},
	);
	try {
		await runGit(worktree.mainWorktreePath, [
			'worktree',
			'remove',
			'--force',
			worktree.worktreePath,
		]);
	} catch (error) {
		const message = commandErrorMessage(error);
		if (!/not a working tree|does not exist/i.test(message))
			errors.push(message);
	}

	try {
		await runGit(worktree.mainWorktreePath, [
			'branch',
			'-D',
			worktree.branchName,
		]);
	} catch (error) {
		const message = commandErrorMessage(error);
		if (!/branch .* not found|not found\./i.test(message)) errors.push(message);
	}

	return errors.length > 0 ? errors.join('\n') : undefined;
};

export const retainSubAgentWorktree = (worktree: SubAgentWorktree): void => {
	const timer = cleanupTimers.get(worktree.worktreePath);
	if (!timer) return;
	clearTimeout(timer);
	cleanupTimers.delete(worktree.worktreePath);
};

export const checkpointWorktree = async (args: {
	worktreePath: string;
	message: string;
	signal?: AbortSignal;
}): Promise<boolean> => {
	const status = await runGit(
		args.worktreePath,
		['status', '--porcelain', '--untracked-files=all'],
		{signal: args.signal},
	);
	const mergeHead = await runGit(
		args.worktreePath,
		['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'],
		{signal: args.signal, allowFailure: true},
	);
	if (!status && !mergeHead) return false;

	await runGit(args.worktreePath, ['add', '-A'], {signal: args.signal});
	await runGit(args.worktreePath, ['diff', '--cached', '--check'], {
		signal: args.signal,
	});
	await runGit(args.worktreePath, ['commit', '-m', args.message], {
		signal: args.signal,
	});
	return true;
};

export const scheduleSubAgentCleanup = (
	worktree: SubAgentWorktree,
	delayMs = CONFLICT_WORKTREE_TTL_MS,
): void => {
	retainSubAgentWorktree(worktree);
	const timer = setTimeout(() => {
		cleanupTimers.delete(worktree.worktreePath);
		cleanupSubAgentWorktree(worktree).then(warning => {
			if (warning)
				console.error('Unable to clean expired sub-agent worktree:', warning);
		});
	}, delayMs);
	timer.unref?.();
	cleanupTimers.set(worktree.worktreePath, timer);
};

export async function createSubAgentWorktree(args: {
	id: string;
	parentRunId: string;
	mainWorktreePath: string;
	baseBranch?: string;
	signal?: AbortSignal;
}): Promise<SubAgentWorktree> {
	if (!args.id.trim()) throw new Error('Sub-agent ID cannot be empty');

	const mainWorktreePath = path.resolve(args.mainWorktreePath);
	const targetBranch =
		args.baseBranch?.trim() ||
		(await runGit(
			mainWorktreePath,
			['symbolic-ref', '--quiet', '--short', 'HEAD'],
			{signal: args.signal},
		));
	if (!targetBranch) {
		throw new Error('Cannot create a sub-agent from a detached Git HEAD');
	}

	await runGit(mainWorktreePath, ['rev-parse', '--verify', targetBranch], {
		signal: args.signal,
	});

	const runLabel = args.parentRunId.replace(/[^a-zA-Z0-9_-]+/g, '-');
	const branchName = `agent-${runLabel}-${safeAgentLabel(args.id)}`;
	const worktreePath = path.resolve(
		mainWorktreePath,
		'../worktrees',
		branchName,
	);

	await runGit(
		mainWorktreePath,
		['worktree', 'add', '-b', branchName, worktreePath, targetBranch],
		{signal: args.signal},
	);

	const worktree = {
		branchName,
		worktreePath,
		targetBranch,
		mainWorktreePath,
	};
	// Reclaim the worktree if cancellation occurs before lifecycle registration takes ownership.
	scheduleSubAgentCleanup(worktree, PROVISIONED_WORKTREE_TTL_MS);
	return worktree;
}

function safeAgentLabel(id: string): string {
	const label = id
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32);
	const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
	return `${label || 'task'}-${hash}`;
}
