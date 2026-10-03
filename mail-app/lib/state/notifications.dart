import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';

class MailNotice {
  final int? eventId;
  final int emailId;
  final String name;
  final String subject;
  final DateTime time;
  bool read;
  MailNotice({this.eventId, required this.emailId, required this.name, required this.subject, required this.time, this.read = false});
}

/// The bell's list (web store/notification.js): persisted events from
/// /notification/events plus mail the watcher saw arrive this session.
class NotificationCenter extends ChangeNotifier {
  NotificationCenter(this.api);
  final ApiClient api;

  final List<MailNotice> items = [];
  bool _loaded = false;

  int get unreadCount => items.where((n) => !n.read).length;

  Future<void> load({bool force = false}) async {
    if (_loaded && !force) return;
    try {
      final rows = await api.get('/notification/events', {'limit': 50});
      for (final r in (rows as List? ?? const []).cast<Map>()) {
        final id = int.tryParse('${r['emailId']}') ?? 0;
        if (items.any((n) => n.emailId == id)) continue;
        final payload = r['payload'] is Map ? r['payload'] as Map : const {};
        items.add(MailNotice(
          eventId: int.tryParse('${r['id']}'),
          emailId: id,
          name: '${r['title'] ?? payload['from'] ?? ''}',
          subject: '${payload['subject'] ?? r['subject'] ?? r['body'] ?? ''}',
          time: parseServerTime('${r['createdAt'] ?? ''}') ?? DateTime.now(),
          read: !(r['unread'] == true || r['unread'] == 1),
        ));
      }
      items.sort((a, b) => b.time.compareTo(a.time));
      if (items.length > 100) items.removeRange(100, items.length);
      _loaded = true;
      notifyListeners();
    } catch (_) {
      // Older servers have no event store; the in-session list still works.
    }
  }

  void push(Email e) {
    if (items.any((n) => n.emailId == e.emailId)) return;
    items.insert(0, MailNotice(emailId: e.emailId, name: e.name.isNotEmpty ? e.name : e.sendEmail, subject: e.subject, time: DateTime.now()));
    if (items.length > 100) items.removeLast();
    notifyListeners();
  }

  Future<void> markAllRead() async {
    for (final n in items) {
      n.read = true;
    }
    notifyListeners();
    try {
      await api.post('/notification/events/read-all');
    } catch (_) {}
  }

  Future<void> markRead(int emailId) async {
    final ids = <int>[];
    for (final n in items.where((n) => n.emailId == emailId)) {
      n.read = true;
      if (n.eventId != null) ids.add(n.eventId!);
    }
    notifyListeners();
    if (ids.isEmpty) return;
    try {
      await api.post('/notification/events/read', {'ids': ids});
    } catch (_) {}
  }

  void clear() {
    items.clear();
    notifyListeners();
  }
}
