import {realpath} from 'node:fs/promises';
import {
	createSession,
	getOrCreateProject,
	getOrCreateSession,
	listProjectSessions,
	type ProjectSession,
} from '../db';

export type WorkspaceSession = {
	canonicalPath: string;
	projectId: string;
	sessionId: string;
};

const resolveProject = async (cwd: string) => {
	const canonicalPath = await realpath(cwd);
	const projectId = getOrCreateProject(canonicalPath);
	return {canonicalPath, projectId};
};

export const restoreWorkspaceSession = async (
	cwd: string,
	sessionId?: string,
): Promise<WorkspaceSession> => {
	const project = await resolveProject(cwd);
	return {
		...project,
		sessionId: getOrCreateSession(project.projectId, sessionId),
	};
};

export const createWorkspaceSession = async (
	cwd: string,
): Promise<WorkspaceSession> => {
	const project = await resolveProject(cwd);
	return {
		...project,
		sessionId: createSession(project.projectId),
	};
};

export const listWorkspaceSessions = async (
	cwd: string,
): Promise<ProjectSession[]> => {
	const project = await resolveProject(cwd);
	return listProjectSessions(project.projectId);
};
