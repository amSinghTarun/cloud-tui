# Frontend, project identity, and session restoration

## What now works

The Ink frontend starts a chat session for the directory from which `cloud-tui`
is run. A later launch from the same physical directory restores the most
recent session for that workspace. `/session` opens a picker containing every
saved session for that workspace, while `/new` starts a fresh one. The agent
also restores its Gemini history, so it has the previous context even though
the TUI process itself was closed.

The frontend consumes typed `AgentChunk` events rather than raw strings. It
shows agent activity, handles shell-command approval, renders agent questions,
supports cancellation with `Ctrl+C`, and shows text-only conversation history
when a session is reopened.

## ID and storage design

`projectId` is not calculated from a hash. It is a UUID stored in the local
SQLite database. On startup the application calls `realpath(cwd)`, which
normalizes symlinks, then looks up that canonical path in the `projects` table:

```
canonical workspace path -> projects.canonical_path -> projects.id (projectId)
projectId + latest session -> sessions.id (sessionId)
agent run -> fresh in-memory UUID (runId)
```

This gives a stable project ID across restarts while keeping two separate
repositories distinct. A session belongs to exactly one project. `/new`
creates a new `sessionId` for the active project; `/session` lists and opens
any existing session for that project; and the next normal launch restores the
session most recently opened for that project.

The default local data directory is `~/.cloud_tui`:

- `db/main.db` holds projects, sessions, and the selected model.
- `project/sessions/<sessionId>-conversation.jsonl` holds Gemini `Content`
  records incrementally as they are produced.
- `project/sessions/<sessionId>-summary.txt` and the matching context folder
  hold compaction data.

`CLOUD_TUI_HOME` is an optional override for the local data directory. It is
useful for a sandbox, a portable installation, or a separate development
profile; ordinary users do not need to set it.

## Files changed and their responsibilities

| File                                  | Change                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/cli.tsx`                    | Restores the workspace session before rendering the Ink app and passes canonical path, project ID, and session ID to it.                                                                                                                                                                                                                                                         |
| `frontend/app.tsx`                    | Connects the UI to the agent service, restores visible text messages, handles `/new`, `/session`, `/status`, login/logout/model menus, streams agent chunks, and routes approval/input answers back to the waiting tool. The session picker updates the latest-opened session. The UI exposes Gemini only because it is the provider currently implemented by the agent service. |
| `frontend/components/empty-state.tsx` | Advertises the `/session` command from the welcome screen.                                                                                                                                                                                                                                                                                                                       |
| `frontend/components/composer.tsx`    | Adds current-agent activity, approval, and multi-question prompt components.                                                                                                                                                                                                                                                                                                     |
| `frontend/components/header.tsx`      | Shows whether the selected provider is actually connected.                                                                                                                                                                                                                                                                                                                       |
| `source/services/project.ts`          | Owns canonical workspace resolution plus project/session creation, restoration, and workspace-scoped session listing. This is where `projectId` is obtained.                                                                                                                                                                                                                     |
| `source/db/db.ts`                     | Adds `projects` and `sessions` SQLite tables and the functions that create, list, validate, reopen, and timestamp their IDs.                                                                                                                                                                                                                                                     |
| `source/services/agent.ts`            | Provides the frontend-facing chat API, lists and selects sessions, loads the connected Gemini API key, validates the model, opens the Gemini session, creates fresh sessions without retaining the previous in-memory cache, exposes restored text history, and forwards approval/input responses.                                                                               |
| `source/services/auth.ts`             | Adds API-key lookup and connected-provider status for the UI.                                                                                                                                                                                                                                                                                                                    |
| `source/providers/gemini.ts`          | Replaces constructor-only session setup with `GeminiAgent.open`, restores persisted Gemini history, stores only new history records after each model turn, preserves session configuration through compaction, and emits typed streaming events.                                                                                                                                 |
| `source/helpers/session.ts`           | Uses queued JSONL append/replace operations, supports legacy history migration, and correctly stores summaries and context artifacts inside the session directory.                                                                                                                                                                                                               |
| `source/helpers/path.ts`              | Centralizes the data paths and supports the optional `CLOUD_TUI_HOME` override.                                                                                                                                                                                                                                                                                                  |
| `source/helpers/agent.ts`             | Implements generic pending user input/approval promises and rejects them when the run is cancelled, so `Ctrl+C` cannot leave an agent hanging on a prompt.                                                                                                                                                                                                                       |
| `source/types/agent.ts`               | Defines the discriminated `AgentChunk` contract used by the agent loop and frontend.                                                                                                                                                                                                                                                                                             |
| `source/tools/bash.ts`                | Sends approval events to the UI and waits safely for a boolean response or cancellation before running an approval-gated command.                                                                                                                                                                                                                                                |
| `source/tools/input.ts`               | Defines a valid question schema and sends generic multi-question input events to the UI.                                                                                                                                                                                                                                                                                         |
| `source/config/models.ts`             | Retains the complete model catalog; unsupported providers are deliberately filtered from the current UI until their chat provider is implemented.                                                                                                                                                                                                                                |

## Verification performed

- `bun run typecheck` completes successfully.
- The TUI starts successfully with its normal rendering path.
- Two consecutive launches for the same workspace restored the same local
  session ID.

No tests were added or changed.
