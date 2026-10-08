import http from '@/axios/index.js';

export function translateEmail({ text, html, target_lang }) {
    return http.post('/translate', { text, html, target_lang }, { noMsg: true });
}

// In-place translation: one translated string per input segment, same order.
export function translateSegments({ segments, target_lang }) {
    return http.post('/translate', { segments, target_lang }, { noMsg: true, timeout: 120000 });
}
