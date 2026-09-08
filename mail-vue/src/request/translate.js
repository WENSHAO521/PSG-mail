import http from '@/axios/index.js';

export function translateEmail({ text, html, target_lang }) {
    return http.post('/translate', { text, html, target_lang }, { noMsg: true });
}
