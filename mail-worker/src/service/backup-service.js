import secretBox from '../utils/secret-box';
import orm from '../entity/orm';
import { cloudBackup } from '../entity/cloud-backup';
import { email } from '../entity/email';
import { and, eq, asc, gt } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import dayjs from 'dayjs';

const PROVIDERS = {
	google: {
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		scope: 'https://www.googleapis.com/auth/drive.file',
	},
	microsoft: {
		authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
		tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		scope: 'files.readwrite offline_access',
	},
};

const STATE_TTL = 300; // 5 minutes

const backupService = {

	_clientId(c, provider) {
		return provider === 'google' ? c.env.google_client_id : c.env.microsoft_client_id;
	},

	_clientSecret(c, provider) {
		return provider === 'google' ? c.env.google_client_secret : c.env.microsoft_client_secret;
	},

	_redirectUri(c, provider) {
		const origin = new URL(c.req.url).origin;
		return `${origin}/backup/oauth/${provider}/callback`;
	},

	_stateKey(userId, provider) {
		return `backup_oauth_state:${userId}:${provider}`;
	},

	// ── OAuth: generate authorization URL ────────────────────────
	async getAuthUrl(c, provider, userId) {
		if (!PROVIDERS[provider]) throw new BizError('Unsupported provider');
		const clientId = this._clientId(c, provider);
		if (!clientId) throw new BizError(`${provider} OAuth is not configured`);

		const state = crypto.randomUUID();
		await c.env.kv.put(this._stateKey(userId, provider), state, { expirationTtl: STATE_TTL });

		const p = PROVIDERS[provider];
		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: this._redirectUri(c, provider),
			response_type: 'code',
			scope: p.scope,
			state: `${userId}:${state}`,
		});

		if (provider === 'google') {
			params.set('access_type', 'offline');
			params.set('prompt', 'consent');
		}

		return `${p.authUrl}?${params}`;
	},

	// ── OAuth: handle callback, exchange code for tokens ─────────
	async handleCallback(c, provider) {
		if (!PROVIDERS[provider]) throw new BizError('Unsupported provider');

		const url = new URL(c.req.url);
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const error = url.searchParams.get('error');
		const origin = url.origin;

		if (error || !code || !state) {
			return Response.redirect(`${origin}/settings?backup_error=cancelled`, 302);
		}

		const [userId, stateVal] = state.split(':');
		const savedState = await c.env.kv.get(this._stateKey(userId, provider));

		if (!savedState || savedState !== stateVal) {
			return Response.redirect(`${origin}/settings?backup_error=invalid_state`, 302);
		}

		await c.env.kv.delete(this._stateKey(userId, provider));

		const tokens = await this._exchangeCode(c, provider, code);
		await this._saveTokens(c, parseInt(userId), provider, tokens);

		return Response.redirect(`${origin}/settings?backup_connected=${provider}`, 302);
	},

	async _exchangeCode(c, provider, code) {
		const p = PROVIDERS[provider];
		const body = new URLSearchParams({
			code,
			client_id: this._clientId(c, provider),
			client_secret: this._clientSecret(c, provider),
			redirect_uri: this._redirectUri(c, provider),
			grant_type: 'authorization_code',
		});

		const res = await fetch(p.tokenUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});

		const data = await res.json();
		if (data.error) throw new BizError(`OAuth token error: ${data.error_description || data.error}`);

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token || '',
			expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
		};
	},

	// OAuth tokens are per-user dynamic credentials: encrypted at rest when a
	// data encryption key is configured (utils/secret-box.js). The AAD binds
	// each ciphertext to its user/provider/field.
	_aad(userId, provider, field) {
		return `cloud_backup:${userId}:${provider}:${field}`;
	},

	async _saveTokens(c, userId, provider, plainTokens) {
		const tokens = {
			...plainTokens,
			accessToken: await secretBox.encrypt(c.env, plainTokens.accessToken, this._aad(userId, provider, 'access')),
			refreshToken: await secretBox.encrypt(c.env, plainTokens.refreshToken, this._aad(userId, provider, 'refresh')),
		};
		const db = orm(c);
		const existing = await db.select().from(cloudBackup)
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)))
			.get();

		if (existing) {
			await db.update(cloudBackup)
				.set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, folderId: '' })
				.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));
		} else {
			await db.insert(cloudBackup).values({
				userId, provider,
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				expiresAt: tokens.expiresAt,
			});
		}
	},

	// ── Token management ─────────────────────────────────────────
	async getValidToken(c, userId, provider) {
		const db = orm(c);
		const record = await db.select().from(cloudBackup)
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)))
			.get();

		if (!record || !record.accessToken) return null;

		const accessToken = await secretBox.decrypt(c.env, record.accessToken, this._aad(userId, provider, 'access'));
		const refreshToken = await secretBox.decrypt(c.env, record.refreshToken, this._aad(userId, provider, 'refresh'));

		// Refresh 2 min before expiry
		if (Date.now() > record.expiresAt - 120_000) {
			if (!refreshToken) return null;
			return await this._refreshToken(c, userId, provider, refreshToken);
		}

		return accessToken || null;
	},

	async _refreshToken(c, userId, provider, refreshToken) {
		const p = PROVIDERS[provider];
		const body = new URLSearchParams({
			refresh_token: refreshToken,
			client_id: this._clientId(c, provider),
			client_secret: this._clientSecret(c, provider),
			grant_type: 'refresh_token',
		});

		const res = await fetch(p.tokenUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});

		const data = await res.json();
		if (data.error) throw new BizError('Token refresh failed — please reconnect');

		const newTokens = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token || refreshToken,
			expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
		};

		await orm(c).update(cloudBackup)
			.set({
				accessToken: await secretBox.encrypt(c.env, newTokens.accessToken, this._aad(userId, provider, 'access')),
				refreshToken: await secretBox.encrypt(c.env, newTokens.refreshToken, this._aad(userId, provider, 'refresh')),
				expiresAt: newTokens.expiresAt
			})
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));

		return newTokens.accessToken;
	},

	// ── Which providers have OAuth credentials configured on this deployment ──
	getConfiguredProviders(c) {
		return {
			google: !!c.env.google_client_id,
			microsoft: !!c.env.microsoft_client_id,
		};
	},

	// ── Status ───────────────────────────────────────────────────
	async getStatus(c, userId) {
		const db = orm(c);
		const records = await db.select({
			provider: cloudBackup.provider,
			lastBackupAt: cloudBackup.lastBackupAt,
			backupCount: cloudBackup.backupCount,
		}).from(cloudBackup).where(eq(cloudBackup.userId, userId)).all();

		const status = {};
		for (const r of records) {
			status[r.provider] = { lastBackupAt: r.lastBackupAt, backupCount: r.backupCount };
		}
		return status;
	},

	// ── Disconnect ───────────────────────────────────────────────
	async disconnect(c, userId, provider) {
		await orm(c).delete(cloudBackup)
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));
	},

	// ── Backup execution ─────────────────────────────────────────
	// Pages through all of the user's emails via keyset pagination (emailId
	// cursor) so accounts with more than one page of mail are fully backed
	// up, instead of silently capping at the first PAGE_SIZE rows.
	async startBackup(c, userId, provider) {
		const token = await this.getValidToken(c, userId, provider);
		if (!token) throw new BizError('Provider not connected or token expired — please reconnect');

		const db = orm(c);

		const record = await db.select().from(cloudBackup)
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)))
			.get();

		let folderId = record?.folderId || '';
		if (!folderId) {
			folderId = provider === 'google'
				? await this._getOrCreateGoogleFolder(token)
				: 'Cloud Mail Backup';
			await db.update(cloudBackup)
				.set({ folderId })
				.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));
		}

		const PAGE_SIZE = 500;
		let count = 0;
		let total = 0;
		let cursor = 0;

		while (true) {
			const emails = await db.select().from(email)
				.where(and(eq(email.userId, userId), eq(email.isDel, 0), gt(email.emailId, cursor)))
				.orderBy(asc(email.emailId))
				.limit(PAGE_SIZE)
				.all();

			if (emails.length === 0) break;

			for (const em of emails) {
				try {
					const filename = this._safeFilename(em);
					const eml = this._toEml(em);
					if (provider === 'google') {
						await this._uploadToGoogle(token, folderId, filename, eml);
					} else {
						await this._uploadToMicrosoft(token, folderId, filename, eml);
					}
					count++;
				} catch (e) {
					console.error(`backup upload failed for email ${em.emailId}:`, e);
				}
			}

			total += emails.length;
			cursor = emails[emails.length - 1].emailId;

			if (emails.length < PAGE_SIZE) break;
		}

		await db.update(cloudBackup)
			.set({ lastBackupAt: Date.now(), backupCount: count })
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));

		return { count, total };
	},

	// ── .eml generation ─────────────────────────────────────────
	_toEml(em) {
		const from = em.name ? `${em.name} <${em.sendEmail}>` : (em.sendEmail || 'unknown@unknown');
		const to = em.toEmail || em.sendEmail || '';
		const subject = em.subject || '(no subject)';
		const date = em.createTime ? new Date(em.createTime).toUTCString() : new Date().toUTCString();
		const body = em.content || em.text || '';
		const isHtml = !!em.content;

		return [
			`From: ${from}`,
			`To: ${to}`,
			`Subject: ${subject}`,
			`Date: ${date}`,
			`Message-ID: <${em.emailId}@cloudmail>`,
			`MIME-Version: 1.0`,
			`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`,
			`Content-Transfer-Encoding: quoted-printable`,
			``,
			body,
		].join('\r\n');
	},

	_safeFilename(em) {
		const date = em.createTime ? dayjs(em.createTime).format('YYYY-MM-DD') : 'unknown';
		const subject = (em.subject || 'no-subject').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
		return `${date}_${subject}_${em.emailId}.eml`;
	},

	// ── Google Drive ─────────────────────────────────────────────
	async _getOrCreateGoogleFolder(token) {
		const q = encodeURIComponent(`name='Cloud Mail Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
		const searchRes = await fetch(
			`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		const { files } = await searchRes.json();
		if (files && files.length > 0) return files[0].id;

		const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Cloud Mail Backup', mimeType: 'application/vnd.google-apps.folder' }),
		});
		const folder = await createRes.json();
		return folder.id;
	},

	async _uploadToGoogle(token, folderId, filename, content) {
		const boundary = 'cloudmail_eml_boundary';
		const metadata = JSON.stringify({ name: filename, parents: [folderId] });
		const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: message/rfc822\r\n\r\n${content}\r\n--${boundary}--`;

		const res = await fetch(
			'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': `multipart/related; boundary="${boundary}"`,
				},
				body,
			}
		);
		if (!res.ok) throw new Error(`Google upload failed: ${res.status}`);
	},

	// ── OneDrive ─────────────────────────────────────────────────
	async _uploadToMicrosoft(token, folderName, filename, content) {
		const path = encodeURIComponent(filename);
		const res = await fetch(
			`https://graph.microsoft.com/v1.0/me/drive/root:/${folderName}/${path}:/content`,
			{
				method: 'PUT',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'message/rfc822',
				},
				body: content,
			}
		);
		if (!res.ok) throw new Error(`OneDrive upload failed: ${res.status}`);
	},
};

export default backupService;
