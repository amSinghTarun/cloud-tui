import {FunctionDeclaration} from '@google/genai';
import {
	readdirSync,
	readFileSync,
	writeFileSync,
	unlinkSync,
	existsSync,
} from 'fs';

function errMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export let fileTools = [
	{
		id: '1',
		name: 'readDirectory',
		declaration: {
			name: 'readDirectory',
			description: 'List the files and folders in a directory.',
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
		executable: (args: {directoryPath: string}) => {
			try {
				const entries = readdirSync(args.directoryPath, {
					recursive: true,
				});
				return `Recursive list of Contents of ${args.directoryPath} : \n ${
					entries || '(empty)'
				}`;
			} catch (error) {
				return `Error reading directory: ${errMessage(error)}`;
			}
		},
	},
	{
		id: '2',
		name: 'readFileContent',
		declaration: {
			name: 'readFileContent',
			description: 'Read and return the full text content of a file.',
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
		executable: (args: {filePath: string}) => {
			try {
				const content = readFileSync(args.filePath, 'utf-8');
				return `Content of ${args.filePath} : \n ${content}`;
			} catch (error) {
				return `Error reading file: ${errMessage(error)}`;
			}
		},
	},
	{
		id: '3',
		name: 'createFile',
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
		executable: (args: {fileCreatePath: string}) => {
			try {
				// "wx" => create for writing, but fail if the path already exists.
				writeFileSync(args.fileCreatePath, '', {flag: 'wx'});
				return `Created empty file at ${args.fileCreatePath}`;
			} catch (error) {
				return `Error creating file: ${errMessage(error)}`;
			}
		},
	},
	{
		id: '4',
		name: 'deleteFile',
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
		executable: (args: {fileDeletePath: string}) => {
			try {
				unlinkSync(args.fileDeletePath);
				return `Deleted ${args.fileDeletePath}`;
			} catch (error) {
				return `Error deleting file: ${errMessage(error)}`;
			}
		},
	},
	{
		id: '5',
		name: 'updateFile',
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
		executable: (args: {
			filePath: string;
			content?: string;
			oldString?: string;
			newString?: string;
		}) => {
			try {
				if (typeof args.content === 'string') {
					writeFileSync(args.filePath, args.content, 'utf-8');
					return `Wrote ${args.content.length} characters to ${args.filePath}`;
				}

				if (typeof args.oldString === 'string') {
					if (!existsSync(args.filePath)) {
						return `Error: cannot edit ${args.filePath} because it does not exist.`;
					}
					const current = readFileSync(args.filePath, 'utf-8');
					const occurrences = current.split(args.oldString).length - 1;
					if (occurrences === 0) {
						return `Error: oldString was not found in ${args.filePath}. No changes made.`;
					}
					if (occurrences > 1) {
						return `Error: oldString matched ${occurrences} times in ${args.filePath}; it must be unique. No changes made.`;
					}

					const replacement = args.newString ?? '';
					const updated = current.replace(args.oldString, () => replacement);
					writeFileSync(args.filePath, updated, 'utf-8');
					return `Replaced 1 occurrence in ${args.filePath}`;
				}

				return `Error: provide either "content" (to overwrite) or "oldString"/"newString" (to replace).`;
			} catch (error) {
				return `Error updating file: ${errMessage(error)}`;
			}
		},
	},
];
