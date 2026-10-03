import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/session.dart';
import '../widgets/reader_view.dart';

final _emailRe = RegExp(r'^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$');

List<String> splitAddresses(String raw) =>
    raw.split(RegExp(r'[,;\s]+')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

String _escape(String s) => const HtmlEscape(HtmlEscapeMode.element).convert(s);

String _plainToHtml(String text) =>
    text.split('\n').map((l) => l.isEmpty ? '<p><br></p>' : '<p>${_escape(l)}</p>').join();

String _prefixed(String subject, String prefix, List<String> known) {
  final t = subject.trim();
  return known.any((p) => t.toLowerCase().startsWith(p.toLowerCase())) ? t : '$prefix$t';
}

/// New message, reply, reply-all or forward. Pops `true` once sent.
class ComposeScreen extends StatefulWidget {
  final ReplyMode? mode;
  final Email? original;
  const ComposeScreen({super.key, this.mode, this.original});

  @override
  State<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends State<ComposeScreen> {
  final _to = TextEditingController();
  final _cc = TextEditingController();
  final _bcc = TextEditingController();
  final _subject = TextEditingController();
  final _body = TextEditingController();
  final _files = <OutgoingAttachment>[];
  late Account _from;
  bool _showCc = false;
  bool _sending = false;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    final session = context.read<Session>();
    _from = session.current!;
    final o = widget.original;
    if (o != null) {
      // Reply from the address the mail was received on, when we own it.
      _from = session.accounts.where((a) => a.accountId == o.accountId).firstOrNull ?? _from;
      final self = _from.email.toLowerCase();
      switch (widget.mode!) {
        case ReplyMode.reply:
          _to.text = o.isSent ? o.recipients.map((a) => a.address).join(', ') : o.sendEmail;
          _subject.text = _prefixed(o.subject, 'Re: ', ['re:', 're：', '回复：', '回复:']);
        case ReplyMode.replyAll:
          final to = <String>{if (!o.isSent) o.sendEmail, ...o.recipients.map((a) => a.address)}
            ..removeWhere((a) => a.toLowerCase() == self);
          final cc = o.cc.map((a) => a.address).where((a) => a.toLowerCase() != self && !to.contains(a)).toList();
          _to.text = to.join(', ');
          _cc.text = cc.join(', ');
          _showCc = cc.isNotEmpty;
          _subject.text = _prefixed(o.subject, 'Re: ', ['re:', 're：', '回复：', '回复:']);
        case ReplyMode.forward:
          _subject.text = _prefixed(o.subject, 'Fwd: ', ['fwd:', 'fw:', '转发：', '转发:']);
      }
    }
    for (final c in [_to, _cc, _bcc, _subject, _body]) {
      c.addListener(() => _dirty = true);
    }
  }

  @override
  void dispose() {
    for (final c in [_to, _cc, _bcc, _subject, _body]) {
      c.dispose();
    }
    super.dispose();
  }

  String _quoted(S s) {
    final o = widget.original;
    if (o == null) return '';
    final body = o.content.trim().isNotEmpty
        ? o.content.replaceAllMapped(RegExp(r'\{\{domain\}\}([^"\x27)\s]+)'),
            (m) => context.read<Session>().ossUrl(m[1]!))
        : '<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${_escape(o.text)}</pre>';
    final when = o.created == null ? '' : DateFormat('yyyy-MM-dd HH:mm').format(o.created!);
    final who = '${_escape(o.name)} &lt;${_escape(o.sendEmail)}&gt;';
    if (widget.mode == ReplyMode.forward) {
      return '<p><br></p><div>${s.forwardedHeader}<br>${s.from}: $who<br>${s.date}: $when<br>'
          '${s.subject}: ${_escape(o.subject)}</div><br>$body';
    }
    return '<div><br>$when $who ${s.wrote}:</div>'
        '<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex;">$body</blockquote>';
  }

  Future<void> _pickFiles() async {
    final picked = await FilePicker.pickFiles();
    if (picked.isEmpty) return;
    final added = <OutgoingAttachment>[];
    for (final f in picked) {
      final bytes = await f.readAsBytes();
      added.add(OutgoingAttachment(f.name, _mime(f.extension), bytes.length, base64Encode(bytes)));
    }
    if (!mounted) return;
    setState(() {
      _files.addAll(added);
      _dirty = true;
    });
  }

  static String _mime(String? ext) => switch ((ext ?? '').toLowerCase()) {
        'pdf' => 'application/pdf',
        'png' => 'image/png',
        'jpg' || 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'txt' => 'text/plain',
        'zip' => 'application/zip',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        _ => 'application/octet-stream',
      };

  Future<void> _send() async {
    final s = S.of(context);
    final session = context.read<Session>();
    final to = splitAddresses(_to.text);
    final cc = splitAddresses(_cc.text);
    final bcc = splitAddresses(_bcc.text);
    if (to.isEmpty) return _toast(s.needRecipient);
    if ([...to, ...cc, ...bcc].any((a) => !_emailRe.hasMatch(a))) return _toast(s.invalidAddress);

    final signature = session.user?.signature ?? '';
    final html = _plainToHtml(_body.text) +
        (signature.isNotEmpty ? '<p><br></p><p style="color:#999;margin-top:0">-- </p>$signature' : '') +
        _quoted(s);
    setState(() => _sending = true);
    try {
      await session.api.send(OutgoingMail(
        accountId: _from.accountId,
        name: _from.name.isNotEmpty ? _from.name : (session.user?.name ?? ''),
        to: to,
        cc: cc,
        bcc: bcc,
        subject: _subject.text.trim(),
        text: _body.text,
        html: html,
        sendType: switch (widget.mode) { ReplyMode.forward => 'forward', null => '', _ => 'reply' },
        emailId: widget.mode == ReplyMode.forward ? 0 : (widget.original?.emailId ?? 0),
        attachments: List.of(_files),
      ));
      if (!mounted) return;
      _dirty = false;
      Navigator.of(context).pop(true);
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  Future<bool> _confirmDiscard() async {
    if (!_dirty || _sending) return !_sending;
    final s = S.of(context);
    final discard = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(s.discardTitle),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(s.keepEditing)),
          TextButton(onPressed: () => Navigator.pop(c, true), child: Text(s.discard)),
        ],
      ),
    );
    return discard == true;
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final session = context.watch<Session>();
    final title = switch (widget.mode) {
      ReplyMode.reply => s.reply,
      ReplyMode.replyAll => s.replyAll,
      ReplyMode.forward => s.forward,
      null => s.compose,
    };
    InputDecoration field(String label) => InputDecoration(labelText: label, border: InputBorder.none, isDense: true);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmDiscard() && context.mounted) Navigator.of(context).pop(false);
      },
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.enter, control: true): _send,
          const SingleActivator(LogicalKeyboardKey.enter, meta: true): _send,
        },
        child: Scaffold(
          appBar: AppBar(
            title: Text(title),
            actions: [
              IconButton(tooltip: s.attach, icon: const Icon(Icons.attach_file), onPressed: _sending ? null : _pickFiles),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilledButton.icon(
                  onPressed: _sending ? null : _send,
                  icon: _sending
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send, size: 18),
                  label: Text(_sending ? s.sending : s.send),
                ),
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              if (session.accounts.length > 1)
                DropdownButtonFormField<int>(
                  initialValue: _from.accountId,
                  decoration: field(s.from),
                  items: [
                    for (final a in session.accounts) DropdownMenuItem(value: a.accountId, child: Text(a.email)),
                  ],
                  onChanged: (id) => setState(() => _from = session.accounts.firstWhere((a) => a.accountId == id)),
                )
              else
                ListTile(contentPadding: EdgeInsets.zero, title: Text(s.from), subtitle: Text(_from.email)),
              const Divider(),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _to,
                    decoration: field(s.to).copyWith(helperText: s.recipientsHint),
                    keyboardType: TextInputType.emailAddress,
                    autofocus: _to.text.isEmpty,
                  ),
                ),
                if (!_showCc) TextButton(onPressed: () => setState(() => _showCc = true), child: Text('${s.cc}/${s.bcc}')),
              ]),
              if (_showCc) ...[
                const Divider(),
                TextField(controller: _cc, decoration: field(s.cc), keyboardType: TextInputType.emailAddress),
                const Divider(),
                TextField(controller: _bcc, decoration: field(s.bcc), keyboardType: TextInputType.emailAddress),
              ],
              const Divider(),
              TextField(controller: _subject, decoration: field(s.subject)),
              const Divider(),
              if (_files.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final f in _files)
                      InputChip(
                        avatar: const Icon(Icons.insert_drive_file_outlined, size: 18),
                        label: Text('${f.filename} · ${formatSize(f.size)}'),
                        onDeleted: () => setState(() => _files.remove(f)),
                      ),
                  ]),
                ),
              TextField(
                controller: _body,
                decoration: InputDecoration(hintText: s.body, border: InputBorder.none),
                keyboardType: TextInputType.multiline,
                minLines: 10,
                maxLines: null,
                autofocus: _to.text.isNotEmpty,
              ),
              if (widget.original != null)
                Text(
                  widget.mode == ReplyMode.forward ? s.forwardedHeader : '${widget.original!.sendEmail} ${s.wrote}: …',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
                ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
