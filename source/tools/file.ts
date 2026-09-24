import {FunctionDeclaration} from '@google/genai';
import {
	readdirSync,
	readFileSync,
	writeFileSync,
	unlinkSync,
	existsSync,
	mkdirSync,
} from 'fs';
import {dirname, join, relative, sep} from 'node:path';
import {
	activityTarget,
	CONTEXT_ARTIFACT_PREFIX,
	resolveWorkspacePath,
	seekInput,
} from '../helpers';
import {AgentTool, ToolContext, ToolResult} from '../types';
import {randomUUID} from 'crypto';

const MAX_DIRECTORY_ENTRIES = 500;
const MAX_DIRECTORIES_TO_INSPECT = 10_000;
const MAX_FILE_CONTENT_CHARACTERS = 80_000;
const IGNORED_DIRECTORY_ENTRIES = new Set([
	'.git',
	'.next',
	'.pnpm-store',
	'.turbo',
	'.yarn',
	'node_modules',
]);

export let fileTools = {
	readDirectory: {
		activity: {
			started: (args: {directoryPath: string}) =>
				`Inspecting project files ${activityTarget(args.directoryPath)}`,
			completed: (args: {directoryPath: string}) =>
				`Inspected project files ${activityTarget(args.directoryPath)}`,
		},
		declaration: {
			name: 'readDirectory',
			description:
				'Recursively list the files and folders under a project directory. Dependency, VCS, and build-cache folders (.git, node_modules, .next, .yarn, .pnpm-store, and .turbo) are skipped. Use executeBash with rg --files or find when you need to locate an exact filename.',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					directoryPath: {
						type: 'string',
						description:
							'Path to the directory, relative to the project root. Use "." for the root.',
					},
				},
				required: ['directoryPath'],
			},
		} as FunctionDeclaration,
		executable: (
			args: {directoryPath: string},
			context: ToolContext,
		): ToolResult => {
			try {
				if (!args.directoryPath) {
					return {
						status: 'error',
						response: 'No directory path provided',
					};
				}
				const directoryPath = resolveWorkspacePath(
					context.cwd,
					args.directoryPath,
				);

				const directories = [directoryPath];
				const entries: Array<{path: string; type: 'directory' | 'file'}> = [];
				let inspectedDirectories = 0;

				while (
					directories.length > 0 &&
					entries.length < MAX_DIRECTORY_ENTRIES &&
					inspectedDirectories < MAX_DIRECTORIES_TO_INSPECT
				) {
					const currentDirectory = directories.shift()!;
					inspectedDirectories++;
					let currentEntries;
					try {
						currentEntries = readdirSync(currentDirectory, {
							encoding: 'utf-8',
							withFileTypes: true,
						}).sort((left, right) => left.name.localeCompare(right.name));
					} catch {
						continue;
					}

					for (const entry of currentEntries) {
						if (IGNORED_DIRECTORY_ENTRIES.has(entry.name)) continue;
						const entryPath = join(currentDirectory, entry.name);
						entries.push({
							path: relative(directoryPath, entryPath).split(sep).join('/'),
							type: entry.isDirectory() ? 'directory' : 'file',
						});
						if (entry.isDirectory()) directories.push(entryPath);
						if (entries.length === MAX_DIRECTORY_ENTRIES) break;
					}
				}

				return {
					status: 'success',
					response: {
						entries,
						inspectedDirectories,
						...(directories.length > 0
							? {
								truncated: true,
								message:
									'Directory listing reached its safety limit. Inspect a specific subdirectory for more detail.',
							}
							: {}),
					},
				};
			} catch (error) {
				return {
					status: 'error',
					response: `${error}`,
				};
			}
		},
	},
	readFileContent: {
		activity: {
			started: (args: {filePath: string}) =>
				`Reading project file: ${activityTarget(args.filePath)}`,
			completed: (args: {filePath: string}) =>
				`Inspected project file: ${activityTarget(args.filePath)}`,
		},
		declaration: {
			name: 'readFileContent',
			description:
				'Read a text file. Very large files are truncated to keep the conversation usable; prefer focused source and configuration files.',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					filePath: {
						type: 'string',
						description: 'Path to the file, relative to the project root.',
					},
				},
				required: ['filePath'],
			},
		} as FunctionDeclaration,
		executable: (
			args: {filePath: string},
			context: ToolContext,
		): ToolResult => {
			try {
				if (!args.filePath) {
					return {
						status: 'error',
						response: 'File path not provided ' + args.filePath,
					};
				}
				const readFilePath = resolveWorkspacePath(context.cwd, args.filePath);
				if (!existsSync(readFilePath)) {
					return {
						status: 'error',
						response: 'No file present at ' + args.filePath,
					};
				}
				const fileContent = readFileSync(readFilePath, {encoding: 'utf-8'});
				return {
					status: 'success',
					response:
						fileContent.length > MAX_FILE_CONTENT_CHARACTERS
							? `${fileContent.slice(0, MAX_FILE_CONTENT_CHARACTERS)}\n\n[File output truncated after ${MAX_FILE_CONTENT_CHARACTERS} characters.]`
							: fileContent,
				};
			} catch (error) {
				return {
					status: 'error',
					response: error,
				};
			}
		},
	},
	createFile: {
		activity: {
			started: (args: {fileCreatePath: string}) =>
				`Creating the file at ${args.fileCreatePath}`,
			completed: (args: {fileCreatePath: string}) =>
				`Created the file at ${args.fileCreatePath}`,
		},
		declaration: {
			name: 'createFile',
			description:
				'Create a new, empty file. Fails if the file already exists. Use updateFile to write content into it.',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					fileCreatePath: {
						type: 'string',
						description: 'Path for the new file, relative to the project root.',
					},
				},
				required: ['fileCreatePath'],
			},
		} as FunctionDeclaration,
		executable: (
			args: {fileCreatePath: string},
			context: ToolContext,
		): ToolResult => {
			try {
				if (!args.fileCreatePath) {
					return {
						status: 'error',
						response: 'fileCreatePath is empty',
					};
				}
				const createPath = resolveWorkspacePath(
					context.cwd,
					args.fileCreatePath,
				);
				mkdirSync(dirname(createPath), {recursive: true});
				writeFileSync(createPath, '', {flag: 'wx'});
				return {
					status: 'success',
					response: `Created file: ${args.fileCreatePath}`,
				};
			} catch (error) {
				return {
					response: error,
					status: 'error',
				};
			}
		},
	},
	deleteFile: {
		activity: {
			started: (args: {fileDeletePath: string}) =>
				`deleting file : ${args.fileDeletePath}`,
			completed: (args: {fileDeletePath: string}) =>
				`deleted file : ${args.fileDeletePath}`,
		},
		declaration: {
			name: 'deleteFile',
			description: 'Delete the file at the specified path.',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					fileDeletePath: {
						type: 'string',
						description:
							'Path to the file to delete, relative to the project root.',
					},
				},
				required: ['fileDeletePath'],
			},
		} as FunctionDeclaration,
		executable: async (
			args: {fileDeletePath: string},
			context: ToolContext,
		): Promise<ToolResult> => {
			try {
				if (!args.fileDeletePath) {
					return {
						status: 'error',
						response: 'No path provided to delete',
					};
				}
				const deletePath = resolveWorkspacePath(
					context.cwd,
					args.fileDeletePath,
				);
				const uuid = randomUUID();
				const approval = seekInput<boolean>(uuid, context.signal);
				context.sendToUser({
					type: 'approval',
					response: deletePath,
					uuid: uuid,
				});
				const isApproved = await approval;
				if (!isApproved)
					return {
						status: 'error',
						response: 'File deletion rejected by the user',
					};
				unlinkSync(deletePath);
				return {
					status: 'success',
					response: 'File deleted: ' + deletePath,
				};
			} catch (error) {
				return {
					status: 'error',
					response: error,
				};
			}
		},
	},
	updateFile: {
		activity: {
			started: (args: {filePath: string}) => `Updating file : ${args.filePath}`,
			completed: (args: {filePath: string}) =>
				`Updated file : ${args.filePath}`,
		},
		declaration: {
			name: 'updateFile',
			description:
				"Update a file's contents. Provide `content` to overwrite the whole file, OR `oldString` and `newString` to replace a specific snippet. When replacing, `oldString` must appear exactly once in the file.",
			parametersJsonSchema: {
				type: 'object',
				properties: {
					filePath: {
						type: 'string',
						description:
							'Path to the file to update, relative to the project root.',
					},
					content: {
						type: 'string',
						description:
							'New full contents of the file. Overwrites everything. Use this for new or fully-rewritten files.',
					},
					oldString: {
						type: 'string',
						description:
							'Exact snippet to find and replace. Must match exactly once. Ignored if `content` is provided.',
					},
					newString: {
						type: 'string',
						description: 'Replacement text for `oldString`.',
					},
				},
				required: ['filePath'],
			},
		} as FunctionDeclaration,
		executable: (
			args: {
				filePath: string;
				content?: string;
				oldString?: string;
				newString?: string;
			},
			context: ToolContext,
		): ToolResult => {
			try {
				if (!args.filePath)
					return {
						response: 'No filepath provided',
						status: 'error',
					};
				const updatePath = resolveWorkspacePath(context.cwd, args.filePath);
				if (!existsSync(updatePath))
					return {
						status: 'error',
						response: `Error: cannot edit ${args.filePath} because it does not exist.`,
					};

				if (
					typeof args.content === 'string' &&
					args.content.includes(CONTEXT_ARTIFACT_PREFIX)
				)
					return {
						status: 'error',
						response:
							'Error: refused to write a context-artifact reference into application source. Use readContextArtifact for historical content or readFileContent for the current file, then provide real source code.',
					};

				if (typeof args.content === 'string') {
					writeFileSync(updatePath, args.content, 'utf-8');
					return {
						status: 'success',
						response: `Wrote file: ${args.filePath}`,
					};
				}

				if (typeof args.oldString == 'string') {
					const current = readFileSync(updatePath, 'utf-8');
					const oldStringIsUnique = current.split(args.oldString).length - 1;

					if (oldStringIsUnique == 0)
						return {
							status: 'error',
							response: `Error: oldString was not found in ${args.filePath}. No changes made.`,
						};

					if (oldStringIsUnique > 1)
						return {
							status: 'error',
							response: `Error: oldString matched ${oldStringIsUnique} times in ${args.filePath}; it must be unique. No changes made.`,
						};

					const replacement = args.newString ?? '';
					const updated = current.replace(args.oldString, () => replacement);

					writeFileSync(updatePath, updated, 'utf-8');

					return {
						response: `Replaced 1 occurrence in ${args.filePath}`,
						status: 'success',
					};
				}

				return {
					response: 'Provide content or oldString to update a file.',
					status: 'error',
				};
			} catch (error) {
				return {
					status: 'error',
					response: error,
				};
			}
		},
	},
} satisfies Record<string, AgentTool<any>>;
