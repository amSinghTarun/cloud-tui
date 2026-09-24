import {type FunctionDeclaration} from '@google/genai';
import {activityTarget} from '../helpers';
import {checkpointWorktree, createSubAgentWorktree} from '../helpers';
import {AgentTool} from '../types';
import {type ToolContext, type ToolResult} from '../types/tools';

export const agentTools = {
	createSubAgent: {
		activity: {
			started: (args: {id: string}) =>
				`Starting focused task ${activityTarget(`${args.id} for a sub-agent`)}`,
			completed: (args: {id: string}) =>
				`Started focused task ${activityTarget(`${args.id} for a sub-agent`)}`,
		},
		declaration: {
			name: 'createSubAgent',
			description: 'Create a sub-agent and spawn off a dedicated task to it',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'id of the sub-agent',
					},
					systemPrompt: {
						type: 'string',
						description: 'the system prompt for the agent.',
					},
					prompt: {
						type: 'string',
						description: 'The task prompt that the agent should work upon',
					},
					baseBranch: {
						type: 'string',
						description: "Branch to base this sub-agent's worktree on.",
					},
				},
				required: ['id', 'systemPrompt', 'prompt', 'baseBranch'],
			},
		} as FunctionDeclaration,
		executable: async (
			args: {
				id: string;
				systemPrompt: string;
				prompt: string;
				baseBranch: string;
			},
			context: ToolContext,
		): Promise<ToolResult> => {
			if (context.agentId !== '1')
				return {
					status: 'error',
					response: 'This agent can-not make sub-agents',
				};
			await checkpointWorktree({
				worktreePath: context.cwd,
				message: `Main agent checkpoint before sub-agent ${args.id}`,
				signal: context.signal,
			});
			const worktree = await createSubAgentWorktree({
				id: args.id,
				parentRunId: context.agentRunId,
				mainWorktreePath: context.cwd,
				baseBranch: args.baseBranch,
				signal: context.signal,
			});

			if (!context.subAgentManager || !context.startSubAgentArgs) {
				throw new Error(
					'Sub-agent execution is unavailable for this agent run',
				);
			}

			// Start the sub-agent lifecycle with the delegated task, rather than
			// reusing the parent agent's prompt or session configuration.
			context.subAgentManager.start({
				...context.startSubAgentArgs,
				id: args.id,
				initialPrompt: args.prompt,
				systemPrompt: args.systemPrompt,
				worktree,
			});

			return {
				status: 'success',
				response: 'Subagent created',
				yield: {
					output: {
						type: 'message',
						response: 'Created a sub-agent',
					},
				},
			};
		},
	},
	waitForSubAgent: {
		activity: {
			started: (args: {id: string}) =>
				`Waiting for focused task ${activityTarget(
					`${args.id} from a sub-agent`,
				)}`,
			completed: (args: {id: string}) =>
				`Received result from focused task ${activityTarget(
					`${args.id} from a sub-agent`,
				)}`,
		},
		declaration: {
			name: 'waitForSubAgent',
			description:
				'Wait for a previously created sub-agent to finish and for its worktree to be merged, then return the exact merge result.',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'id of the sub-agent for which we are waiting',
					},
				},
				required: ['id'],
			},
		} as FunctionDeclaration,
		executable: async (
			args: {id: string},
			context: ToolContext,
		): Promise<ToolResult> => {
			try {
				let subAgentManager = context.subAgentManager!;

				if (context.agentId !== '1')
					throw new Error('Only the main agent can wait for sub-agents');

				const result = await subAgentManager.waitFor(args.id, async () => {
					await checkpointWorktree({
						worktreePath: context.cwd,
						message: `Main agent checkpoint before merging sub-agent ${args.id}`,
						signal: context.signal,
					});
				});

				if (!result) {
					return {
						status: 'error',
						response: `No sub-agent with that ID exists for this agent run.`,
					};
				}

				return {
					status: result.status === 'MERGED' ? 'success' : 'error',
					response: result,
					yield: {
						output: {
							type: 'message',
							response:
								result.status === 'MERGED'
									? `Sub-agent ${args.id} merged successfully`
									: `Sub-agent ${args.id} did not merge: ${result.error}`,
						},
					},
				};
			} catch (error) {
				return {
					status: 'error',
					response: error,
					yield: {
						output: {
							type: 'message',
							response: 'Sub agent failed',
						},
					},
				};
			}
		},
	},
	getCurrentWorkspace: {
		activity: {
			started: 'Checking the project workspace',
			completed: 'Checked the project workspace',
		},
		declaration: {
			name: 'getCurrentWorkspace',
			description:
				'Returns the current working directory of this agent so it can determine whether it is operating in the main repository or a worktree.',
			parametersJsonSchema: {
				type: 'object',
				properties: {},
			},
		} as FunctionDeclaration,
		executable: async (
			_args: Record<string, never>,
			context: ToolContext,
		): Promise<ToolResult> => {
			return {
				status: 'success',
				response: JSON.stringify({
					cwd: context.cwd,
					isWorktree: context.cwd.includes('/worktrees/'),
					workspaceName: context.cwd.split('/').pop(),
				}),
			};
		},
	},
} satisfies Record<string, AgentTool<any>>;
