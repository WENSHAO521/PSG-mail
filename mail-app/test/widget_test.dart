import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:psg_mail/api/api_client.dart';
import 'package:psg_mail/api/models.dart';
import 'package:psg_mail/main.dart';
import 'package:psg_mail/screens/compose_screen.dart';
import 'package:psg_mail/services/updater.dart';
import 'package:psg_mail/state/mail_watcher.dart';
import 'package:psg_mail/state/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response ok(Object? data) =>
    http.Response(jsonEncode({'code': 200, 'message': 'success', 'data': data}), 200,
        headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  group('Session.apiBase', () {
    test('normalises server addresses', () {
      expect(Session.apiBase('mail.example.com'), 'https://mail.example.com/api');
      expect(Session.apiBase('https://mail.example.com/'), 'https://mail.example.com/api');
      expect(Session.apiBase('https://mail.example.com/api'), 'https://mail.example.com/api');
      expect(Session.apiBase('http://127.0.0.1:8787'), 'http://127.0.0.1:8787/api');
    });
  });

  group('ApiClient', () {
    test('sends the token and unwraps the envelope', () async {
      late http.Request seen;
      final api = ApiClient(
        baseUrl: 'https://x.test/api',
        token: 'tok',
        client: MockClient((req) async {
          seen = req;
          return ok({'list': [
            {'emailId': 7, 'subject': 'Hi', 'sendEmail': 'a@b.c', 'name': 'A', 'type': 0, 'unread': 0, 'isStar': 1,
             'createTime': '2026-10-03 10:00:00', 'attList': [], 'recipient': '[{"name":"Me","address":"me@x.test"}]'},
          ], 'total': 1});
        }),
      );
      final page = await api.folder(Folder.inbox,
          account: Account.fromJson({'accountId': 3, 'email': 'me@x.test', 'allReceive': 0}));
      expect(seen.headers['Authorization'], 'tok');
      expect(seen.url.path, '/api/email/list');
      expect(seen.url.queryParameters['accountId'], '3');
      expect(seen.url.queryParameters['type'], '0');
      expect(page.items.single.emailId, 7);
      expect(page.items.single.isUnread, isTrue);
      expect(page.items.single.isStar, isTrue);
      expect(page.items.single.recipients.single.address, 'me@x.test');
      expect(page.hasMore, isFalse);
    });

    test('maps error codes and reports 401', () async {
      var unauthorized = false;
      final api = ApiClient(
        baseUrl: 'https://x.test/api',
        client: MockClient((_) async =>
            http.Response(jsonEncode({'code': 401, 'message': 'expired'}), 200)),
      )..onUnauthorized = () => unauthorized = true;
      await expectLater(api.userInfo(), throwsA(isA<ApiException>().having((e) => e.code, 'code', 401)));
      expect(unauthorized, isTrue);
    });

    test('builds the send payload the worker expects', () {
      final json = const OutgoingMail(
        accountId: 1, name: 'Me', to: ['a@b.c'], subject: 'S', text: 't', html: '<p>t</p>',
        sendType: 'reply', emailId: 9,
      ).toJson();
      expect(json['receiveEmail'], ['a@b.c']);
      expect(json['content'], '<p>t</p>');
      expect(json['sendType'], 'reply');
      expect(json['emailId'], 9);
    });

    test('oss urls follow the bucket domain or the worker proxy', () {
      final api = ApiClient(baseUrl: 'https://x.test/api');
      expect(api.ossUrl('a/b.png', ''), 'https://x.test/api/oss/a/b.png');
      expect(api.ossUrl('a/b.png', 'cdn.test/'), 'https://cdn.test/a/b.png');
    });
  });

  group('Updater', () {
    test('compares versions', () {
      expect(Updater.isNewer('v3.2.0', '3.1.2'), isTrue);
      expect(Updater.isNewer('3.2.0', '3.2.0'), isFalse);
      expect(Updater.isNewer('3.10.0', '3.9.9'), isTrue);
      expect(Updater.isNewer('3.1', '3.1.1'), isFalse);
    });

    test('picks the asset for each platform', () {
      final assets = [
        {'name': 'PSG-Mail-3.2.0-android-universal.apk', 'browser_download_url': 'apk'},
        {'name': 'PSG-Mail-3.2.0-windows-setup.exe', 'browser_download_url': 'exe'},
        {'name': 'PSG-Mail-3.2.0-macos.dmg', 'browser_download_url': 'dmg'},
        {'name': 'PSG-Mail-3.2.0-linux-x64.tar.gz', 'browser_download_url': 'tgz'},
        {'name': 'SHA256SUMS', 'browser_download_url': 'sums'},
      ];
      expect(Updater.pickAsset(assets, 'android'), 'apk');
      expect(Updater.pickAsset(assets, 'windows'), 'exe');
      expect(Updater.pickAsset(assets, 'macos'), 'dmg');
      expect(Updater.pickAsset(assets, 'linux'), 'tgz');
      expect(Updater.pickAsset(assets, 'ios'), isNull);
    });
  });

  testWidgets('MailWatcher reports only mail newer than the baseline', (tester) async {
    final requests = <Uri>[];
    final api = ApiClient(
      baseUrl: 'https://x.test/api',
      client: MockClient((req) async {
        requests.add(req.url);
        if (req.url.path.endsWith('/email/list')) {
          return ok({'list': [{'emailId': 10, 'type': 0}]});
        }
        // /email/latest
        return ok([
          {'emailId': 12, 'type': 0, 'subject': 'b'},
          {'emailId': 11, 'type': 0, 'subject': 'a'},
        ]);
      }),
    );
    final got = <int>[];
    final watcher = MailWatcher(api,
        account: Account.fromJson({'accountId': 3, 'allReceive': 0}),
        onNewMail: (mail) => got.addAll(mail.map((e) => e.emailId)));
    await tester.runAsync(() async {
      await watcher.start();
      await watcher.poll();
    });
    watcher.stop();
    expect(requests.last.queryParameters['emailId'], '10');
    expect(got, [12, 11]);
  });

  test('splitAddresses', () {
    expect(splitAddresses('a@b.c, d@e.f;g@h.i  '), ['a@b.c', 'd@e.f', 'g@h.i']);
  });

  testWidgets('shows the login screen when signed out', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final session = Session(await SharedPreferences.getInstance());
    await tester.pumpWidget(ChangeNotifierProvider.value(value: session, child: const PsgMailApp()));
    await tester.pumpAndSettle();
    expect(find.byType(TextFormField), findsNWidgets(3));
    expect(find.byType(FilledButton), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);
  });
}
