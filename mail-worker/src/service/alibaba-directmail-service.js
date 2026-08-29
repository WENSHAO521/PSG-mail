// Minimal hand-rolled SMTP client for Alibaba Cloud DirectMail
// (阿里云邮件推送), spoken over Cloudflare Workers' native TCP Sockets API
// (`cloudflare:sockets`). This exists only because DirectMail's classic
// endpoint is raw SMTPS, not an HTTP API like Resend/Mailjet/Cloudflare
// Email — there is no Workers-compatible SMTP library (`nodemailer` depends
// on Node's `net`/`tls`, which Workers doesn't provide), so this file is the
// entire client: connect, AUTH LOGIN, MAIL FROM/RCPT TO/DATA, and just
// enough MIME construction for a two-part (text+html) notification email.
//
// v1 is hardcoded to Alibaba's 华东1(杭州) DirectMail endpoint. Do not turn
// this into a per-tenant configurable host/port — a misconfigured host for
// a different Alibaba region is exactly what fixing these constants
// prevents (see migration 0008's comment).
import { connect } from 'cloudflare:sockets';

const ALIBABA_SMTP_HOST = 'smtpdm.aliyun.com';
const ALIBABA_SMTP_PORT = 465;
const ALIBABA_REGION_ID = 'cn-hangzhou';
const ALIBABA_REGION_LABEL = '华东1（杭州）';

const CONNECT_TIMEOUT_MS = 10000;
const COMMAND_TIMEOUT_MS = 10000;

class AlibabaSmtpError extends Error {
	constructor(message, { retryable = false, code = null } = {}) {
		super(message);
		this.name = 'AlibabaSmtpError';
		this.retryable = retryable;
		this.code = code;
	}
}

function withTimeout(promise, ms, message) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new AlibabaSmtpError(message, { retryable: true })), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// 4xx = transient (server temporarily unable, retry later), 5xx = permanent
// (bad credentials, unknown recipient, rejected sender) — matches the
// "retry timeouts/connection errors, don't retry invalid credentials/invalid
// recipient" requirement without needing a per-command exception list.
function isRetryableCode(code) {
	return code >= 400 && code < 500;
}

function utf8ToBase64(str) {
	const bytes = new TextEncoder().encode(String(str ?? ''));
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function encodeMimeHeaderWord(value) {
	const str = String(value ?? '');
	if (/^[\x20-\x7e]*$/.test(str)) return str;
	return `=?UTF-8?B?${utf8ToBase64(str)}?=`;
}

function formatAddress(name, email) {
	return name ? `${encodeMimeHeaderWord(name)} <${email}>` : `<${email}>`;
}

function toBase64Lines(str) {
	const base64 = utf8ToBase64(str);
	const lines = [];
	for (let i = 0; i < base64.length; i += 76) {
		lines.push(base64.slice(i, i + 76));
	}
	return lines.length ? lines.join('\r\n') : '';
}

// multipart/alternative, base64 Content-Transfer-Encoding on both parts.
// Base64's alphabet never produces a line starting with ".", so SMTP DATA's
// dot-stuffing rule needs no extra handling — nor do the header/boundary
// lines, since none of those are ever constructed starting with ".".
function buildMimeMessage({ fromName, fromEmail, to, subject, text, html }) {
	const boundary = `psgmail-${crypto.randomUUID().replace(/-/g, '')}`;
	const domain = fromEmail.split('@')[1] || 'psgmail.local';
	const messageId = `<${crypto.randomUUID()}@${domain}>`;

	const headers = [
		`From: ${formatAddress(fromName, fromEmail)}`,
		`To: <${to}>`,
		`Subject: ${encodeMimeHeaderWord(subject)}`,
		`Date: ${new Date().toUTCString()}`,
		`Message-ID: ${messageId}`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/alternative; boundary="${boundary}"`,
	];

	const parts = [];
	if (text) {
		parts.push([
			`--${boundary}`,
			'Content-Type: text/plain; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			toBase64Lines(text),
		].join('\r\n'));
	}
	if (html) {
		parts.push([
			`--${boundary}`,
			'Content-Type: text/html; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			toBase64Lines(html),
		].join('\r\n'));
	}
	parts.push(`--${boundary}--`);

	return [headers.join('\r\n'), '', parts.join('\r\n')].join('\r\n');
}

// Buffered line reader over the raw byte stream: one read() from the
// underlying TCP stream has no fixed relationship to SMTP reply
// boundaries — a reply can arrive split across reads, or several replies
// coalesced into one — so replies are assembled line-by-line and only
// consumed once a terminal line is seen. A multi-line reply looks like
// "250-A\r\n250-B\r\n250 C\r\n" (dash = continuation, space = final line).
class SmtpLineReader {
	constructor(readable) {
		this.reader = readable.getReader();
		this.decoder = new TextDecoder();
		this.buffer = '';
	}

	async readReply() {
		const lines = [];
		while (true) {
			const newlineIndex = this.buffer.indexOf('\r\n');
			if (newlineIndex === -1) {
				const { value, done } = await this.reader.read();
				if (done) throw new AlibabaSmtpError('SMTP connection closed unexpectedly', { retryable: true });
				this.buffer += this.decoder.decode(value, { stream: true });
				continue;
			}
			const line = this.buffer.slice(0, newlineIndex);
			this.buffer = this.buffer.slice(newlineIndex + 2);
			if (!line) continue;
			lines.push(line);
			if (!/^\d{3}-/.test(line)) {
				const code = Number(line.slice(0, 3));
				return { code, lines, raw: lines.join('\n') };
			}
		}
	}

	async close() {
		try { await this.reader.cancel(); } catch { /* already closed */ }
	}
}

class SmtpConnection {
	constructor(socket) {
		this.socket = socket;
		this.writer = socket.writable.getWriter();
		this.reader = new SmtpLineReader(socket.readable);
		this.encoder = new TextEncoder();
	}

	async writeLine(line) {
		await withTimeout(this.writer.write(this.encoder.encode(line + '\r\n')), COMMAND_TIMEOUT_MS, 'SMTP 命令发送超时');
	}

	async writeRaw(bytes) {
		await withTimeout(this.writer.write(bytes), COMMAND_TIMEOUT_MS, 'SMTP 数据发送超时');
	}

	async expect(expectedCodes) {
		const reply = await withTimeout(this.reader.readReply(), COMMAND_TIMEOUT_MS, 'SMTP 响应超时');
		const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
		if (!codes.includes(reply.code)) {
			throw new AlibabaSmtpError(`SMTP 错误: ${reply.raw}`, { retryable: isRetryableCode(reply.code), code: reply.code });
		}
		return reply;
	}

	async command(line, expectedCodes) {
		await this.writeLine(line);
		return this.expect(expectedCodes);
	}

	async quit() {
		try { await this.writeLine('QUIT'); } catch { /* best effort */ }
		try { this.writer.releaseLock(); } catch { /* already released */ }
		await this.reader.close();
		try { this.socket.close(); } catch { /* already closed */ }
	}
}

async function openConnection({ host, port, username, password }) {
	let socket;
	try {
		socket = connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false });
		await withTimeout(socket.opened, CONNECT_TIMEOUT_MS, '连接阿里云 SMTP 服务器超时');
	} catch (error) {
		if (error instanceof AlibabaSmtpError) throw error;
		throw new AlibabaSmtpError(`连接阿里云 SMTP 服务器失败: ${error?.message || error}`, { retryable: true });
	}

	const conn = new SmtpConnection(socket);
	await conn.expect(220);
	await conn.command('EHLO psgmail', 250);
	await conn.command('AUTH LOGIN', 334);
	await conn.command(utf8ToBase64(username), 334);
	await conn.command(utf8ToBase64(password), 235);
	return conn;
}

// SMTP handshake + auth only, no message sent — for the settings page's
// "测试连接" button.
async function testConnection({ host = ALIBABA_SMTP_HOST, port = ALIBABA_SMTP_PORT, username, password }) {
	if (!username || !password) throw new AlibabaSmtpError('阿里云邮件推送 SMTP 未配置', { retryable: false });
	const conn = await openConnection({ host, port, username, password });
	await conn.quit();
	return true;
}

// Sends one email through Alibaba DirectMail SMTP. `fromEmail` defaults to
// the authenticated 发信地址 (`username`) — DirectMail requires MAIL FROM to
// be a verified sending address in the console, which is exactly what the
// SMTP username already is.
async function sendMail({ host = ALIBABA_SMTP_HOST, port = ALIBABA_SMTP_PORT, username, password, fromName, fromEmail }, { to, subject, text, html }) {
	if (!username || !password) throw new AlibabaSmtpError('阿里云邮件推送 SMTP 未配置', { retryable: false });
	const sender = fromEmail || username;
	const conn = await openConnection({ host, port, username, password });
	try {
		await conn.command(`MAIL FROM:<${sender}>`, 250);
		await conn.command(`RCPT TO:<${to}>`, [250, 251]);
		await conn.command('DATA', 354);
		const mimeMessage = buildMimeMessage({ fromName, fromEmail: sender, to, subject, text, html });
		await conn.writeRaw(new TextEncoder().encode(`${mimeMessage}\r\n.\r\n`));
		const reply = await conn.expect(250);
		return { messageId: reply.raw.slice(0, 200) };
	} finally {
		await conn.quit();
	}
}

// Exported (in addition to the default export below) purely so unit tests
// can exercise the pure MIME-building logic without opening a real TCP
// socket — cloudflare:sockets can't be driven from a unit test in isolation.
export { buildMimeMessage };

export default {
	ALIBABA_SMTP_HOST,
	ALIBABA_SMTP_PORT,
	ALIBABA_REGION_ID,
	ALIBABA_REGION_LABEL,
	AlibabaSmtpError,
	testConnection,
	sendMail,
};
