import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../services/rich_text.dart';
import '../state/drafts.dart';
import '../state/session.dart';
import '../widgets/contacts_dialog.dart';
import '../widgets/reader_view.dart';
import '../widgets/recipient_field.dart';
import '../widgets/schedule_sheet.dart';

List<String> splitAddresses(String raw) =>
    raw.split(RegExp(r'[,;\s]+')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

String _escape(String s) => const HtmlEscape(HtmlEscapeMode.element).convert(s);

String _prefixed(String subject, String prefix, List<String> known) {
  final t = subject.trim();
  return known.any((p) => t.toLowerCase().startsWith(p.toLowerCase())) ? t : '$prefix$t';
}

/// What happened when the composer closed.
sealed class ComposeResult {
  const ComposeResult();
}

class ComposeSent extends ComposeResult {
  const ComposeSent();
}

class ComposeScheduled extends ComposeResult {
  final DateTime at;
  const ComposeScheduled(this.at);
}

/// Sent with an undo window: the mail is a scheduled send [seconds] from
/// now; cancelling [scheduleId] and reopening [draft] undoes it.
class ComposeUndoable extends ComposeResult {
  final int scheduleId;
  final int seconds;
  final Draft draft;
  final String subject;
  const ComposeUndoable(this.scheduleId, this.seconds, this.draft, this.subject);
}

const _aiOperations = {
  'translate_zh': 'aiTranslateZh',
  'translate_en': 'aiTranslateEn',
  'rewrite': 'aiPolish',
  'formal': 'aiFormal',
  'concise': 'aiConcise',
  'grammar': 'aiGrammar',
};

/// New message, reply, reply-all or forward (web: layout/write).
class ComposeScreen extends StatefulWidget {
  final ReplyMode? mode;
  final Email? original;

  /// A saved draft to keep writing (Drafts page, or an undone send).
  final Draft? draft;

  /// A send payload to reopen, e.g. a scheduled mail being edited
  /// (scheduled-email-service beginEdit()).
  final Map<String, dynamic>? prefill;

  /// Pre-filled recipients (e.g. writing to a contact group).
  final List<String> to;

  /// Reopen as an ordinary message rather than a saved draft (Undo Send).
  final bool restored;

  const ComposeScreen(
      {super.key, this.mode, this.original, this.draft, this.prefill, this.to = const [], this.restored = false});

  @override
  State<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends State<ComposeScreen> {
  final _subject = TextEditingController();
  final _editorFocus = FocusNode();
  final _editorScroll = ScrollController();
  late QuillController _editor;
  final _toKey = GlobalKey<RecipientFieldState>();
  final _ccKey = GlobalKey<RecipientFieldState>();
  final _bccKey = GlobalKey<RecipientFieldState>();

  List<String> _to = [];
  List<String> _cc = [];
  List<String> _bcc = [];
  final _files = <OutgoingAttachment>[];
  late Account _from;
  bool _autoPicked = false;
  bool _showCc = false;
  bool _showBcc = false;
  bool _busy = false;
  String? _draftId;
  String _sendType = '';
  int _replyToId = 0;

  /// The original message, quoted below the editor for reply/forward.
  String _quote = '';
  bool _includeQuote = true;

  /// Reply/forward as first opened; closing it unchanged needs no prompt.
  late String _initialSignature;
  bool _touched = false;

  String get _signature =>
      [_to.join(','), _cc.join(','), _subject.text, _editor.document.toPlainText(), _files.length].join('\u0000');

  @override
  void initState() {
    super.initState();
    final session = context.read<Session>();
    _from = session.current!;
    _sendType = switch (widget.mode) { ReplyMode.forward => 'forward', null => '', _ => 'reply' };
    _replyToId = widget.mode == ReplyMode.forward ? 0 : (widget.original?.emailId ?? 0);
    var html = '';

    final d = widget.draft;
    final p = widget.prefill;
    if (d != null) {
      _draftId = widget.restored ? null : d.id;
      _sendType = d.sendType;
      _replyToId = d.emailId;
      _setFrom(d.accountId);
      _to = [...d.to];
      _cc = [...d.cc];
      _bcc = [...d.bcc];
      _subject.text = d.subject;
      _files.addAll(d.attachments);
      html = d.html.isNotEmpty ? d.html : _plainToHtml(d.text);
    } else if (p != null) {
      List<String> list(String k) => ((p[k] as List?) ?? const []).map((e) => '$e').toList();
      _sendType = '${p['sendType'] ?? ''}';
      _replyToId = p['emailId'] is int ? p['emailId'] as int : 0;
      _setFrom(p['accountId'] is int ? p['accountId'] as int : null);
      _to = list('receiveEmail');
      _cc = list('cc');
      _bcc = list('bcc');
      _subject.text = '${p['subject'] ?? ''}';
      _files.addAll(((p['attachments'] as List?) ?? const []).whereType<Map>().map((a) => OutgoingAttachment(
          '${a['filename']}', '${a['contentType']}', a['size'] is int ? a['size'] as int : 0, '${a['content']}')));
      html = '${p['content'] ?? ''}';
      if (html.isEmpty) html = _plainToHtml('${p['text'] ?? ''}');
    } else {
      _to = [...widget.to];
      html = _signatureBlock(session);
      final o = widget.original;
      if (o != null) _setUpReply(session, o);
    }
    _showCc = _cc.isNotEmpty;
    _showBcc = _bcc.isNotEmpty;
    _editor = QuillController(
      document: MailHtml.documentFromHtml(html),
      selection: const TextSelection.collapsed(offset: 0),
    );
    _editor.addListener(() => _touched = true);
    _subject.addListener(() => _touched = true);
    _initialSignature = _signature;
    _touched = widget.prefill != null;
  }

  void _setFrom(int? accountId) {
    final session = context.read<Session>();
    _from = session.accounts.where((a) => a.accountId == accountId).firstOrNull ?? _from;
  }

  String _signatureBlock(Session session) {
    final sig = session.user?.signature ?? '';
    return sig.isEmpty ? '' : '<p><br></p><p style="color:#999;margin-top:0">-- </p>$sig';
  }

  void _setUpReply(Session session, Email o) {
    // Reply from the mailbox the mail arrived at (Settings → Profile, on by
    // default), when this user can send from it.
    if (widget.mode != ReplyMode.forward && (session.user?.replyFromReceived ?? true)) {
      final acc = session.accounts.where((a) => a.accountId == o.accountId).firstOrNull;
      if (acc != null && acc.accountId != _from.accountId) {
        _from = acc;
        _autoPicked = true;
      }
    }
    final self = _from.email.toLowerCase();
    const reKnown = ['re:', 're：', '回复：', '回复:'];
    switch (widget.mode!) {
      case ReplyMode.reply:
        _to = o.isSent ? o.recipients.map((a) => a.address).toList() : [o.sendEmail];
        _subject.text = _prefixed(o.subject, 'Re: ', reKnown);
      case ReplyMode.replyAll:
        final to = <String>{if (!o.isSent) o.sendEmail, ...o.recipients.map((a) => a.address)}
          ..removeWhere((a) => a.toLowerCase() == self && a.toLowerCase() != o.sendEmail.toLowerCase());
        _to = to.toList();
        _cc = o.cc.map((a) => a.address).where((a) => a.toLowerCase() != self && !to.contains(a)).toList();
        _subject.text = _prefixed(o.subject, 'Re: ', reKnown);
      case ReplyMode.forward:
        _subject.text = _prefixed(o.subject, 'Fwd: ', ['fwd:', 'fw:', '转发：', '转发:']);
    }
    final body = o.content.trim().isNotEmpty
        ? resolveStoredImages(session, o.content)
        : '<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${_escape(o.text)}</pre>';
    if (widget.mode == ReplyMode.forward) {
      _quote = '<p><br></p>$body';
    } else {
      final when = o.created == null ? '' : DateFormat('yyyy-MM-dd HH:mm').format(o.created!);
      _quote = '<div><br>$when ${_escape(o.name)} &lt;${_escape(o.sendEmail)}&gt; ${_wroteWord()}:</div>'
          '<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex;">'
          '<article>$body</article></blockquote>';
    }
  }

  String _wroteWord() => S.of(context).t('wrote');

  static String _plainToHtml(String text) =>
      text.split('\n').map((l) => l.isEmpty ? '<p><br></p>' : '<p>${_escape(l)}</p>').join();

  @override
  void dispose() {
    _subject.dispose();
    _editor.dispose();
    _editorFocus.dispose();
    _editorScroll.dispose();
    super.dispose();
  }

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  bool _commitFields() {
    final ok = [_toKey, _ccKey, _bccKey].every((k) => k.currentState?.commit() ?? true);
    if (!ok) _toast(S.of(context).t('notEmailMsg'));
    return ok;
  }

  String get _bodyText => _editor.document.toPlainText().trim();

  String _html() => MailHtml.htmlFromDocument(_editor.document) + (_quote.isNotEmpty && _includeQuote ? _quote : '');

  OutgoingMail _mail() {
    final session = context.read<Session>();
    return OutgoingMail(
      accountId: _from.accountId,
      name: _from.name.isNotEmpty ? _from.name : (session.user?.name ?? ''),
      to: _to,
      cc: _cc,
      bcc: _bcc,
      subject: _subject.text.trim(),
      text: _editor.document.toPlainText(),
      html: _html(),
      sendType: _sendType,
      emailId: _replyToId,
      attachments: List.of(_files),
    );
  }

  /// Web validateBeforeSend().
  bool _validate() {
    final s = S.of(context);
    if (!_commitFields()) return false;
    if (_to.isEmpty) {
      _toast(s.t('emptyRecipientMsg'));
      return false;
    }
    if (_subject.text.trim().isEmpty) {
      _toast(s.t('emptySubjectMsg'));
      return false;
    }
    if (_bodyText.isEmpty && (_quote.isEmpty || !_includeQuote)) {
      _toast(s.t('emptyContentMsg'));
      return false;
    }
    return true;
  }

  Future<String> _timezone() async {
    try {
      return (await FlutterTimezone.getLocalTimezone()).identifier;
    } catch (_) {
      return DateTime.now().timeZoneName;
    }
  }

  Future<void> _afterLeaving() async {
    final session = context.read<Session>();
    await session.rememberRecipients([..._to, ..._cc, ..._bcc]);
    if (_draftId != null) await session.drafts?.remove([_draftId!]);
  }

  Future<void> _send() async {
    if (_busy || !_validate()) return;
    final session = context.read<Session>();
    final s = S.of(context);
    final mail = _mail();
    setState(() => _busy = true);
    try {
      final seconds = session.user?.undoSendSeconds ?? 10;
      if (seconds > 0) {
        // Undo Send: a server-side scheduled send a few seconds out, so the
        // mail still goes if the app closes (web sendWithUndo()).
        final at = DateTime.fromMillisecondsSinceEpoch(
            (DateTime.now().millisecondsSinceEpoch ~/ 1000 + seconds) * 1000);
        final id = await session.api.schedule(mail, at, await _timezone());
        final snapshot = _asDraft();
        await _afterLeaving();
        if (mounted) Navigator.of(context).pop(ComposeUndoable(id, seconds, snapshot, mail.subject));
      } else {
        await session.api.send(mail);
        await _afterLeaving();
        if (mounted) Navigator.of(context).pop(const ComposeSent());
      }
    } catch (e) {
      if (mounted) _toast('${s.t('sendFailMsg')}: ${s.error(e)}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendLater() async {
    if (_busy || !_validate()) return;
    final at = await showScheduleSheet(context);
    if (at == null || !mounted) return;
    final s = S.of(context);
    final session = context.read<Session>();
    setState(() => _busy = true);
    try {
      await session.api.schedule(_mail(), at, await _timezone());
      await _afterLeaving();
      if (mounted) Navigator.of(context).pop(ComposeScheduled(at));
    } catch (e) {
      if (mounted) _toast('${s.t('scheduleFailMsg')}: ${s.error(e)}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
      _touched = true;
    });
  }

  static String _mime(String? ext) => switch ((ext ?? '').toLowerCase()) {
        'pdf' => 'application/pdf',
        'png' => 'image/png',
        'jpg' || 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'txt' => 'text/plain',
        'csv' => 'text/csv',
        'zip' => 'application/zip',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        _ => 'application/octet-stream',
      };

  Future<void> _contacts() async {
    final picked = await showContactsDialog(context, current: _to);
    if (picked == null) return;
    setState(() => _to = {..._to, ...picked}.toList());
  }

  Future<void> _insertTemplate() async {
    final s = S.of(context);
    final api = context.read<Session>().api;
    List<MailTemplate> list;
    try {
      list = await api.templates();
    } catch (e) {
      _toast(s.error(e));
      return;
    }
    if (!mounted) return;
    final tpl = await showDialog<MailTemplate>(
      context: context,
      builder: (c) => SimpleDialog(
        title: Text(s.t('insertTemplate')),
        children: list.isEmpty
            ? [Padding(padding: const EdgeInsets.all(24), child: Text(s.t('noTemplates')))]
            : [
                for (final t in list)
                  SimpleDialogOption(
                    onPressed: () => Navigator.pop(c, t),
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(t.name),
                      subtitle: t.subject.isEmpty ? null : Text(t.subject),
                    ),
                  ),
              ],
      ),
    );
    if (tpl == null) return;
    // Web insertTemplate(): template first, existing text after it.
    setState(() {
      if (tpl.subject.isNotEmpty && _subject.text.trim().isEmpty) _subject.text = tpl.subject;
      MailHtml.prependHtml(_editor, tpl.content);
    });
  }

  Future<void> _clear() async {
    final s = S.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(s.t('clearContentConfirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(s.t('cancel'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(s.t('confirm'))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _to = [];
      _cc = [];
      _bcc = [];
      _subject.clear();
      _files.clear();
      _editor.clear();
      _quote = '';
    });
  }

  Future<void> _ai(String operation) async {
    final s = S.of(context);
    final sel = _editor.selection;
    final selected = sel.isCollapsed
        ? ''
        : _editor.document.getPlainText(sel.start, sel.end - sel.start);
    if (selected.trim().isEmpty) {
      _toast(s.t('aiNoSelection'));
      return;
    }
    final api = context.read<Session>().api;
    String result;
    try {
      result = await api.aiTransform(operation, selected);
    } catch (e) {
      if (mounted) _toast(e is ApiException ? e.message : s.t('aiAssistantFail'));
      return;
    }
    if (!mounted || result.isEmpty) return;
    final replace = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(s.t('aiTransformPreview')),
        content: SizedBox(width: 480, child: SingleChildScrollView(child: SelectableText(result))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(s.t('cancel'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(s.t('aiReplaceSelection'))),
        ],
      ),
    );
    if (replace == true) {
      _editor.replaceText(sel.start, sel.end - sel.start, result, TextSelection.collapsed(offset: sel.start + result.length));
    }
  }

  Draft _asDraft() => Draft(
        id: _draftId ?? DraftStore.newId(),
        accountId: _from.accountId,
        to: _to,
        cc: _cc,
        bcc: _bcc,
        subject: _subject.text,
        text: _editor.document.toPlainText().trim(),
        html: _html(),
        sendType: _sendType,
        emailId: _replyToId,
        attachments: List.of(_files),
      );

  /// Web close(): an opened draft saves itself; an empty or untouched reply
  /// just closes; anything else asks whether to save a draft.
  Future<bool> _confirmClose() async {
    if (_busy) return false;
    for (final k in [_toKey, _ccKey, _bccKey]) {
      k.currentState?.commit();
    }
    final drafts = context.read<Session>().drafts;
    if (_draftId != null) {
      await drafts?.save(_asDraft());
      return true;
    }
    final d = _asDraft();
    final unchanged = _signature == _initialSignature;
    if (d.isEmpty || !_touched || unchanged) return true;
    final s = S.of(context);
    final choice = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(s.t('saveDraftConfirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, 'keep'), child: Text(s.keepEditing)),
          TextButton(onPressed: () => Navigator.pop(c, 'discard'), child: Text(s.discard)),
          FilledButton(onPressed: () => Navigator.pop(c, 'save'), child: Text(s.t('confirm'))),
        ],
      ),
    );
    if (choice == 'save') await drafts?.save(d);
    return choice == 'save' || choice == 'discard';
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final session = context.watch<Session>();
    final theme = Theme.of(context);
    final title = switch (_sendType) { 'reply' => s.t('reply'), 'forward' => s.t('forward'), _ => s.t('compose') };
    final sendLabel = switch (_sendType) { 'reply' => s.t('reply'), 'forward' => s.t('forward'), _ => s.t('send') };
    final recent = session.recentRecipients;
    final wide = MediaQuery.sizeOf(context).width > 720;

    Widget divider() => const Divider(height: 1);

    final fromRow = Row(children: [
      SizedBox(width: 64, child: Text(s.t('sender'), style: TextStyle(color: theme.colorScheme.outline))),
      Expanded(
        child: session.accounts.length > 1
            ? DropdownButtonHideUnderline(
                child: DropdownButton<int>(
                  isExpanded: true,
                  value: _from.accountId,
                  items: [
                    for (final a in session.accounts)
                      DropdownMenuItem(
                        value: a.accountId,
                        child: Text(a.name.isNotEmpty ? '${a.name} <${a.email}>' : a.email, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (id) => setState(() {
                    _from = session.accounts.firstWhere((a) => a.accountId == id);
                    _autoPicked = false;
                  }),
                ),
              )
            : Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(_from.email)),
      ),
      if (_autoPicked)
        Padding(
          padding: const EdgeInsets.only(left: 8),
          child: Text(s.t('senderAutoPicked'), style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.primary)),
        ),
    ]);

    final toolbar = QuillSimpleToolbar(
      controller: _editor,
      config: const QuillSimpleToolbarConfig(
        multiRowsDisplay: false,
        showFontFamily: false,
        showFontSize: false,
        showSmallButton: false,
        showInlineCode: false,
        showCodeBlock: false,
        showSubscript: false,
        showSuperscript: false,
        showSearchButton: false,
        showListCheck: false,
        showDirection: false,
        showAlignmentButtons: true,
        showIndent: true,
      ),
    );

    final page = Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: s.t('close'),
          icon: const Icon(Icons.close),
          onPressed: () async {
            if (await _confirmClose() && context.mounted) Navigator.of(context).pop();
          },
        ),
        title: Text(title),
        actions: [
          IconButton(tooltip: s.t('attachments'), icon: const Icon(Icons.attach_file), onPressed: _busy ? null : _pickFiles),
          IconButton(tooltip: s.t('insertTemplate'), icon: const Icon(Icons.description_outlined), onPressed: _insertTemplate),
          PopupMenuButton<String>(
            tooltip: s.t('aiTransform'),
            icon: const Icon(Icons.auto_awesome_outlined),
            onSelected: _ai,
            itemBuilder: (_) => [
              for (final op in _aiOperations.entries) PopupMenuItem(value: op.key, child: Text(s.t(op.value))),
            ],
          ),
          IconButton(tooltip: s.t('clear'), icon: const Icon(Icons.cleaning_services_outlined), onPressed: _clear),
          const SizedBox(width: 4),
          if (wide)
            OutlinedButton.icon(
              onPressed: _busy ? null : _sendLater,
              icon: const Icon(Icons.schedule_send_outlined, size: 18),
              label: Text(s.t('sendLater')),
            )
          else
            IconButton(tooltip: s.t('sendLater'), icon: const Icon(Icons.schedule_send_outlined), onPressed: _busy ? null : _sendLater),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton.icon(
              onPressed: _busy ? null : _send,
              icon: _busy
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send, size: 18),
              label: Text(sendLabel),
            ),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(children: [
            fromRow,
            divider(),
            RecipientField(
              key: _toKey,
              label: s.t('recipient'),
              values: _to,
              suggestions: recent,
              autofocus: _to.isEmpty && widget.draft == null,
              onChanged: (v) => setState(() {
                _to = v;
                _touched = true;
              }),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                if (!_showCc) TextButton(onPressed: () => setState(() => _showCc = true), child: Text(s.t('cc'))),
                if (!_showBcc) TextButton(onPressed: () => setState(() => _showBcc = true), child: Text(s.t('bcc'))),
                IconButton(tooltip: s.t('recentContacts'), icon: const Icon(Icons.contacts_outlined), onPressed: _contacts),
              ]),
            ),
            if (_showCc) ...[
              divider(),
              RecipientField(
                key: _ccKey,
                label: s.t('cc'),
                values: _cc,
                suggestions: recent,
                onChanged: (v) => setState(() => _cc = v),
              ),
            ],
            if (_showBcc) ...[
              divider(),
              RecipientField(
                key: _bccKey,
                label: s.t('bcc'),
                values: _bcc,
                suggestions: recent,
                onChanged: (v) => setState(() => _bcc = v),
              ),
            ],
            divider(),
            Row(children: [
              SizedBox(width: 64, child: Text(s.t('subject'), style: TextStyle(color: theme.colorScheme.outline))),
              Expanded(
                child: TextField(
                  controller: _subject,
                  decoration: const InputDecoration(border: InputBorder.none),
                  textInputAction: TextInputAction.next,
                  onSubmitted: (_) => _editorFocus.requestFocus(),
                ),
              ),
            ]),
            divider(),
          ]),
        ),
        Container(
          color: theme.colorScheme.surfaceContainerLow,
          width: double.infinity,
          child: toolbar,
        ),
        if (_files.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Wrap(spacing: 8, runSpacing: 8, children: [
                for (final f in _files)
                  InputChip(
                    avatar: Icon(isImageName(f.filename) ? Icons.image_outlined : Icons.insert_drive_file_outlined, size: 18),
                    label: Text('${f.filename} · ${formatSize(f.size)}'),
                    onDeleted: () => setState(() => _files.remove(f)),
                  ),
              ]),
            ),
          ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: QuillEditor(
              controller: _editor,
              focusNode: _editorFocus,
              scrollController: _editorScroll,
              config: QuillEditorConfig(
                placeholder: s.t('bodyPlaceholder'),
                padding: const EdgeInsets.only(bottom: 24),
                expands: false,
              ),
            ),
          ),
        ),
        if (_quote.isNotEmpty)
          _QuotePreview(
            html: _quote,
            included: _includeQuote,
            forward: _sendType == 'forward',
            onToggle: (v) => setState(() {
              _includeQuote = v;
              _touched = true;
            }),
          ),
      ]),
    );

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmClose() && context.mounted) Navigator.of(context).pop();
      },
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.enter, control: true): _send,
          const SingleActivator(LogicalKeyboardKey.enter, meta: true): _send,
        },
        child: page,
      ),
    );
  }
}

/// The quoted original under a reply/forward: collapsed by default, can be
/// expanded or left out.
class _QuotePreview extends StatefulWidget {
  final String html;
  final bool included;
  final bool forward;
  final ValueChanged<bool> onToggle;
  const _QuotePreview({required this.html, required this.included, required this.forward, required this.onToggle});

  @override
  State<_QuotePreview> createState() => _QuotePreviewState();
}

class _QuotePreviewState extends State<_QuotePreview> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(border: Border(top: BorderSide(color: theme.dividerColor))),
      child: Column(children: [
        ListTile(
          dense: true,
          leading: Checkbox(value: widget.included, onChanged: (v) => widget.onToggle(v ?? true)),
          title: Text(widget.forward ? s.t('forward') : s.t('quotedText')),
          trailing: IconButton(
            icon: Icon(_open ? Icons.expand_more : Icons.expand_less),
            onPressed: () => setState(() => _open = !_open),
          ),
          onTap: () => setState(() => _open = !_open),
        ),
        if (_open)
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Opacity(opacity: widget.included ? 1 : .4, child: HtmlQuote(html: widget.html)),
            ),
          ),
      ]),
    );
  }
}

class HtmlQuote extends StatelessWidget {
  final String html;
  const HtmlQuote({super.key, required this.html});

  @override
  Widget build(BuildContext context) =>
      HtmlWidget(html, textStyle: Theme.of(context).textTheme.bodySmall, onTapUrl: openExternal);
}
