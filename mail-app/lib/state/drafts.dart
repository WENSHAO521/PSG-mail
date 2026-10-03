import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../api/api_client.dart';

/// An unsent message kept on this device (the web app keeps drafts in the
/// browser's IndexedDB, so they never reach the server either).
class Draft {
  final String id;
  int accountId;
  List<String> to;
  List<String> cc;
  List<String> bcc;
  String subject;
  String html;
  String text;
  String sendType;
  int emailId;
  List<OutgoingAttachment> attachments;
  DateTime updatedAt;

  Draft({
    required this.id,
    required this.accountId,
    this.to = const [],
    this.cc = const [],
    this.bcc = const [],
    this.subject = '',
    this.html = '',
    this.text = '',
    this.sendType = '',
    this.emailId = 0,
    this.attachments = const [],
    DateTime? updatedAt,
  }) : updatedAt = updatedAt ?? DateTime.now();

  bool get isEmpty => to.isEmpty && cc.isEmpty && bcc.isEmpty && subject.trim().isEmpty && text.trim().isEmpty && attachments.isEmpty;

  Map<String, dynamic> toJson() => {
        'id': id,
        'accountId': accountId,
        'to': to,
        'cc': cc,
        'bcc': bcc,
        'subject': subject,
        'html': html,
        'text': text,
        'sendType': sendType,
        'emailId': emailId,
        'attachments': attachments.map((a) => a.toJson()).toList(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory Draft.fromJson(Map<String, dynamic> j) {
    List<String> list(String k) => ((j[k] as List?) ?? const []).map((e) => '$e').toList();
    return Draft(
      id: '${j['id']}',
      accountId: j['accountId'] is int ? j['accountId'] as int : 0,
      to: list('to'),
      cc: list('cc'),
      bcc: list('bcc'),
      subject: '${j['subject'] ?? ''}',
      html: '${j['html'] ?? ''}',
      text: '${j['text'] ?? ''}',
      sendType: '${j['sendType'] ?? ''}',
      emailId: j['emailId'] is int ? j['emailId'] as int : 0,
      attachments: ((j['attachments'] as List?) ?? const [])
          .whereType<Map>()
          .map((a) => OutgoingAttachment('${a['filename']}', '${a['contentType']}',
              a['size'] is int ? a['size'] as int : 0, '${a['content']}'))
          .toList(),
      updatedAt: DateTime.tryParse('${j['updatedAt']}') ?? DateTime.now(),
    );
  }
}

/// Drafts for one signed-in user, stored as a JSON file in the app's
/// support directory.
class DraftStore extends ChangeNotifier {
  DraftStore(this.scope, {Directory? dir}) : _dir = dir; // ignore: prefer_initializing_formals

  /// Separates users/servers on one device, e.g. "server|userId".
  final String scope;
  final Directory? _dir;
  List<Draft> _drafts = [];
  bool _loaded = false;

  List<Draft> get drafts => List.unmodifiable(_drafts..sort((a, b) => b.updatedAt.compareTo(a.updatedAt)));

  Future<File> _file() async {
    final dir = _dir ?? await getApplicationSupportDirectory();
    final name = base64Url.encode(utf8.encode(scope)).replaceAll('=', '');
    return File('${dir.path}/drafts-$name.json');
  }

  Future<void> load() async {
    if (_loaded) return;
    try {
      final f = await _file();
      if (await f.exists()) {
        final data = jsonDecode(await f.readAsString()) as List;
        _drafts = data.whereType<Map>().map((m) => Draft.fromJson(Map<String, dynamic>.from(m))).toList();
      }
    } catch (e) {
      debugPrint('drafts: $e');
    }
    _loaded = true;
    notifyListeners();
  }

  Future<void> _persist() async {
    final f = await _file();
    await f.parent.create(recursive: true);
    await f.writeAsString(jsonEncode(_drafts.map((d) => d.toJson()).toList()));
  }

  /// Saves (or, when empty, removes) [d].
  Future<void> save(Draft d) async {
    await load();
    _drafts.removeWhere((x) => x.id == d.id);
    if (!d.isEmpty) {
      d.updatedAt = DateTime.now();
      _drafts.add(d);
    }
    notifyListeners();
    await _persist();
  }

  Future<void> remove(Iterable<String> ids) async {
    await load();
    final set = ids.toSet();
    _drafts.removeWhere((d) => set.contains(d.id));
    notifyListeners();
    await _persist();
  }

  static String newId() => '${DateTime.now().microsecondsSinceEpoch}';
}
