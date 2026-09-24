import {fileTools} from './file';
import {agentTools} from './agent';
import {bashTools} from './bash';
import {contextTools} from './context';
import {inputTools} from './input';
import {taskTools} from './task';

export const toolNames = new Set<string>([
	...Object.keys(fileTools),
	...Object.keys(agentTools),
	...Object.keys(bashTools),
	...Object.keys(contextTools),
	...Object.keys(inputTools),
	...Object.keys(taskTools),
]);

export const tools = {
	...fileTools,
	...agentTools,
	...bashTools,
	...contextTools,
	...inputTools,
	...taskTools,
};

export * from './file';
export * from './agent';
export * from './bash';
export * from './context';
export * from './input';
export * from './task';
