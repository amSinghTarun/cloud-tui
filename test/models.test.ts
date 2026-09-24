import {expect, test} from 'bun:test';
import {PROVIDERS_MODELS} from '../source/config/models';

test('defines the supported frontend providers', () => {
	expect([...PROVIDERS_MODELS.keys()]).toEqual([
		'Anthropic',
		'Gemini',
		'Vertex AI',
	]);
});
