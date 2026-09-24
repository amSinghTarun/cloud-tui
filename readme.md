# cloud-tui

Cloud TUI is a local-first terminal coding agent. It keeps project-scoped
sessions, coordinates isolated Git worktrees, asks before approval-gated
operations, and can turn implementation work into a visible task plan.

Product website: [tui-website.vercel.app](https://tui-website.vercel.app/)

## Install

Cloud TUI runs on Node.js 22.13 or newer. It can be installed from the npm
registry with npm, Yarn, pnpm, or Bun:

```bash
npm install -g cloud-tui
yarn global add cloud-tui
pnpm add -g cloud-tui
bun install -g cloud-tui
```

From the project directory you want Cloud TUI to use:

```bash
cloud-tui
```

For a one-off run without a global installation:

```bash
npx cloud-tui
bunx cloud-tui
```

## Project structure

```text
.
├── frontend/    # Ink / React terminal interface
├── source/      # Services, providers, data, tools, and shared config
├── release/     # Generated Node.js executable, created by bun run build
├── test/        # Bun-native TypeScript tests
└── package.json # Package, executable, and publishing configuration
```

## Development

This repository uses Bun for development:

```bash
bun install
bun run typecheck
bun test
bun run build
node release/cli.mjs
```

The published executable runs on Node.js. Bun is not required by people who
install and use the released package.

## Vertex AI with gcloud credentials

Cloud TUI supports Vertex AI without a Gemini API key. Enable the Vertex AI
API in your Google Cloud project, authenticate Application Default Credentials,
and launch the TUI with the project available in its environment:

```bash
gcloud services enable aiplatform.googleapis.com --project YOUR_PROJECT_ID
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
export GOOGLE_CLOUD_LOCATION=global
cloud-tui
```

Then run `/login` and select **Vertex AI**. The TUI stores only the project and
location locally; Google credentials remain managed by gcloud. Your account
needs a Vertex AI role such as `roles/aiplatform.user` on that project.

## In-app commands

| Command  | Action                             |
| -------- | ---------------------------------- |
| /model   | Select the active model            |
| /login   | Connect an AI provider             |
| /logout  | Remove saved provider credentials  |
| /status  | Show session and model information |
| /session | Open a saved workspace session     |
| /clear   | Clear the visible conversation     |
| /new     | Start a new local session          |
| /help    | Show the command reference in-app  |

Use Ctrl+L to clear the conversation and Ctrl+C to exit.

## Publishing

Before the first release, verify that the package name is available on npm or
replace cloud-tui with an available scoped name such as
@your-npm-account/cloud-tui. The command name remains cloud-tui because it is
defined by the bin field in package.json.

```bash
bun run typecheck
bun test
bun run build
bun publish --dry-run
bun publish --access public
```

Each publish needs a new version. For example:

```bash
bunx npm version patch
bun publish
```
