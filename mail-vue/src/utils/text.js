export function getTextWidth(text, font = '14px sans-serif') {
    // 强制设置 Canvas 分辨率
    const canvas = document.createElement('canvas');
    canvas.width = 2000; // 足够大的画布
    canvas.style.width = '1000px'; // 避免 CSS 缩放影响
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    return ctx.measureText(text).width;
}

// One line naming who a draft or queued mail goes to. To comes first; a mail
// sent only to Cc/Bcc shows those, Bcc ones marked with the label passed in.
export function recipientSummary(mail, bccLabel = 'Bcc') {
    const to = [...(mail?.receiveEmail || []), ...(mail?.cc || [])];
    if (to.length) return to.join(', ');
    const bcc = mail?.bcc || [];
    return bcc.length ? `${bccLabel}: ${bcc.join(', ')}` : '';
}
