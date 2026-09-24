export const PROVIDERS_MODELS = new Map<string, Array<[string, string]>>([
	[
		'Anthropic',
		[
			['0', 'claude-opus-4-7'],
			['1', 'claude-sonnet-4-6'],
			['2', 'claude-haiku-4-5'],
		],
	],
	[
		'Gemini',
		[
			['0', 'gemini-2.5-flash'],
			['1', 'gemini-2.7-flash'],
			['2', 'gemini-3.5-flash'],
		],
	],
	['Vertex AI', [['0', 'gemini-2.5-flash']]],
]);
