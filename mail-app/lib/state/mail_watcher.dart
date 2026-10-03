import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../services/notifier.dart';

/// Watches for new received mail while the app runs: polls /email/latest
/// (the same endpoint the desktop app used) and raises a system
/// notification when the window isn't in front. On Android with push
/// configured, background notifications come from FCM instead, so polling
/// only refreshes the list there.
class MailWatcher with WidgetsBindingObserver {
  MailWatcher(this.api, {required this.account, required this.onNewMail, this.pushEnabled = false});

  final ApiClient api;
  final Account account;
  final bool pushEnabled;

  /// New mail arrived (newest first).
  final void Function(List<Email> mail) onNewMail;

  static const interval = Duration(seconds: 60);

  Timer? _timer;
  int _lastId = 0;
  bool _busy = false;
  AppLifecycleState _state = AppLifecycleState.resumed;

  Future<void> start() async {
    WidgetsBinding.instance.addObserver(this);
    _state = WidgetsBinding.instance.lifecycleState ?? AppLifecycleState.resumed;
    // Baseline: the newest mail now, so only later arrivals notify.
    try {
      final page = await api.folder(Folder.inbox, account: account, size: 1);
      _lastId = page.items.isEmpty ? 0 : page.items.first.emailId;
    } catch (_) {}
    _timer = Timer.periodic(interval, (_) => poll());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasAway = _state != AppLifecycleState.resumed;
    _state = state;
    if (state == AppLifecycleState.resumed && wasAway) poll();
  }

  bool get _inFront => _state == AppLifecycleState.resumed;

  @visibleForTesting
  Future<void> poll() async {
    if (_busy) return;
    _busy = true;
    try {
      final data = await api.get('/email/latest', {
        'emailId': _lastId,
        'accountId': account.accountId,
        'allReceive': account.allReceive,
      });
      final fresh = ((data as List?) ?? const [])
          .map((e) => Email.fromJson(Map<String, dynamic>.from(e)))
          .where((e) => e.emailId > _lastId)
          .toList()
        ..sort((a, b) => b.emailId.compareTo(a.emailId));
      if (fresh.isEmpty) return;
      _lastId = fresh.first.emailId;
      onNewMail(fresh);
      final pushCovers = pushEnabled && !kIsWeb && Platform.isAndroid;
      if (!_inFront && !pushCovers) {
        for (final e in fresh.take(3)) {
          await Notifier.instance.showNewMail(e);
        }
      }
    } catch (_) {
      // Offline or signed out: try again next tick.
    } finally {
      _busy = false;
    }
  }
}
