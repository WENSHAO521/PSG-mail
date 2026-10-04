import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

/// A newer release with a download for this platform.
class AppUpdate {
  final String version;
  final String url;
  const AppUpdate(this.version, this.url);
}

/// Checks the GitHub release feed the old apps used
/// (mail-vue/src/utils/android-update-service.js) for a newer version.
class Updater {
  static const releaseApi = 'https://api.github.com/repos/WENSHAO521/PSG-mail/releases/latest';

  static List<int> _parts(String v) =>
      v.replaceFirst(RegExp(r'^v', caseSensitive: false), '').split('.').map((p) => int.tryParse(p) ?? 0).toList();

  static bool isNewer(String remote, String current) {
    final r = _parts(remote), c = _parts(current);
    for (var i = 0; i < (r.length > c.length ? r.length : c.length); i++) {
      final a = i < r.length ? r[i] : 0, b = i < c.length ? c[i] : 0;
      if (a != b) return a > b;
    }
    return false;
  }

  /// The release asset for this OS. Names follow release.yml:
  /// `PSG-Mail-<ver>-android-*.apk`, `-windows-setup.exe`, `-macos.dmg`,
  /// `-linux-x64.tar.gz`.
  static String? pickAsset(List assets, String os) {
    bool match(String name) => switch (os) {
          'android' => name.endsWith('.apk') && name.contains('android'),
          'windows' => name.endsWith('.exe') && name.contains('windows'),
          'macos' => name.endsWith('.dmg'),
          'linux' => name.contains('linux') && name.endsWith('.tar.gz'),
          _ => false,
        };
    for (final a in assets.whereType<Map>()) {
      final name = '${a['name'] ?? ''}'.toLowerCase();
      if (match(name)) return '${a['browser_download_url']}';
    }
    return null;
  }

  static Future<AppUpdate?> check({http.Client? client}) async {
    if (kIsWeb) return null;
    final c = client ?? http.Client();
    try {
      final res = await c
          .get(Uri.parse(releaseApi), headers: {'Accept': 'application/vnd.github+json'})
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return null;
      final release = jsonDecode(res.body) as Map<String, dynamic>;
      final remote = '${release['tag_name'] ?? release['name'] ?? ''}';
      final current = (await PackageInfo.fromPlatform()).version;
      if (!isNewer(remote, current)) return null;
      final url = pickAsset(release['assets'] as List? ?? const [], Platform.operatingSystem);
      return AppUpdate(remote.replaceFirst(RegExp(r'^v'), ''), url ?? '${release['html_url']}');
    } catch (_) {
      return null;
    } finally {
      if (client == null) c.close();
    }
  }
}
