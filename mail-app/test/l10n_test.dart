import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psg_mail/l10n/native_strings.dart';
import 'package:psg_mail/l10n/web_strings.g.dart';

void main() {
  test('every s.t() key exists in the web or native strings', () {
    final used = <String>{};
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      for (final m in RegExp(r"\bs\.t\('([A-Za-z0-9_]+)'").allMatches(f.readAsStringSync())) {
        used.add(m[1]!);
      }
      for (final m in RegExp(r"\.t\('([A-Za-z0-9_]+)'").allMatches(f.readAsStringSync())) {
        used.add(m[1]!);
      }
    }
    final missing = used.where((k) => !webStringsEn.containsKey(k) && !nativeStringsEn.containsKey(k)).toList()..sort();
    expect(missing, isEmpty, reason: 'unknown string keys: $missing');
    final noZh = nativeStringsEn.keys.where((k) => !nativeStringsZh.containsKey(k)).toList();
    expect(noZh, isEmpty, reason: 'native strings without Chinese: $noZh');
  });
}
