// In-place translation (ai-mail-service.translateSegments): one output per
// input segment, original text kept wherever the model's answer is unusable.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import aiMailService from '../src/service/ai-mail-service';
import aiProviderService from '../src/service/ai-provider-service';
import translateService from '../src/service/translate-service';

const ctx = { env: {}, get: () => undefined, set: () => {} };

afterEach(() => vi.restoreAllMocks());

describe('translateSegments (AI engine)', () => {
	beforeEach(() => vi.spyOn(translateService, 'provider').mockResolvedValue({ provider: 'ai', key: '' }));

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

describe('translateSegments (Google engine)', () => {
	it('sends every segment to the keyless endpoint and maps them back in order', async () => {
		vi.spyOn(translateService, 'provider').mockResolvedValue({ provider: 'google', key: '' });
		const ai = vi.spyOn(aiProviderService, 'run');
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
			expect(String(url)).toContain('tl=zh-CN');
			const qs = new URLSearchParams(init.body).getAll('q');
			return new Response(JSON.stringify(qs.map(q => [`T:${q}`, 'en'])), { status: 200 });
		});
		const res = await aiMailService.translateSegments(ctx, 1, { segments: ['Hello', '', 'World'], targetLang: 'zh' });
		expect(res.segments).toEqual(['T:Hello', '', 'T:World']);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(ai).not.toHaveBeenCalled();
	});

	it('uses the Cloud Translation API when a key is set', async () => {
		vi.spyOn(translateService, 'provider').mockResolvedValue({ provider: 'google', key: 'k1' });
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
			expect(String(url)).toContain('key=k1');
			const { q, target } = JSON.parse(init.body);
			expect(target).toBe('en');
			return new Response(JSON.stringify({ data: { translations: q.map(s => ({ translatedText: `E:${s} &amp;` })) } }), { status: 200 });
		});
		const res = await aiMailService.translateSegments(ctx, 1, { segments: ['你好'], targetLang: 'en' });
		expect(res.segments).toEqual(['E:你好 &']);
	});

	it('throws when Google rejects every request', async () => {
		vi.spyOn(translateService, 'provider').mockResolvedValue({ provider: 'google', key: '' });
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('busy', { status: 429 }));
		await expect(aiMailService.translateSegments(ctx, 1, { segments: ['a'], targetLang: 'zh' })).rejects.toThrow('429');
	});
});

describe('translateService.provider', () => {
	const settingService = () => import('../src/service/setting-service');
	const db = (row) => ({ env: { db: { prepare: () => ({ bind: () => ({ first: async () => row }) }) } } });

	it("uses the user's own engine and key over the admin default", async () => {
		vi.spyOn((await settingService()).default, 'query').mockResolvedValue({ translateProvider: 'google', googleTranslateKey: 'admin' });
		expect(await translateService.provider(db({ translate_provider: 'ai', google_translate_key: 'mine' }), 1))
			.toEqual({ provider: 'ai', key: 'mine' });
	});

	it('falls back to the admin default when the user has no preference', async () => {
		vi.spyOn((await settingService()).default, 'query').mockResolvedValue({ translateProvider: 'ai', googleTranslateKey: 'admin' });
		expect(await translateService.provider(db({ translate_provider: '', google_translate_key: '' }), 1))
			.toEqual({ provider: 'ai', key: 'admin' });
		expect(await translateService.provider(db(null), 1)).toEqual({ provider: 'ai', key: 'admin' });
	});
});
