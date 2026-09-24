import path from 'node:path';
import {AgentToolError} from './error';

export const CONTEXT_ARTIFACT_PREFIX = '[SKY_CONTEXT_ARTIFACT:';

export const BLOCKED_RULES = [
	{
		pattern: /\brm\s+(?:-[^\s]*[rR][^\s]*\s+)?\/(?:\s|$)/,
		reason: 'Deleting the filesystem root is prohibited.',
	},
	{
		pattern: /\b(?:mkfs|shutdown|reboot|poweroff)\b/,
		reason: 'Commands that modify or shut down the host are prohibited.',
	},
	{
		pattern: /\b(?:curl|wget)\b.*\|\s*(?:sh|bash|zsh)\b/,
		reason: 'Executing a remotely downloaded script directly is prohibited.',
	},
];

export const APPROVAL_RULES = [
	{
		pattern: /\b(?:sudo|doas)\b/,
		reason: 'The command requests elevated privileges.',
	},
	{
		pattern: /\b(?:rm|rmdir)\b/,
		reason: 'The command deletes files or directories.',
	},
	{
		pattern: /\bgit\s+(?:reset|clean|push|rebase)\b/,
		reason:
			'The command performs a potentially destructive or remote Git operation.',
	},
	{
		pattern: /\b(?:bun|npm|pnpm|yarn)\s+(?:add|install|remove|uninstall)\b/,
		reason: 'The command changes project dependencies.',
	},
	{
		pattern: /\b(?:curl|wget|ssh|scp)\b/,
		reason: 'The command accesses an external system.',
	},
	{
		pattern: /(?:^|[^\\])(?:>|>>)/,
		reason: 'The command redirects output and may overwrite files.',
	},
];

export const SAFE_COMMANDS: readonly RegExp[] = [
	/^pwd$/,
	/^ls(?:\s|$)/,
	/^rg(?:\s|$)/,
	/^cat(?:\s|$)/,
	/^head(?:\s|$)/,
	/^tail(?:\s|$)/,
	/^git\s+(?:status|diff|log|show)(?:\s|$)/,
	/^bun\s+(?:test|run\s+(?:test|lint|typecheck|build))(?:\s|$)/,
];

export const resolveWorkspacePath = (cwd: string, relativePath: string) => {
	const workspace = path.resolve(cwd);
	const resolved = path.isAbsolute(relativePath)
		? path.resolve(relativePath)
		: path.resolve(workspace, relativePath);

	if (resolved !== workspace && !resolved.startsWith(workspace + path.sep)) {
		throw new AgentToolError('Path escapes workspace');
	}
	return resolved;
};
