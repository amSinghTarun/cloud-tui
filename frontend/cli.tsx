import React from 'react';
import {render} from 'ink';
import {createWorkspaceSession} from '../source/services';
import App from './app';

// Every launch begins with a clean conversation. Existing conversations remain
// available through /session rather than being resumed implicitly.
const workspace = await createWorkspaceSession(process.cwd());
const app = render(
	<App
		cwd={workspace.canonicalPath}
		projectId={workspace.projectId}
		sessionId={workspace.sessionId}
	/>,
	{exitOnCtrlC: false},
);

await app.waitUntilExit();
