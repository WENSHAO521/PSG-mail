// In-place translation (ai-mail-service.translateSegments): one output per
// input segment, original text kept wherever the model's answer is unusable.
import { describe, it, expect, vi, afterEach } from 'vitest';
import aiMailService from '../src/service/ai-mail-service';
import aiProviderService from '../src/service/ai-provider-service';

const ctx = { env: {}, get: () => undefined, set: () => {} };

afterEach(() => vi.restoreAllMocks());

describe('translateSegments', () => {
	it('maps translations back by position and skips empty segments', async () => {
		const run = vi.spyOn(aiProviderService, 'run').mockImplementation(async (c, u, task, body) => {
			const input = JSON.parse(body.messages[1].content);
			return { response: JSON.stringify(input.map(s => `T:${s}`)) };
		});
		const res = await aiMailService.translateSegments(ctx, 1, { segments: ['Hello', '', 'World'], targetLang: 'zh' });
		expect(res.segments).toEqual(['T:Hello', '', 'T:World']);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('keeps the original when the model returns garbage or too few items', async () => {
		vi.spyOn(aiProviderService, 'run').mockResolvedValue({ response: '```json\n["only one"]\n```' });
		const res = await aiMailService.translateSegments(ctx, 1, { segments: ['a', 'b'], targetLang: 'en' });
		expect(res.segments).toEqual(['only one', 'b']);
	});

	it('throws only when every batch failed', async () => {
		vi.spyOn(aiProviderService, 'run').mockRejectedValue(new Error('provider down'));
		await expect(aiMailService.translateSegments(ctx, 1, { segments: ['a'], targetLang: 'en' })).rejects.toThrow('provider down');
	});
});
