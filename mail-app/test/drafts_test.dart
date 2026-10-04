import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psg_mail/api/api_client.dart';
import 'package:psg_mail/state/drafts.dart';

void main() {
  test('drafts persist per scope and empty drafts are dropped', () async {
    final dir = await Directory.systemTemp.createTemp('drafts');
    final a = DraftStore('srv|1', dir: dir);
    await a.save(Draft(id: '1', accountId: 3, to: ['x@y.z'], subject: 'Hi', text: 'body',
        attachments: [const OutgoingAttachment('a.txt', 'text/plain', 3, 'YWJj')]));
    await a.save(Draft(id: '2', accountId: 3)); // empty → not kept

    final again = DraftStore('srv|1', dir: dir);
    await again.load();
    expect(again.drafts.map((d) => d.id), ['1']);
    expect(again.drafts.single.attachments.single.filename, 'a.txt');

    final other = DraftStore('srv|2', dir: dir);
    await other.load();
    expect(other.drafts, isEmpty);

    await again.remove(['1']);
    final after = DraftStore('srv|1', dir: dir);
    await after.load();
    expect(after.drafts, isEmpty);
    await dir.delete(recursive: true);
  });
}
