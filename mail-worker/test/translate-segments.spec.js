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

	it('retries with numbered lines when the JSON has the wrong item count', async () => {
		const run = vi.spyOn(aiProviderService, 'run')
			.mockResolvedValueOnce({ response: '```json\n["only one"]\n```' })
			.mockResolvedValueOnce({ response: '[1] 甲\n[2] 乙' });
		const res = await aiMailService.translateSegments(ctx, 1, { segments: ['a', 'b'], targetLang: 'zh' });
		expect(res.segments).toEqual(['甲', '乙']);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('keeps the original for fragments the retry still misses', async () => {
		vi.spyOn(aiProviderService, 'run')
			.mockResolvedValueOnce({ response: 'garbage' })
			.mockResolvedValueOnce({ response: '[2] 乙' });
		const res = await aiMailService.translateSegments(ctx, 1, { segments: ['a', 'b'], targetLang: 'zh' });
		expect(res.segments).toEqual(['a', '乙']);
	});

	it('accepts a response Workers AI already parsed into an array', async () => {
		vi.spyOn(aiProviderService, 'run').mockResolvedValue({ response: ['你好', '世界'] });
		const res = await aiMailService.translateSegments(ctx, 1, { segments: ['Hello', 'World'], targetLang: 'zh' });
		expect(res.segments).toEqual(['你好', '世界']);
	});

	it('throws instead of returning the untouched original', async () => {
		vi.spyOn(aiProviderService, 'run').mockResolvedValue({ response: 'Sorry, I cannot help.' });
		await expect(aiMailService.translateSegments(ctx, 1, { segments: ['a', 'b'], targetLang: 'zh' })).rejects.toThrow();
	});

	it('throws only when every batch failed', async () => {
		vi.spyOn(aiProviderService, 'run').mockRejectedValue(new Error('provider down'));
		await expect(aiMailService.translateSegments(ctx, 1, { segments: ['a'], targetLang: 'en' })).rejects.toThrow('provider down');
	});
});
