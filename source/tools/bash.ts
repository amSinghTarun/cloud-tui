import {type FunctionDeclaration} from '@google/genai';
import {AgentTool, ToolContext, ToolResult} from '../types';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {BLOCKED_RULES, APPROVAL_RULES} from '../helpers/tool';
import {AgentToolError, seekInput} from '../helpers';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

type CommandExecution = {
	exitCode: number | null;
	stderr: string;
	stdout: string;
};

const runBashCommand = (
	command: string,
	cwd: string,
	signal?: AbortSignal,
): Promise<CommandExecution> =>
	new Promise((resolve, reject) => {
		const child = spawn('bash', ['-c', command], {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';

		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', chunk => {
			stdout += chunk;
		});
		child.stderr.on('data', chunk => {
			stderr += chunk;
		});

		const abort = () => {
			child.kill('SIGTERM');
		};

		signal?.addEventListener('abort', abort, {once: true});
		child.once('error', error => {
			signal?.removeEventListener('abort', abort);
			reject(error);
		});
		child.once('close', exitCode => {
			signal?.removeEventListener('abort', abort);
			resolve({exitCode, stderr, stdout});
		});
	});

export const bashTools = {
	// in TUI this should hold the agent process, as we need to ask the user for conscent
	executeBash: {
		activity: {
			started: (args: {fullCommand: string}) =>
				` Running command ${args.fullCommand}`,
			completed: (args: {fullCommand: string}) =>
				`Running command ${args.fullCommand}`,
		},
		declaration: {
			name: 'executeBash',
			description:
				'Execute a Bash shell command inside the running project workspace container. Node.js and npm are available. On Alpine workspaces, Python may be installed with `apk add --no-cache python3 py3-pip` when needed.',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					fullCommand: {
						type: 'string',
						description:
							'The complete Bash command to execute, including all arguments and flags.',
					},
					cwd: {
						type: 'string',
						description:
							'Optional workspace-relative directory in which to execute the command.',
					},
				},
				required: ['fullCommand'],
				additionalProperties: false,
			},
		} as FunctionDeclaration,
		executable: async (
			args: {
				fullCommand: string;
				cwd?: string;
			},
			context: ToolContext,
		): Promise<ToolResult> => {
			const command = args.fullCommand.trim();

			if (!command) {
				throw new AgentToolError('Command cannot be empty.');
			}

			if (command.includes('\0')) {
				throw new AgentToolError('Command contains invalid null bytes.');
			}

			const resolvedRoot = resolve(context.cwd);
			const resolvedCwd = resolve(resolvedRoot, args.cwd ?? '.');
			const relativeCwd = relative(resolvedRoot, resolvedCwd);

			const escapesWorkspace =
				relativeCwd === '..' ||
				relativeCwd.startsWith(`..${sep}`) ||
				isAbsolute(relativeCwd);

			if (escapesWorkspace) {
				let error = new AgentToolError(
					'Command working directory is outside the project workspace.',
				);
				return {
					status: 'error',
					response: error,
				};
			}

			// classify the command as dangerous or normal
			let commandBlocked = BLOCKED_RULES.find(({pattern}) =>
				pattern.test(command),
			);
			if (commandBlocked) {
				let error = new AgentToolError(
					'The command is blocked as ' + commandBlocked.reason,
				);
				return {
					status: 'error',
					response: error,
				};
			}

			const approvalRule = APPROVAL_RULES.find(({pattern}) =>
				pattern.test(command),
			);
			if (approvalRule) {
				let uuid = randomUUID();
				const approval = seekInput<boolean>(uuid, context.signal);
				context.sendToUser({
					response: command,
					type: 'approval',
					uuid: uuid,
				});
				const isApproved = await approval;
				if (!isApproved) {
					let error = new AgentToolError(
						` Command rejected by user : ${command}`,
					);
					return {
						status: 'error',
						response: error,
					};
				}
			}

			// Execute through Node's child-process API so the published CLI can run
			// under Node regardless of which package manager installed it.
			const {stdout, stderr, exitCode} = await runBashCommand(
				command,
				resolvedCwd,
				context.signal,
			);

			if (exitCode !== 0) {
				return {
					status: 'error',
					response: {
						err: stderr.trim(),
						output: stdout.trim(),
						statusCode: `Command failed with exit code ${exitCode}`,
					},
				};
			}

			return {
				status: 'success',
				response: stdout,
			};
		},
	},
} satisfies Record<string, AgentTool<any>>;
