import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_quill/quill_delta.dart';
import 'package:flutter_quill_delta_from_html/flutter_quill_delta_from_html.dart';
import 'package:vsc_quill_delta_to_html/vsc_quill_delta_to_html.dart';

/// HTML <-> editor document, for the composer (web: TinyMCE's HTML).
class MailHtml {
  /// An editor document from mail HTML (templates, signatures, drafts).
  static Document documentFromHtml(String html) {
    if (html.trim().isEmpty) return Document();
    try {
      // The converter runs consecutive <p> blocks together ("<p>a</p><p>b</p>"
      // -> "ab") but keeps <div> blocks apart, so read paragraphs as divs.
      final normalised = html
          .replaceAllMapped(RegExp(r'<p(\s[^>]*)?>', caseSensitive: false), (m) => '<div${m[1] ?? ''}>')
          .replaceAll(RegExp(r'</p\s*>', caseSensitive: false), '</div>');
      final delta = HtmlToDelta().convert(normalised, transformTableAsEmbed: false);
      if (delta.isEmpty) return Document();
      // A document must end with a newline.
      final last = delta.last.data;
      if (last is! String || !last.endsWith('\n')) delta.insert('\n');
      return Document.fromDelta(delta);
    } catch (_) {
      return Document()..insert(0, html.replaceAll(RegExp(r'<[^>]*>'), ''));
    }
  }

  /// Inline-styled HTML suitable for mail clients.
  static String htmlFromDocument(Document doc) {
    final ops = doc.toDelta().toJson();
    return QuillDeltaToHtmlConverter(List<Map<String, dynamic>>.from(ops), ConverterOptions.forEmail()).convert();
  }

  /// Appends [html] to the end of [doc] (template insert, quotes).
  static void appendHtml(QuillController c, String html) {
    final extra = documentFromHtml(html).toDelta();
    final at = c.document.length - 1;
    c.document.compose((Delta()..retain(at)).concat(extra), ChangeSource.local);
  }

  /// Puts [html] in front of the existing content.
  static void prependHtml(QuillController c, String html) {
    final extra = documentFromHtml(html).toDelta();
    c.document.compose(extra, ChangeSource.local);
  }
}
