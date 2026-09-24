import {
	StartSubAgentArgs,
	SubAgentEntry,
	SubAgentPreparation,
	SubAgentResult,
	PreparedSubAgent,
} from '../../types';
import {prepareSubAgent} from './lifecycle';
import {cleanupSubAgentWorktree, retainSubAgentWorktree} from './worktree';

function isPrepared(result: SubAgentPreparation): result is PreparedSubAgent {
	return result.status === 'READY';
}
export class SubAgentManager {
	public entries = new Map<string, SubAgentEntry>();

	public start(args: StartSubAgentArgs): void {
		if (this.entries.has(args.id)) {
			args.dispose();
			void cleanupSubAgentWorktree(args.worktree).then(warning => {
				if (warning)
					console.error('Unable to clean duplicate sub-agent:', warning);
			});
			throw new Error(`Sub-agent ${args.id} is already registered`);
		}

		retainSubAgentWorktree(args.worktree);

		let entry: SubAgentEntry = {
			id: args.id,
			preparation: prepareSubAgent(args).then(prepared => {
				entry.prepared = prepared;
				if (!isPrepared(prepared)) {
					entry.result = prepared;
					this.notify(entry, prepared);
				}
				return prepared;
			}),
			notified: false,
			onSettled: args.onSettled,
		};
		this.entries.set(args.id, entry);
	}

	public async waitFor(
		id: string,
		beforeIntegration?: () => Promise<void>,
	): Promise<SubAgentResult | undefined> {
		const entry = this.entries.get(id);
		if (!entry) return undefined;

		const prepared = await entry.preparation;
		if (isPrepared(prepared)) await beforeIntegration?.();

		return await this.settle(entry);
	}

	public async collectRun(
		mode: 'ready' | 'all',
		beforeIntegrate?: () => Promise<void>,
	): Promise<SubAgentResult[]> {
		const candidates = [...this.entries.entries()];

		if (mode === 'all') {
			await Promise.all(candidates.map(([, entry]) => entry.preparation));
		}

		const selected = candidates.filter(
			([_key, entry]) => mode === 'all' || entry.prepared !== undefined,
		);
		if (selected.length === 0) return [];

		const needsIntegration = selected.some(
			([, entry]) => entry.prepared && isPrepared(entry.prepared),
		);
		if (needsIntegration) await beforeIntegrate?.();

		const results = await Promise.all(
			selected.map(([, entry]) => this.settle(entry)),
		);
		for (const [key, entry] of selected) {
			if (this.entries.get(key) === entry) this.entries.delete(key);
		}
		return results;
	}

	// Discards any unconsumed prepared work when the parent run terminates.
	// D
	public async clearRun(): Promise<void> {
		const selected = [...this.entries.entries()];
		for (const [key, entry] of selected) {
			if (this.entries.get(key) === entry) this.entries.delete(key);
		}

		const readyDiscards: Promise<void>[] = [];
		for (const [_key, entry] of selected) {
			if (entry.completion) continue;
			if (entry.prepared && isPrepared(entry.prepared)) {
				readyDiscards.push(entry.prepared.discard());
				continue;
			}

			// Do not hold the parent response open for a provider that has not observed cancellation yet.
			// Its preparation will receive the shared abort signal, then this continuation removes any late worktree.
			void entry.preparation.then(prepared =>
				isPrepared(prepared) ? prepared.discard() : Promise.resolve(),
			);
		}

		await Promise.all(
			readyDiscards.map(discard =>
				discard.catch(error => {
					console.error('Unable to discard a sub-agent worktree:', error);
				}),
			),
		);
	}

	private async settle(entry: SubAgentEntry): Promise<SubAgentResult> {
		if (entry.result) return Promise.resolve(entry.result);
		if (entry.completion) return entry.completion;
		entry.completion = entry.preparation
			.then(prepared =>
				isPrepared(prepared) ? prepared.integrate() : prepared,
			)
			.then(result => {
				entry.result = result;
				this.notify(entry, result);
				return result;
			});
		return entry.completion;
	}

	private notify(entry: SubAgentEntry, result: SubAgentResult): void {
		if (entry.notified) return;
		entry.notified = true;
		try {
			entry.onSettled?.(result);
		} catch (error) {
			console.error('Unable to publish the sub-agent result:', error);
		}
	}
}
