import credentialService from './credential-service';
import orm from '../entity/orm';
import { cloudBackup } from '../entity/cloud-backup';
import { email } from '../entity/email';
import { and, eq, asc, gt, count as count_ } from 'drizzle-orm';
import emailService from './email-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

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

// Mails uploaded per request: one upload fetch each, well under the
// Worker's per-request subrequest limit (50 on the free plan).
const BACKUP_BATCH = 40;
const BACKUP_FOLDER = 'Cloud Mail Backup';

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
		if (!PROVIDERS[provider]) throw new BizError(t('backupUnsupportedProvider'));
		const clientId = this._clientId(c, provider);
		if (!clientId) throw new BizError(t('backupOauthNotConfigured', { provider }));

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
		if (!PROVIDERS[provider]) throw new BizError(t('backupUnsupportedProvider'));

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
		if (data.error) throw new BizError(t('backupOauthTokenError', { msg: data.error_description || data.error }));

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token || '',
			expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
		};
	},

	async _saveTokens(c, userId, provider, tokens) {
		const db = orm(c);
		const existing = await db.select().from(cloudBackup)
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)))
			.get();
		const storedAccess = await credentialService.encrypt(c.env, tokens.accessToken, 'backup.accessToken');
		const storedRefresh = await credentialService.encrypt(c.env, tokens.refreshToken, 'backup.refreshToken');

		if (existing) {
			await db.update(cloudBackup)
				.set({ accessToken: storedAccess, refreshToken: storedRefresh, expiresAt: tokens.expiresAt, folderId: '' })
				.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));
		} else {
			await db.insert(cloudBackup).values({
				userId, provider,
				accessToken: storedAccess,
				refreshToken: storedRefresh,
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

		const accessToken = await credentialService.decrypt(c.env, record.accessToken, 'backup.accessToken');
		const refreshToken = await credentialService.decrypt(c.env, record.refreshToken, 'backup.refreshToken');

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
		if (data.error) throw new BizError(t('backupTokenRefreshFailed'));

		const newTokens = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token || refreshToken,
			expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
		};

		await orm(c).update(cloudBackup)
			.set({
				accessToken: await credentialService.encrypt(c.env, newTokens.accessToken, 'backup.accessToken'),
				refreshToken: await credentialService.encrypt(c.env, newTokens.refreshToken, 'backup.refreshToken'),
				expiresAt: newTokens.expiresAt,
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
		await c.env.kv.delete(this._cursorKey(userId, provider));
	},

	// ── Backup execution ─────────────────────────────────────────
	// Incremental and batched. Each call uploads at most BACKUP_BATCH mails
	// after the per-provider cursor (the last emailId that made it to the
	// drive), so a second "Back up now" only sends new mail instead of
	// duplicating every file, and one request stays inside the Worker's
	// subrequest limit. `remaining` tells the client to call again. The .eml
	// is the one the reader's "Export .eml" builds (encoded headers, base64
	// bodies, attachments).
	async startBackup(c, userId, provider) {
		const token = await this.getValidToken(c, userId, provider);
		if (!token) throw new BizError(t('backupNotConnected'));

		const db = orm(c);

		const record = await db.select().from(cloudBackup)
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)))
			.get();

		let folderId = record?.folderId || '';
		if (!folderId) {
			folderId = provider === 'google'
				? await this._getOrCreateGoogleFolder(token)
				: BACKUP_FOLDER;
			if (!folderId) throw new BizError(t('backupFolderFailed'));
			await db.update(cloudBackup)
				.set({ folderId })
				.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));
		}

		const cursorKey = this._cursorKey(userId, provider);
		let cursor = Number(await c.env.kv.get(cursorKey)) || 0;

		const rows = await db.select({ emailId: email.emailId }).from(email)
			.where(and(eq(email.userId, userId), eq(email.isDel, 0), gt(email.emailId, cursor)))
			.orderBy(asc(email.emailId))
			.limit(BACKUP_BATCH)
			.all();

		let count = 0;
		let failed = 0;
		for (const { emailId } of rows) {
			try {
				const { filename, content } = await emailService.buildEml(c, emailId, userId);
				if (provider === 'google') {
					await this._uploadToGoogle(token, folderId, filename, content);
				} else {
					await this._uploadToMicrosoft(token, folderId, filename, content);
				}
				count++;
				cursor = emailId;
			} catch (e) {
				// Stop at the first failure and keep the cursor before it, so
				// the next run retries this mail instead of skipping it.
				console.error(`backup upload failed for email ${emailId}:`, e);
				failed++;
				break;
			}
		}

		if (count) await c.env.kv.put(cursorKey, String(cursor));

		const { remaining } = await db.select({ remaining: count_() }).from(email)
			.where(and(eq(email.userId, userId), eq(email.isDel, 0), gt(email.emailId, cursor)))
			.get();

		await db.update(cloudBackup)
			.set({ lastBackupAt: Date.now(), backupCount: (record?.backupCount || 0) + count })
			.where(and(eq(cloudBackup.userId, userId), eq(cloudBackup.provider, provider)));

		return { count, failed, remaining };
	},

	_cursorKey(userId, provider) {
		return `backup_cursor:${userId}:${provider}`;
	},

	// ── Google Drive ─────────────────────────────────────────────
	async _getOrCreateGoogleFolder(token) {
		const q = encodeURIComponent(`name='${BACKUP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
		const searchRes = await fetch(
			`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		const { files } = await searchRes.json();
		if (files && files.length > 0) return files[0].id;

		const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: BACKUP_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
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
