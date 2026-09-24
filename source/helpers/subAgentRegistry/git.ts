import path from 'path';
import {throwIfRunCancelled} from '../agent';
import {execFile} from 'child_process';

type RunGitOptions = {
	signal?: AbortSignal;
	allowFailure?: boolean;
};

export async function runGit(
	cmd: string,
	args: string[],
	options?: RunGitOptions,
): Promise<string>;

export async function runGit(
	cmd: string,
	args: string[],
	options: Omit<RunGitOptions, 'allowFailure'> & {allowFailure: false},
): Promise<string | undefined>;

// first two declarations are overload declarations, and overloads only work with function.
// TypeScript permits repeated function runGit declarations: it combines the first two as type signatures and uses the third as the implementation.
// An arrow function creates a const binding:
export async function runGit(
	cwd: string,
	args: string[],
	options: RunGitOptions = {},
): Promise<string | undefined> {
	throwIfRunCancelled(options.signal);
	try {
		return await new Promise((resolve, reject) => {
			execFile(
				'git',
				args,
				{
					cwd,
					encoding: 'utf8',
					maxBuffer: 10 * 1024 * 1024,
					signal: options.signal,
				},
				(error, stdout, stderr) => {
					if (error) {
						Object.assign(error, {stdout, stderr});
						reject(error);
						return;
					}
					resolve(stdout.trim());
				},
			);
		});
	} catch (error) {
		throwIfRunCancelled(options.signal);
		if (options.allowFailure) return undefined;
		throw error;
	}
}

export function commandErrorMessage(error: any): string {
	const stderr = Buffer.isBuffer(error?.stderr)
		? error.stderr.toString('utf8')
		: String(error?.stderr ?? '');
	const stdout = Buffer.isBuffer(error?.stdout)
		? error.stdout.toString('utf8')
		: String(error?.stdout ?? '');
	return [error?.message, stderr, stdout].filter(Boolean).join('\n').trim();
}

const repositoryQueues = new Map<string, Promise<void>>();

export const queueRepositoryOperation = <T>(
	repository: string,
	operation: () => Promise<T>,
) => {
	const key = path.resolve(repository);
	const previous = repositoryQueues.get(key) ?? Promise.resolve();
	const result = previous.then(operation);
	const tail = result.then(
		() => undefined,
		() => undefined,
	);
	repositoryQueues.set(key, tail);
	tail.finally(() => {
		if (repositoryQueues.get(key) == tail) repositoryQueues.delete(key);
	});
	return result;
};
