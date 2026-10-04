import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Theme and language, chosen like the web's avatar menu (theme: light /
/// dark / system; language: 中文 / English).
class AppSettings extends ChangeNotifier {
  AppSettings(this._prefs);
  final SharedPreferences _prefs;

  ThemeMode get themeMode => switch (_prefs.getString('themeMode')) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };

  /// null = follow the system.
  Locale? get locale => switch (_prefs.getString('lang')) {
        'zh' => const Locale('zh'),
        'en' => const Locale('en'),
        _ => null,
      };

  String get langCode => _prefs.getString('lang') ?? '';

  Future<void> setThemeMode(ThemeMode m) async {
    await _prefs.setString('themeMode', m.name);
    notifyListeners();
  }

  Future<void> setLang(String code) async {
    code.isEmpty ? await _prefs.remove('lang') : await _prefs.setString('lang', code);
    notifyListeners();
  }
}
