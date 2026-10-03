import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../services/notifier.dart';
import 'drafts.dart';

/// Signed-in state: server, token, user, addresses and labels.
class Session extends ChangeNotifier {
  Session(this._prefs)
      : api = ApiClient(
          baseUrl: _prefs.getString(_kServer) ?? defaultServer,
          token: _prefs.getString(_kToken),
        ) {
    api.onUnauthorized = () {
      if (signedIn) {
        expired = true;
        _clear();
      }
    };
  }

  static const defaultServer = 'https://panorama-sg.de';
  static const _kServer = 'server';
  static const _kToken = 'token';
  static const _kAccount = 'accountId';
  static const _kInstallation = 'installationUuid';

  final SharedPreferences _prefs;
  final ApiClient api;

  UserInfo? user;
  List<Account> accounts = const [];
  List<MailLabel> labels = const [];
  Account? current;
  String r2Domain = '';
  String siteTitle = 'PSG Mail';

  /// Set when the server rejected the token; the login screen explains why.
  bool expired = false;

  /// Drafts on this device for the signed-in user.
  DraftStore? drafts;

  /// True once this device's FCM token is registered with the worker.
  bool pushEnabled = false;

  bool get signedIn => api.token != null;
  String get server => _prefs.getString(_kServer) ?? defaultServer;

  /// "mail.example.com" or "https://mail.example.com/" → ".../api".
  static String apiBase(String server) {
    var s = server.trim();
    if (!s.startsWith('http')) s = 'https://$s';
    while (s.endsWith('/')) {
      s = s.substring(0, s.length - 1);
    }
    return s.endsWith('/api') ? s : '$s/api';
  }

  Future<void> signIn(String server, String email, String password) async {
    api.baseUrl = apiBase(server);
    final token = await api.login(email.trim(), password);
    api.token = token;
    await _prefs.setString(_kServer, server.trim());
    await _prefs.setString(_kToken, token);
    expired = false;
    await load();
  }

  /// Loads everything the shell needs after sign-in or on cold start.
  Future<void> load() async {
    api.baseUrl = apiBase(server);
    final results = await Future.wait([
      api.userInfo(),
      api.accounts(),
      api.websiteConfig().catchError((_) => <String, dynamic>{}),
      api.labels().catchError((_) => <MailLabel>[]),
    ]);
    user = results[0] as UserInfo;
    accounts = results[1] as List<Account>;
    final config = results[2] as Map<String, dynamic>;
    labels = results[3] as List<MailLabel>;
    drafts = DraftStore('$server|${user!.userId}')..load();
    r2Domain = '${config['r2Domain'] ?? ''}';
    siteTitle = '${config['title'] ?? ''}'.isEmpty ? 'PSG Mail' : '${config['title']}';
    final savedId = _prefs.getInt(_kAccount);
    current = accounts.where((a) => a.accountId == savedId).firstOrNull ??
        accounts.where((a) => a.accountId == user?.account?.accountId).firstOrNull ??
        accounts.firstOrNull ??
        user?.account;
    notifyListeners();
  }

  /// Android: hands the FCM token to the worker so new mail arrives as a
  /// push even when the app is closed (same endpoint the old app used).
  Future<void> registerPush() async {
    final token = await Notifier.instance.pushToken();
    if (token == null) return;
    var id = _prefs.getString(_kInstallation);
    if (id == null) {
      final r = Random.secure();
      id = List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
      await _prefs.setString(_kInstallation, id);
    }
    try {
      await api.post('/notification/device', {
        'platform': 'android',
        'targetKind': 'fcm_token',
        'target': token,
        'deviceName': 'PSG Mail (Android)',
        'installationUuid': id,
      });
      pushEnabled = true;
    } catch (_) {}
  }

  Future<void> refreshLabels() async {
    labels = await api.labels();
    notifyListeners();
  }

  void selectAccount(Account a) {
    current = a;
    _prefs.setInt(_kAccount, a.accountId);
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await api.logout();
    } catch (_) {}
    _clear();
  }

  void _clear() {
    api.token = null;
    user = null;
    accounts = const [];
    labels = const [];
    current = null;
    drafts = null;
    _prefs.remove(_kToken);
    notifyListeners();
  }

  String ossUrl(String key) => api.ossUrl(key, r2Domain);
}
