import 'dart:convert';

// Plain data classes for the PSG Mail worker API (camelCase JSON, see
// mail-worker/src/entity/*.js).

int _int(dynamic v) => v is int ? v : int.tryParse('$v') ?? 0;
String _str(dynamic v) => v == null ? '' : '$v';

class Address {
  final String name;
  final String address;
  const Address(this.name, this.address);

  String get display => name.isNotEmpty ? name : address;
}

class Attachment {
  final int attId;
  final String key;
  final String filename;
  final String mimeType;
  final int size;
  final String disposition;
  final String contentId;

  Attachment.fromJson(Map<String, dynamic> j)
      : attId = _int(j['attId']),
        key = _str(j['key']),
        filename = _str(j['filename']),
        mimeType = _str(j['mimeType']),
        size = _int(j['size']),
        disposition = _str(j['disposition']),
        contentId = _str(j['contentId']);

  bool get isInline => disposition == 'inline' && contentId.isNotEmpty;
}

class MailLabel {
  final int labelId;
  final String name;
  final String color;
  final int emailCount;

  MailLabel.fromJson(Map<String, dynamic> j)
      : labelId = _int(j['labelId']),
        name = _str(j['name']),
        color = _str(j['color']),
        emailCount = _int(j['emailCount']);
}

class Email {
  final int emailId;
  final int accountId;
  final String sendEmail;
  final String name;
  final String subject;
  final String text;
  final String content;
  final String toEmail;
  final String toName;
  final String recipientJson;
  final String ccJson;
  final int type; // 0 received, 1 sent
  int unread; // 0 unread, 1 read
  bool isStar;
  final String createTime;
  final List<Attachment> attachments;
  final List<MailLabel> labels;

  Email.fromJson(Map<String, dynamic> j)
      : emailId = _int(j['emailId']),
        accountId = _int(j['accountId']),
        sendEmail = _str(j['sendEmail']),
        name = _str(j['name']),
        subject = _str(j['subject']),
        text = _str(j['text']),
        content = _str(j['content']),
        toEmail = _str(j['toEmail']),
        toName = _str(j['toName']),
        recipientJson = _str(j['recipient']),
        ccJson = _str(j['cc']),
        type = _int(j['type']),
        unread = _int(j['unread']),
        isStar = _int(j['isStar']) == 1 || j['starId'] != null,
        createTime = _str(j['createTime']),
        attachments = ((j['attList'] as List?) ?? const [])
            .map((a) => Attachment.fromJson(Map<String, dynamic>.from(a)))
            .toList(),
        labels = ((j['labels'] as List?) ?? const [])
            .whereType<Map>()
            .map((l) => MailLabel.fromJson(Map<String, dynamic>.from(l)))
            .toList();

  bool get isUnread => type == 0 && unread == 0;
  bool get isSent => type == 1;

  /// Who to show in a list row: the sender for received mail, the first
  /// recipient for sent mail.
  String get counterpart {
    if (!isSent) return name.isNotEmpty ? name : sendEmail;
    final to = recipients;
    if (to.isNotEmpty) return to.first.display;
    return toName.isNotEmpty ? toName : toEmail;
  }

  List<Address> get recipients => parseAddresses(recipientJson);
  List<Address> get cc => parseAddresses(ccJson);

  /// Server times are UTC "yyyy-MM-dd HH:mm:ss".
  DateTime? get created {
    if (createTime.isEmpty) return null;
    final iso = createTime.contains('T') ? createTime : createTime.replaceFirst(' ', 'T');
    final t = DateTime.tryParse(iso.endsWith('Z') ? iso : '${iso}Z');
    return t?.toLocal();
  }

  String get preview {
    final source = text.isNotEmpty ? text : content.replaceAll(RegExp(r'<[^>]*>'), ' ');
    return source.replaceAll(RegExp(r'\s+'), ' ').trim();
  }
}

List<Address> parseAddresses(String json) {
  if (json.isEmpty) return const [];
  try {
    final decoded = jsonDecode(json);
    if (decoded is List) {
      return decoded
          .whereType<Map>()
          .map((m) => Address(_str(m['name']), _str(m['address'])))
          .where((a) => a.address.isNotEmpty)
          .toList();
    }
  } catch (_) {}
  return const [];
}

class Account {
  final int accountId;
  final String email;
  final String name;
  final int allReceive;
  final int sort;

  Account.fromJson(Map<String, dynamic> j)
      : accountId = _int(j['accountId']),
        email = _str(j['email']),
        name = _str(j['name']),
        allReceive = _int(j['allReceive']),
        sort = _int(j['sort']);
}

class UserInfo {
  final int userId;
  final String email;
  final String name;
  final String signature;
  final List<String> permKeys;
  final Account? account;

  UserInfo.fromJson(Map<String, dynamic> j)
      : userId = _int(j['userId']),
        email = _str(j['email']),
        name = _str(j['name']),
        signature = _str(j['signature']),
        permKeys = ((j['permKeys'] as List?) ?? const []).map((e) => '$e').toList(),
        account = j['account'] is Map ? Account.fromJson(Map<String, dynamic>.from(j['account'])) : null;

  bool can(String perm) => permKeys.contains('*') || permKeys.contains(perm);
}

class Page<T> {
  final List<T> items;
  final bool hasMore;
  const Page(this.items, this.hasMore);
}
