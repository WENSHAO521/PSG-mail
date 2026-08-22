import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import aiMailService from '../service/ai-mail-service';

app.post('/translate', async (c) => {
	const { text, html, source_lang, target_lang } = await c.req.json();

	const data = await aiMailService.translate(c, userContext.getUserId(c), {
		text, html, sourceLang: source_lang, targetLang: target_lang,
	});
	return c.json(result.ok({
		translated_text: data.translatedText,
		original_text: data.originalText,
	}));
});
