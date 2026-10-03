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
  final String bccJson;
  final int type; // 0 received, 1 sent
  /// Delivery status (emailConst.status): 0 received, 1 sent, 2 delivered,
  /// 3/8 bounced, 4 complained, 5 delayed, 6 saving, 7 no recipient.
  final int status;
  /// Verification code the worker extracted from the mail, if any.
  final String code;
  /// Owner's address (admin "all mail" rows only).
  final String userEmail;
  /// In Spam (AI screening or the user).
  bool isSpam;
  /// Provider message for bounces etc. (JSON with a `message` field).
  final String message;
  int unread; // 0 unread, 1 read
  bool isStar;
  final String createTime;
  final List<Attachment> attachments;
  List<MailLabel> labels;

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
        bccJson = _str(j['bcc']),
        type = _int(j['type']),
        status = _int(j['status']),
        code = _str(j['code']),
        userEmail = _str(j['userEmail']),
        isSpam = _int(j['isSpam']) == 1,
        message = _str(j['message']),
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

  /// The bounce / delivery message (web toMessage()).
  String get deliveryMessage {
    if (message.isEmpty) return '';
    try {
      final m = jsonDecode(message);
      return m is Map ? '${m['message'] ?? ''}' : '';
    } catch (_) {
      return message;
    }
  }
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
  DateTime? get created => parseServerTime(createTime);

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
  /// Seconds the "Undo" window stays open after Send (0 = send at once).
  final int undoSendSeconds;
  /// Reply from the address the mail arrived at (Settings → Profile).
  final bool replyFromReceived;
  final String avatar;
  final int type; // role id
  final Map<String, dynamic> raw;

  UserInfo.fromJson(Map<String, dynamic> j)
      : userId = _int(j['userId']),
        email = _str(j['email']),
        name = _str(j['name']),
        signature = _str(j['signature']),
        permKeys = ((j['permKeys'] as List?) ?? const []).map((e) => '$e').toList(),
        account = j['account'] is Map ? Account.fromJson(Map<String, dynamic>.from(j['account'])) : null,
        undoSendSeconds = j['undoSendSeconds'] == null ? 10 : _int(j['undoSendSeconds']),
        replyFromReceived = j['replyFromReceived'] != false && j['replyFromReceived'] != 0,
        avatar = _str(j['avatar']),
        type = _int(j['type']),
        raw = j;

  bool can(String perm) => permKeys.contains('*') || permKeys.contains(perm);
}

class Page<T> {
  final List<T> items;
  final bool hasMore;
  /// Server's row count for the folder, when it sends one.
  final int? total;
  const Page(this.items, this.hasMore, [this.total]);
}

/// A row of the Scheduled page (scheduled-email-service toClient()).
class ScheduledMail {
  final int id;
  final int accountId;
  final String scheduledAt; // UTC "yyyy-MM-dd HH:mm:ss"
  final String status; // pending | processing | sent | failed | cancelled
  final int attemptCount;
  final String lastError;
  final String sentTime;
  final List<String> receiveEmail;
  final String subject;
  final int attachmentCount;

  ScheduledMail.fromJson(Map<String, dynamic> j)
      : id = _int(j['id']),
        accountId = _int(j['accountId']),
        scheduledAt = _str(j['scheduledAt']),
        status = _str(j['status']).isEmpty ? 'pending' : _str(j['status']),
        attemptCount = _int(j['attemptCount']),
        lastError = _str(j['lastError']),
        sentTime = _str(j['sentTime']),
        receiveEmail = ((j['receiveEmail'] as List?) ?? const []).map((e) => '$e').toList(),
        subject = _str(j['subject']),
        attachmentCount = _int(j['attachmentCount']);

  DateTime? get when => parseServerTime(status == 'sent' && sentTime.isNotEmpty ? sentTime : scheduledAt);
}

/// Server times are UTC, either "yyyy-MM-dd HH:mm:ss" or ISO.
DateTime? parseServerTime(String raw) {
  if (raw.isEmpty) return null;
  final iso = raw.contains('T') ? raw : raw.replaceFirst(' ', 'T');
  final hasZone = iso.endsWith('Z') || RegExp(r'[+-]\d\d:?\d\d$').hasMatch(iso);
  return DateTime.tryParse(hasZone ? iso : '${iso}Z')?.toLocal();
}

class Contact {
  final String email;
  final String name;
  const Contact(this.email, [this.name = '']);

  Contact.fromJson(Map<String, dynamic> j)
      : email = _str(j['email']),
        name = _str(j['name']);

  Map<String, dynamic> toJson() => {'email': email, 'name': name};
}

class ContactGroup {
  final int groupId;
  final String name;
  final List<Contact> contacts;

  ContactGroup.fromJson(Map<String, dynamic> j)
      : groupId = _int(j['groupId']),
        name = _str(j['name']),
        contacts = ((j['contacts'] as List?) ?? const [])
            .whereType<Map>()
            .map((c) => Contact.fromJson(Map<String, dynamic>.from(c)))
            .toList();
}

class MailTemplate {
  final int templateId;
  final String name;
  final String subject;
  final String content; // HTML

  MailTemplate.fromJson(Map<String, dynamic> j)
      : templateId = _int(j['templateId']),
        name = _str(j['name']),
        subject = _str(j['subject']),
        content = _str(j['content']);
}
