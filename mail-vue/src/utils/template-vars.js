// Variables a mail template can carry as {{name}}. Inserting a template in
// the compose window fills the ones it can know (recipient, sender, date);
// the rest stay as {{name}} and the send check asks before they go out.
export const TEMPLATE_VARIABLES = [
    { key: 'recipient_name', labelKey: 'tplVarRecipientName' },
    { key: 'author_name', labelKey: 'tplVarAuthorName' },
    { key: 'manuscript_title', labelKey: 'tplVarManuscriptTitle' },
    { key: 'journal_name', labelKey: 'tplVarJournalName' },
    { key: 'submission_id', labelKey: 'tplVarSubmissionId' },
    { key: 'editor_name', labelKey: 'tplVarEditorName' },
    { key: 'date', labelKey: 'tplVarDate' },
]

const VAR_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g

export function variableToken(key) {
    return `{{${key}}}`
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

// values: { key: plain text }. Keys without a non-empty value are left as is.
export function fillTemplateVariables(text, values, { html = false } = {}) {
    if (!text) return text
    return text.replace(VAR_PATTERN, (match, key) => {
        const value = values[key]
        if (value === undefined || value === null || value === '') return match
        return html ? escapeHtml(value) : String(value)
    })
}

// Known variables still present in the text, in template order.
export function unfilledVariables(text) {
    if (!text) return []
    const found = new Set([...text.matchAll(VAR_PATTERN)].map(m => m[1]))
    return TEMPLATE_VARIABLES.filter(v => found.has(v.key))
}
