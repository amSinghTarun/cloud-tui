import React, {useState} from 'react';
import {Box, Spacer, Text, useInput} from 'ink';
import { login, logout, setDefault } from "./services/index.js"
import { randomUUID } from 'node:crypto';
import { chat } from "./services/index.js"
import { getDefaultModel } from './db/index.js';

export const PROVIDERS_MODELS = new Map<string, [string, string][]>([
	["Anthropic", [["0", "claude-opus-4-7"], ["1", "claude-sonnet-4-6"], ["2", "claude-haiku-4-5"]]],
	["Gemini", [["0", "gemini-2.5-flash"], ["1", "gemini-2.7-flash"], ["2", "gemini-3.5-flash"]]],
]);

const PROVIDERS = Array.from(PROVIDERS_MODELS.keys());
const modelsFor = (p: string) => (PROVIDERS_MODELS.get(p) ?? []).map(([, name]) => name);
// const findProviderForModel = (m: string) =>
// 	PROVIDERS.find(p => modelsFor(p).includes(m)) ?? PROVIDERS[0]!;


const ACCENT = '#AAA7AD';

async function onSubmitInput(
	text: string,
	sessionId: string,
	setLog: React.Dispatch<React.SetStateAction<{type: string; message: string}[]>>,
	setInput: React.Dispatch<React.SetStateAction<string>>,
) {
	try {
		setLog(l => [...l, {type: "user", message: text}]);
		setInput(""); // Clear input immediately
		setLog(l => [...l, {type: 'model', message: ''}]); // Add an empty message for streaming
		let currentResponse = '';
		const {stream, finalHistoryPromise} = await chat(text, sessionId); // Destructure stream directly

		for await (const chunk of stream) { // Iterate directly over the string chunks
			currentResponse += chunk;
			setLog(l => {
				const newLog = [...l];
				newLog[newLog.length - 1] = {type: 'model', message: currentResponse};
				return newLog;
			});
		}
		await finalHistoryPromise; // Wait for the chat to complete and history to be finalized
	} catch (error: any) {
		setLog(l => [...l, {type: 'error', message: error.message.toUpperCase()}]);
	}
}

type Mode = 'input' | 'model' | 'login-provider' | 'login-key' | "logout";

function Welcome({model}: {model?: string}) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={ACCENT}
			flexGrow={1}

			paddingX={2}
			paddingY={0}
			marginBottom={1}
		>
			<Box>
				<Text color={ACCENT} bold>✻ </Text>
				<Text bold>Welcome to </Text>
				<Text color={ACCENT} bold>cloud-tui</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>  /help for help, /status for your current setup</Text>
			</Box>
			{ model && <Box>
				<Text dimColor>  model: </Text>
				<Text color={ACCENT}>{model}</Text>
			</Box> }
		</Box>
	);
}

function Tips() {
	return (
		<Box flexDirection="column" marginBottom={1} paddingX={1}>
			<Text dimColor>Tips for getting started:</Text>
			<Text dimColor>  1. Ask anything related to coding — be specific.</Text>
			<Text dimColor>  2. Use <Text color={ACCENT}>/model</Text> to switch models, <Text color={ACCENT}>/login</Text> to add API keys.</Text>
			<Text dimColor>  3. Be respectful. Peace.</Text>
		</Box>
	);
}

export default function App({sessionId}: {sessionId?: string}) {
	const [input, setInput] = useState('');
	const [textCursor, setTextCursor] = useState(0);
	// const [, setActiveProvider] = useState<string>(PROVIDERS[0]!);
	const [model, setModel] = useState(getDefaultModel());
	const [log, setLog] = useState<{type:string, message: string}[]>([]);
	const [mode, setMode] = useState<Mode>('input');
	const [cursor, setCursor] = useState(0);
	const [apiKey, setApiKey] = useState('');
	const [provider, setProvider] = useState<string | null>(null);
	const [keys, setKeys] = useState<Record<string, string>>({});

	const textColor = {
		model: ACCENT,
		info: "green",
		error: "red",
	}

	const MODELS = PROVIDERS.flatMap(p => modelsFor(p));

	if(!sessionId){
		sessionId = randomUUID()
	}

	useInput(async (char, key) => {
		if (mode === 'model') {
			if (key.upArrow) setCursor(c => (c - 1 + MODELS.length) % MODELS.length);
			else if (key.downArrow) setCursor(c => (c + 1) % MODELS.length);
			else if (key.return) {
				const chosen = MODELS[cursor]!;
				setModel(chosen);
				// setActiveProvider(findProviderForModel(chosen));
				setDefault(chosen)
				setLog(l => [...l, {type: "info", message: `Model switched to ${chosen}`}]);
				setMode('input');
			} else if (key.escape) setMode('input');
			return;
		}

		if (mode === 'login-provider') {
			if (key.upArrow) setCursor(c => (c - 1 + PROVIDERS.length) % PROVIDERS.length);
			else if (key.downArrow) setCursor(c => (c + 1) % PROVIDERS.length);
			else if (key.return) {
				setProvider(PROVIDERS[cursor]!);
				setApiKey('');
				setMode('login-key');
			} else if (key.escape) setMode('input');
			return;
		}

		if (mode === 'login-key') {
			if (key.return) {
				if (provider && apiKey.length > 0) {
					login(provider, apiKey)
					setKeys(k => ({...k, [provider]: apiKey}));
					setLog(l => [...l, {type: "info", message: `Saved API key for ${provider}`}]);
				}
				setApiKey('');
				setProvider(null);
				setMode('input');
			} else if (key.escape) {
				setApiKey('');
				setMode('login-provider');
			} else if (key.leftArrow) {
				setTextCursor(t => Math.max(0, t - 1));
			} else if (key.rightArrow) {
				setTextCursor(t => Math.min(apiKey.length, t + 1));
			} else if (key.backspace || key.delete) {
				setApiKey(prevApiKey => prevApiKey.slice(0, textCursor - 1) + prevApiKey.slice(textCursor));
				setTextCursor(prevTextCursor => Math.max(0, prevTextCursor - 1));
			} else if (char && !key.ctrl && !key.meta) {
				setApiKey(prevApiKey => prevApiKey.slice(0, textCursor) + char + prevApiKey.slice(textCursor));
				setTextCursor(prevTextCursor => prevTextCursor + 1);
			}
			return;
		}

		if (mode === 'logout') {
			if (key.upArrow) setCursor(c => (c - 1 + PROVIDERS.length) % PROVIDERS.length);
			else if (key.downArrow) setCursor(c => (c + 1) % PROVIDERS.length);
			else if (key.return) {
				const chosen = PROVIDERS[cursor]!;
				logout(chosen)
				setLog(l => [...l, {type: "info", message: `Logged out of ${chosen}`}]);
				setMode('input');
			} else if (key.escape) setMode('input');
			return;
		}

		if (key.return) {
			const text = input.trim();
			if (text === '/model') {
				setMode('model');
				setCursor(MODELS.indexOf(model));
			} else if (text === '/login') {
				setMode('login-provider');
				setCursor(0);
			} else if (text === '/logout') {
				setMode('logout');
				setCursor(0);
			} else if (text.length > 0) {
				await onSubmitInput(text, sessionId, setLog, setInput);
			}
			setInput('');
			setTextCursor(0);
		} else if (key.leftArrow) {
			setTextCursor(t => Math.max(0, t - 1));
		} else if (key.rightArrow) {
			setTextCursor(t => Math.min(input.length, t + 1));
		} else if (key.backspace || key.delete) {
			setInput(prevInput => prevInput.slice(0, textCursor - 1) + prevInput.slice(textCursor));
			setTextCursor(prevTextCursor => Math.max(0, prevTextCursor - 1));
		} else if (char && !key.ctrl && !key.meta) {
			setInput(prevInput => prevInput.slice(0, textCursor) + char + prevInput.slice(textCursor));
			setTextCursor(prevTextCursor => prevTextCursor + 1);
		}
	});

	return (
		<Box flexDirection="column" paddingX={1}>
			<Welcome model={model} />
			{log.length === 0 && <Tips />}

			{log.length > 0 && (
				<Box flexDirection="column" marginBottom={1} paddingX={1}>
					{log.map((line, i) => (
						<Box key={i} marginBottom={0}>
							{line.type === "user" ? (
								<Box
									flexGrow={1}
									borderStyle="round"
									borderColor={ACCENT}
									borderLeft={false}
									borderRight={false}
									flexDirection="column"
								>
									<Text bold >{line.message}</Text>
								</Box>
							) : (
								<Box paddingBottom={2}>
									<Text color={textColor[line.type as keyof typeof textColor]}>
										{line.type == "error" ? `ERROR: ${line.message}` :  line.message}
									</Text>
								</Box>
							)}
						</Box>
					))}
				</Box>
			)}

			{mode === 'model' ? (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={ACCENT}
					borderLeft={false}
					borderRight={false}

					paddingX={2}
					paddingY={0}
				>
					<Text bold>Select a model</Text>
					<Text dimColor>↑/↓ to navigate · Enter to select · Esc to cancel</Text>
					<Box marginTop={1} flexDirection="column">
						{MODELS.map((m, i) => (
							<Text key={m} color={i === cursor ? ACCENT : undefined} bold={i === cursor}>
								{i === cursor ? '❯ ' : '  '}
								{m}
							</Text>
						))}
					</Box>
				</Box>
			) : mode === 'logout' ? (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={ACCENT}
					borderLeft={false}
					borderRight={false}

					paddingX={2}
					paddingY={0}
				>
					<Text bold>Select a model</Text>
					<Text dimColor>↑/↓ to navigate · Enter to select · Esc to cancel</Text>
					<Box marginTop={1} flexDirection="column">
						{PROVIDERS.map((m, i) => (
							<Text key={m} color={i === cursor ? ACCENT : undefined} bold={i === cursor}>
								{i === cursor ? '❯ ' : '  '}
								{m}
							</Text>
						))}
					</Box>
				</Box>
			) : mode === 'login-provider' ? (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={ACCENT}
					borderLeft={false}
					borderRight={false}

					paddingX={2}
					paddingY={0}
				>
					<Text bold>Select a provider</Text>
					<Text dimColor>↑/↓ to navigate · Enter to select · Esc to cancel</Text>
					<Box marginTop={1} flexDirection="column">
						{PROVIDERS.map((p, i) => (
							<Box key={p}>
								<Text color={i === cursor ? ACCENT : undefined} bold={i === cursor}>
									{i === cursor ? '❯ ' : '  '}
									{p}
								</Text>
								{keys[p] && <Text color="green"> ✓</Text>}
							</Box>
						))}
					</Box>
				</Box>
			) : mode === 'login-key' ? (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={ACCENT}
					borderLeft={false}
					borderRight={false}

					paddingX={2}
					paddingY={0}
				>
					<Box>
						<Text bold>API key for </Text>
						<Text color={ACCENT} bold>{provider}</Text>
					</Box>
					<Text dimColor>Enter to save · Esc to go back</Text>
					<Box marginTop={1}>
						<Text color={ACCENT}>❯ </Text>
						<Text>{apiKey.slice(0, textCursor)}</Text>
						<Text inverse>{apiKey.slice(textCursor, textCursor + 1) || ' '}</Text>
						<Text>{apiKey.slice(textCursor + 1)}</Text>
					</Box>
				</Box>
			) : (
				<Box
					borderStyle="round"
					borderColor={ACCENT}
					
					borderLeft={false}
					borderRight={false}
					paddingX={1}
				>
					<Text color={ACCENT}>❯ </Text>
					<Text>{input.slice(0, textCursor)}</Text>
					<Text inverse>{input.slice(textCursor, textCursor + 1) || ' '}</Text>
					<Text>{input.slice(textCursor + 1)}</Text>
				</Box>
			)}

			<Box marginTop={1} paddingX={1}>
				<Spacer />
				<Text dimColor>model: </Text>
				<Text color={model ? ACCENT : "redBright"}>{model ?? "No default model set"}</Text>
			</Box>
		</Box>
	);
}

