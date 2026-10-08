import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import aiMailService from '../service/ai-mail-service';

app.post('/translate', async (c) => {
	const { text, html, target_lang, segments } = await c.req.json();

	if (Array.isArray(segments)) {
		const data = await aiMailService.translateSegments(c, userContext.getUserId(c), {
			segments, targetLang: target_lang,
		});
		return c.json(result.ok({ segments: data.segments }));
	}

	const data = await aiMailService.translate(c, userContext.getUserId(c), {
		text, html, targetLang: target_lang,
	});
	return c.json(result.ok({
		translated_text: data.translatedText,
		original_text: data.originalText,
	}));
});
