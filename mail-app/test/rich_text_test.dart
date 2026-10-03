import 'package:flutter/services.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psg_mail/services/rich_text.dart';

void main() {
  test('html round-trips basic formatting', () {
    final doc = MailHtml.documentFromHtml('<p>Hello <b>bold</b> and <i>it</i></p><ul><li>one</li><li>two</li></ul>');
    expect(doc.toPlainText(), contains('Hello bold and it'));
    final html = MailHtml.htmlFromDocument(doc);
    expect(html, contains('<strong>bold</strong>'));
    expect(html, contains('<em>it</em>'));
    expect(html, contains('<li'));
  });

  test('separate paragraphs stay on separate lines', () {
    final doc = MailHtml.documentFromHtml('<p>您好，</p><p><br></p><p>诚邀您参加<b>周五</b>的会议。</p>');
    expect(doc.toPlainText(), '您好，\n\n诚邀您参加周五的会议。\n');
  });

  test('plain text escapes markup', () {
    final doc = Document()..insert(0, 'a <b> & c');
    expect(MailHtml.htmlFromDocument(doc), contains('a &lt;b&gt; &amp; c'));
  });

  test('append and prepend keep existing text', () {
    final c = QuillController(document: Document()..insert(0, 'middle'), selection: const TextSelection.collapsed(offset: 0));
    MailHtml.appendHtml(c, '<p>end</p>');
    MailHtml.prependHtml(c, '<p>start</p>');
    final text = c.document.toPlainText();
    expect(text.indexOf('start') < text.indexOf('middle'), isTrue);
    expect(text.indexOf('middle') < text.indexOf('end'), isTrue);
  });
}
