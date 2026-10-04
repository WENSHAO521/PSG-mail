import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../api/models.dart';

/// Printing a message (web: handlePrint). Where the platform can lay out
/// HTML (Android, macOS) the printout keeps the mail's formatting; on
/// Windows/Linux it falls back to a plain-text page.
class PrintService {
  static String _escape(String v) => v
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  static Future<void> printEmail(Email e, String resolvedHtml, {required String noSubject}) async {
    final subject = e.subject.isEmpty ? noSubject : e.subject;
    final header = 'From: ${e.name} <${e.sendEmail}> — ${e.createTime}';
    final canHtml = !kIsWeb && (Platform.isAndroid || Platform.isMacOS || Platform.isIOS);
    if (canHtml) {
      final body = e.content.isNotEmpty
          ? resolvedHtml
          : '<pre style="white-space:pre-wrap;font-family:sans-serif">${_escape(e.text)}</pre>';
      final html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_escape(subject)}</title></head><body>'
          '<h2 style="font-size:18px">${_escape(subject)}</h2>'
          '<p style="color:#666;font-size:13px">${_escape(header)}</p><hr>$body</body></html>';
      await Printing.layoutPdf(
        name: subject,
        // Deprecated upstream but still the only HTML-to-PDF path the plugin
        // offers; the non-HTML platforms use the text fallback below.
        // ignore: deprecated_member_use
        onLayout: (format) => Printing.convertHtml(format: format, html: html),
      );
      return;
    }
    final font = await PdfGoogleFonts.notoSansSCRegular();
    final bold = await PdfGoogleFonts.notoSansSCBold();
    final text = e.text.isNotEmpty ? e.text : e.preview;
    final doc = pw.Document(title: subject);
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      theme: pw.ThemeData.withFont(base: font, bold: bold),
      build: (_) => [
        pw.Text(subject, style: pw.TextStyle(font: bold, fontSize: 16)),
        pw.SizedBox(height: 6),
        pw.Text(header, style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
        pw.Divider(),
        for (final para in text.split('\n')) pw.Text(para, style: const pw.TextStyle(fontSize: 11)),
      ],
    ));
    await Printing.layoutPdf(name: subject, onLayout: (_) => doc.save());
  }
}
