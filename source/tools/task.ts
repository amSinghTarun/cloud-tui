import {type FunctionDeclaration} from '@google/genai';
import {AgentTool, ToolContext, ToolResult} from '../types';

// parsePlanTasks
// create this fnc

export const taskTools = {
	// in TUI this should hold the agent process, as we need to ask the user for conscent
	addTasksToPlan: {
		activity: {
			started: 'Planning the implementation steps',
			completed: 'Planned the implementation steps',
		},
		declaration: {
			name: 'addTasksToPlan',
			description:
				'Plan how to execute task, break it into smaller tasks and create a list of steps to complete the task given given by user',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					taskList: {
						minItems: 3,
						maxItems: 6,
						type: 'array',
						description:
							'Three to six outcome-oriented implementation steps in execution order.',
						items: {
							type: 'object',
							properties: {
								id: {
									type: 'string',
									description: 'Stable short identifier for the step.',
								},
								task: {
									type: 'string',
									description: 'Concrete implementation outcome for the step.',
								},
							},
							required: ['id', 'task'],
						},
					},
				},
				required: ['taskList'],
			},
		} as FunctionDeclaration,
		executable: (
			args: {taskList: Array<{id: string; task: string}>},
			context: ToolContext,
		): ToolResult => {
			try {
				let {tasks, message} = context.taskList.add(args.taskList);

			return {
				status: 'success',
				response: `Plan updated. ${message}`,
					...(tasks.length > 0 && {
						yield: {
							output: {
								type: 'taskList',
								response: tasks,
							},
						},
					}),
				};
			} catch (error) {
				return {
					status: 'error',
					response: error,
				};
			}
		},
	},
	informCompletedTaskFromTaskPlan: {
		activity: {
			started: 'Finishing an implementation step',
			completed: 'Finished an implementation step',
		},
		declaration: {
			name: 'informCompletedTaskFromTaskPlan',
			description:
				'call this tool to notify user of the task you accomplished in the task list you provided in createTaskPlan',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'id of the task from the task list you accomplished',
					},
				},
				required: ['id'],
			},
		} as FunctionDeclaration,
		// Emits the model's claim that one planned implementation outcome is complete.
		// The executable returns the claimed ID, then applyTaskPlanToolCall checks it against active plan state.
		// Valid claims update the completion set; unknown IDs are rejected and explained back to Gemini.
		executable: (args: {id: string}, context: ToolContext): ToolResult => {
			let completed = context.taskList.markComplete(args.id);

			return {
				status: completed.completed ? 'success' : 'error',
				response: completed.message,
				...(completed.completed && {
					yield: {
						output: {
							type: 'taskComplete',
							response: completed.id,
						},
					},
				}),
			};
		},
	},
} satisfies Record<string, AgentTool<any>>;
