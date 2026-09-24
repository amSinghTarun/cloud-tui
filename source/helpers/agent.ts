import {AgentRunCancelledError} from '.';

export const abortable = <T>(
	operation: Promise<T>,
	signal?: AbortSignal,
): Promise<T> => {
	if (!signal) return operation;
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new AgentRunCancelledError());
		signal.addEventListener('abort', onAbort, {once: true});
		operation
			.then(resolve, reject)
			.finally(() => signal.removeEventListener('abort', onAbort));
	});
};

// it checks if run was cancelled, it will throw erro
export const throwIfRunCancelled = (signal?: AbortSignal) => {
	if (!signal?.aborted) return;
	throw new AgentRunCancelledError();
};

export const activityTarget = (value: string) => {
	if (typeof value !== 'string') return '.';
	return value.trim().replace(/\s+/g, ' ').slice(0, 100);
};

let pendingUserInput: Record<
	string,
	{
		resolve: (value: unknown) => void;
		signal?: AbortSignal;
		onAbort?: () => void;
	}
> = {};

export const seekInput = <T = unknown>(
	uuid: string,
	signal?: AbortSignal,
): Promise<T> => {
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			delete pendingUserInput[uuid];
			reject(new AgentRunCancelledError());
		};

		if (signal?.aborted) {
			onAbort();
			return;
		}

		pendingUserInput[uuid] = {
			resolve: value => resolve(value as T),
			signal,
			onAbort,
		};
		signal?.addEventListener('abort', onAbort, {once: true});
	});
};

export const answerInput = (uuid: string, value: unknown) => {
	let request = pendingUserInput[uuid];
	if (!request) throw new Error('No such request Id exist');
	delete pendingUserInput[uuid];
	if (request.onAbort)
		request.signal?.removeEventListener('abort', request.onAbort);
	request.resolve(value);
};

export const answerApproval = (uuid: string, answer: boolean) => {
	answerInput(uuid, answer);
};
