import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// Error from the worker: either its `{code, message}` envelope or a
/// transport failure.
class ApiException implements Exception {
  final int code;
  final String message;
  const ApiException(this.code, this.message);

  bool get unauthorized => code == 401;

  @override
  String toString() => message;
}

/// Thin client for the PSG Mail worker. Every endpoint answers HTTP 200 with
/// `{code, message, data}`; `code != 200` is an error.
class ApiClient {
  ApiClient({required this.baseUrl, this.token, http.Client? client})
      : _http = client ?? http.Client();

  /// e.g. https://mail.example.com/api
  String baseUrl;
  String? token;
  final http.Client _http;

  /// Called when the server rejects the token, so the app can sign out.
  void Function()? onUnauthorized;

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final q = <String, String>{};
    query?.forEach((k, v) {
      if (v != null) q[k] = '$v';
    });
    return Uri.parse('$base$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': ?token,
      };

  Future<dynamic> _send(String method, String path,
      {Map<String, dynamic>? query, Object? body, Duration timeout = const Duration(seconds: 30)}) async {
    final req = http.Request(method, _uri(path, query))..headers.addAll(_headers);
    if (body != null) req.body = jsonEncode(body);
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(timeout));
    } on TimeoutException {
      throw const ApiException(-1, 'timeout');
    } catch (e) {
      throw ApiException(-1, 'network: $e');
    }
    if (res.statusCode != 200) {
      throw ApiException(res.statusCode, 'HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> json;
    try {
      json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw const ApiException(-1, 'bad response');
    }
    final code = json['code'] is int ? json['code'] as int : 500;
    if (code != 200) {
      final err = ApiException(code, '${json['message'] ?? 'error'}');
      if (err.unauthorized) onUnauthorized?.call();
      throw err;
    }
    return json['data'];
  }

  Future<dynamic> get(String p, [Map<String, dynamic>? q]) => _send('GET', p, query: q);
  Future<dynamic> post(String p, [Object? b]) => _send('POST', p, body: b ?? const {});
  Future<dynamic> put(String p, [Object? b]) => _send('PUT', p, body: b ?? const {});
  Future<dynamic> delete(String p, [Map<String, dynamic>? q]) => _send('DELETE', p, query: q);

  /// URL for a stored object (attachment / inline image). Mirrors the web
  /// app's cvtR2Url: a public bucket domain if configured, else the
  /// worker's /oss proxy.
  String ossUrl(String key, String r2Domain) {
    if (key.startsWith('http')) return key;
    if (r2Domain.isEmpty) return '${_uri('/oss/$key')}';
    var d = r2Domain.startsWith('http') ? r2Domain : 'https://$r2Domain';
    if (d.endsWith('/')) d = d.substring(0, d.length - 1);
    return '$d/$key';
  }

  // ── Auth & user ─────────────────────────────────────────────

  Future<String> login(String email, String password) async {
    final data = await post('/login', {'email': email, 'password': password});
    return '${(data as Map)['token']}';
  }

  Future<void> logout() => delete('/logout');

  Future<UserInfo> userInfo() async =>
      UserInfo.fromJson(Map<String, dynamic>.from(await get('/my/loginUserInfo') as Map));

  Future<Map<String, dynamic>> websiteConfig() async =>
      Map<String, dynamic>.from((await get('/setting/websiteConfig')) as Map? ?? const {});

  Future<List<Account>> accounts() async {
    const page = 30;
    final all = <Account>[];
    for (var guard = 0; guard < 50; guard++) {
      final last = all.isEmpty ? null : all.last;
      final data = await get('/account/list', {
        'accountId': last?.accountId ?? 0,
        'size': page,
        if (last != null) 'lastSort': last.sort,
      });
      final rows = (data as List? ?? const []).map((e) => Account.fromJson(Map<String, dynamic>.from(e))).toList();
      all.addAll(rows);
      if (rows.length < page) break;
    }
    return all;
  }

  Future<List<MailLabel>> labels() async {
    final data = await get('/label/list');
    final rows = data is Map ? data['list'] : data;
    return (rows as List? ?? const []).map((e) => MailLabel.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  // ── Mail ────────────────────────────────────────────────────

  static List<Email> _emails(dynamic data) {
    final rows = data is Map ? data['list'] : data;
    return (rows as List? ?? const []).map((e) => Email.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  /// One page of a folder; [before] is the last emailId seen (the cursor).
  /// [oldestFirst] is honoured by the folders the web app can sort (inbox,
  /// all inboxes, sent).
  Future<Page<Email>> folder(Folder f,
      {required Account account, int? before, int size = 30, bool oldestFirst = false}) async {
    final scope = {'accountId': account.accountId, 'allReceive': account.allReceive, 'size': size, 'emailId': before ?? 0};
    final sort = oldestFirst ? 1 : 0;
    final dynamic data;
    switch (f.kind) {
      case FolderKind.inbox:
        data = await get('/email/list', {...scope, 'type': 0, 'timeSort': sort});
      case FolderKind.allInbox:
        data = await get('/email/list', {...scope, 'allReceive': 1, 'type': 0, 'timeSort': sort});
      case FolderKind.sent:
        data = await get('/email/list', {...scope, 'type': 1, 'timeSort': sort});
      case FolderKind.starred:
        data = await get('/star/list', {'emailId': before ?? 0, 'size': size});
      case FolderKind.archive:
        data = await get('/email/archive/list', scope);
      case FolderKind.spam:
        data = await get('/email/spam/list', scope);
      case FolderKind.trash:
        data = await get('/email/trash/list', scope);
      case FolderKind.label:
        data = await get('/label/${f.labelId}/emails', {'emailId': before ?? 0, 'size': size});
    }
    final list = _emails(data);
    return Page(list, list.length >= size);
  }

  Future<Page<Email>> search(String query, {required Account account, int? before, int size = 30}) async {
    final data = await post('/email/search', {
      'query': query,
      'accountId': account.accountId,
      'allReceive': account.allReceive,
      'cursor': before ?? 0,
      'size': size,
    });
    final list = _emails(data);
    return Page(list, list.length >= size);
  }

  Future<Email?> detail(int emailId) async {
    final data = await get('/email/detail', {'emailId': emailId});
    return data is Map ? Email.fromJson(Map<String, dynamic>.from(data)) : null;
  }

  Future<void> markRead(List<int> ids) => put('/email/read', {'emailIds': ids});
  Future<void> markUnread(List<int> ids) => put('/email/unread', {'emailIds': ids});
  Future<void> star(int id) => post('/star/add', {'emailId': id});
  Future<void> unstar(int id) => delete('/star/cancel', {'emailId': id});
  Future<void> moveToTrash(List<int> ids) => delete('/email/delete', {'emailIds': ids.join(',')});
  Future<void> deleteForever(List<int> ids) => delete('/email/permanent-delete', {'emailIds': ids.join(',')});
  Future<void> restore(List<int> ids) => put('/email/restore', {'emailIds': ids.join(',')});
  Future<void> archive(List<int> ids) => put('/email/archive', {'emailIds': ids.join(',')});
  Future<void> unarchive(List<int> ids) => put('/email/unarchive', {'emailIds': ids.join(',')});
  Future<void> markSpam(List<int> ids) => put('/email/spam', {'emailIds': ids.join(',')});
  Future<void> notSpam(List<int> ids) => put('/email/unspam', {'emailIds': ids.join(',')});

  Future<void> send(OutgoingMail m) => _send('POST', '/email/send',
      body: m.toJson(), timeout: const Duration(minutes: 3));

  // ── Labels ──────────────────────────────────────────────────

  Future<void> applyLabel(int labelId, List<int> ids) => post('/label/apply', {'labelId': labelId, 'emailIds': ids});
  Future<void> removeLabel(int labelId, List<int> ids) => post('/label/remove', {'labelId': labelId, 'emailIds': ids});

  // ── Scheduled ───────────────────────────────────────────────

  Future<List<ScheduledMail>> scheduledList() async {
    final data = await get('/email/schedule/list');
    final rows = data is Map ? data['list'] : data;
    return (rows as List? ?? const []).map((e) => ScheduledMail.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<void> scheduleCancel(int id) => put('/email/schedule/$id/cancel');
  Future<void> scheduleSendNow(int id) => post('/email/schedule/$id/send-now');

  /// Cancels the pending row and returns its full send payload for editing.
  Future<Map<String, dynamic>> scheduleEdit(int id) async =>
      Map<String, dynamic>.from(await post('/email/schedule/$id/edit') as Map);

  // ── Reading aids ────────────────────────────────────────────

  /// Machine translation of a mail (translate-api.js).
  Future<({String translated, String original})> translate({String? html, String? text, required String targetLang}) async {
    final data = await post('/translate', {
      'html': ?html,
      'text': ?text,
      'target_lang': targetLang,
    }) as Map;
    return (translated: '${data['translated_text'] ?? ''}', original: '${data['original_text'] ?? ''}');
  }

  Future<String> aiSummary(int emailId) async =>
      '${((await post('/ai/email/summary', {'emailId': emailId})) as Map?)?['summary'] ?? ''}';

  Future<String> aiReplySuggestion(int emailId) async =>
      '${((await post('/ai/email/reply-suggestion', {'emailId': emailId})) as Map?)?['suggestion'] ?? ''}';

  /// The AI spam screening's reason for a mail in Spam, or null.
  Future<String?> spamVerdictReason(int emailId) async {
    final data = await get('/email/spam/verdict', {'emailId': emailId});
    if (data is! Map) return null;
    return '${data['reason'] ?? ''}';
  }

  // ── Raw downloads ───────────────────────────────────────────

  /// Bytes of an attachment or other stored object.
  Future<List<int>> download(String url) async {
    final res = await _http.get(Uri.parse(url), headers: _headers).timeout(const Duration(minutes: 2));
    if (res.statusCode != 200) throw ApiException(res.statusCode, 'HTTP ${res.statusCode}');
    return res.bodyBytes;
  }


  /// The message as an .eml file: (filename, bytes). This endpoint returns
  /// the raw file, not the JSON envelope.
  Future<(String, List<int>)> exportEml(int emailId) async {
    final res = await _http
        .get(_uri('/email/export-eml/$emailId'), headers: _headers)
        .timeout(const Duration(seconds: 60));
    if (res.statusCode != 200) throw ApiException(res.statusCode, 'HTTP ${res.statusCode}');
    final disposition = res.headers['content-disposition'] ?? '';
    final m = RegExp(r'filename="?([^";]+)"?').firstMatch(disposition);
    final name = m != null ? Uri.decodeComponent(m[1]!) : 'email-$emailId.eml';
    return (name, res.bodyBytes);
  }
}

enum FolderKind { inbox, allInbox, starred, sent, archive, spam, trash, label }

class Folder {
  final FolderKind kind;
  final int? labelId;
  final String? labelName;
  const Folder(this.kind, {this.labelId, this.labelName});

  static const inbox = Folder(FolderKind.inbox);

  @override
  bool operator ==(Object other) => other is Folder && other.kind == kind && other.labelId == labelId;

  @override
  int get hashCode => Object.hash(kind, labelId);
}

class OutgoingAttachment {
  final String filename;
  final String contentType;
  final int size;
  final String base64;
  const OutgoingAttachment(this.filename, this.contentType, this.size, this.base64);

  Map<String, dynamic> toJson() => {'filename': filename, 'contentType': contentType, 'size': size, 'content': base64};
}

class OutgoingMail {
  final int accountId;
  final String name;
  final List<String> to;
  final List<String> cc;
  final List<String> bcc;
  final String subject;
  final String text;
  final String html;
  final String sendType; // '', 'reply', 'forward'
  final int emailId; // the replied-to mail
  final List<OutgoingAttachment> attachments;

  const OutgoingMail({
    required this.accountId,
    required this.name,
    required this.to,
    this.cc = const [],
    this.bcc = const [],
    required this.subject,
    required this.text,
    required this.html,
    this.sendType = '',
    this.emailId = 0,
    this.attachments = const [],
  });

  Map<String, dynamic> toJson() => {
        'accountId': accountId,
        'name': name,
        'receiveEmail': to,
        'cc': cc,
        'bcc': bcc,
        'subject': subject,
        'text': text,
        'content': html,
        'sendType': sendType,
        'emailId': emailId,
        'attachments': attachments.map((a) => a.toJson()).toList(),
      };
}
