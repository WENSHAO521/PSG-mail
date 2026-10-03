import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../api/models.dart';

/// System notifications for new mail, plus the Android push bridge
/// (MainActivity.kt, channel "psg/push").
class Notifier {
  Notifier._();
  static final instance = Notifier._();

  final _plugin = FlutterLocalNotificationsPlugin();
  static const _push = MethodChannel('psg/push');
  bool _ready = false;

  /// Called with an emailId when the user taps a notification.
  void Function(int emailId)? onOpen;

  Future<void> init() async {
    if (_ready || kIsWeb) return;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          macOS: DarwinInitializationSettings(),
          linux: LinuxInitializationSettings(defaultActionName: 'Open'),
          windows: WindowsInitializationSettings(
            appName: 'PSG Mail',
            appUserModelId: 'com.psg.mail',
            guid: '6f1c7d52-3b8e-4a49-9d1e-2c6a9e0f4b31',
          ),
        ),
        onDidReceiveNotificationResponse: (r) => _openPayload(r.payload),
      );
      _ready = true;
      final launch = await _plugin.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true) _openPayload(launch!.notificationResponse?.payload);
      if (Platform.isAndroid) {
        await _plugin
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
        _push.setMethodCallHandler((call) async {
          if (call.method == 'openEmail') _openPayload('${call.arguments}');
        });
        _openPayload(await _push.invokeMethod<String>('takeLaunchEmailId'));
      } else if (Platform.isMacOS) {
        await _plugin
            .resolvePlatformSpecificImplementation<MacOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(alert: true, sound: true);
      }
    } catch (e) {
      debugPrint('notifications unavailable: $e');
    }
  }

  void _openPayload(String? payload) {
    final id = int.tryParse(payload ?? '');
    if (id != null && id > 0) onOpen?.call(id);
  }

  /// FCM registration token, or null when push isn't configured in this
  /// build (no google-services.json) or not on Android.
  Future<String?> pushToken() async {
    if (kIsWeb || !Platform.isAndroid) return null;
    try {
      return await _push.invokeMethod<String>('getToken');
    } catch (_) {
      return null;
    }
  }

  Future<void> showNewMail(Email e) async {
    if (!_ready) return;
    final title = e.name.isNotEmpty ? e.name : e.sendEmail;
    await _plugin.show(
      id: e.emailId & 0x7fffffff,
      title: title.isEmpty ? 'PSG Mail' : title,
      body: e.subject,
      payload: '${e.emailId}',
      notificationDetails: const NotificationDetails(
        // Same channel the worker's FCM messages use (MainActivity creates it).
        android: AndroidNotificationDetails('psg-mail-inbox', 'New mail',
            importance: Importance.high, priority: Priority.high),
        macOS: DarwinNotificationDetails(),
        linux: LinuxNotificationDetails(),
        windows: WindowsNotificationDetails(),
      ),
    );
  }
}
