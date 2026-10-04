import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart' hide DefaultStyles;
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../services/rich_text.dart';
import '../state/drafts.dart';
import '../state/session.dart';
import '../ui/dialogs.dart';
import '../ui/psg.dart';
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

  /// The window closed: sent, scheduled, or (null) closed without sending.
  final void Function(ComposeResult? result) onDone;

  const ComposeScreen(
      {super.key,
      required this.onDone,
      this.mode,
      this.original,
      this.draft,
      this.prefill,
      this.to = const [],
      this.restored = false});

  @override
  State<ComposeScreen> createState() => ComposeScreenState();
}

class ComposeScreenState extends State<ComposeScreen> {
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
        if (mounted) widget.onDone(ComposeUndoable(id, seconds, snapshot, mail.subject));
      } else {
        await session.api.send(mail);
        await _afterLeaving();
        if (mounted) widget.onDone(const ComposeSent());
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
      if (mounted) widget.onDone(ComposeScheduled(at));
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

  /// Web: the "Insert template" dropdown above the button.
  Future<void> _insertTemplate(BuildContext anchor) async {
    final s = S.of(context);
    final api = context.read<Session>().api;
    List<MailTemplate> list;
    try {
      list = await api.templates();
    } catch (e) {
      _toast(s.error(e));
      return;
    }
    if (!mounted || !anchor.mounted) return;
    final tpl = await _menuAbove<MailTemplate>(anchor, [
      if (list.isEmpty)
        PopupMenuItem<MailTemplate>(enabled: false, child: Text(s.t('noTemplates')))
      else
        for (final t in list) psgMenuItem(context, t, t.name),
    ]);
    if (tpl == null) return;
    // Web insertTemplate(): template first, existing text after it.
    setState(() {
      if (tpl.subject.isNotEmpty && _subject.text.trim().isEmpty) _subject.text = tpl.subject;
      MailHtml.prependHtml(_editor, tpl.content);
    });
  }

  /// A dropdown that opens upwards from a bottom-bar button (web popovers
  /// with placement="top-start").
  Future<T?> _menuAbove<T>(BuildContext anchor, List<PopupMenuEntry<T>> items) {
    final box = anchor.findRenderObject() as RenderBox;
    final overlay = Overlay.of(anchor).context.findRenderObject() as RenderBox;
    final topLeft = box.localToGlobal(Offset.zero, ancestor: overlay);
    return showMenu<T>(
      context: context,
      position: RelativeRect.fromLTRB(topLeft.dx, topLeft.dy - 8, overlay.size.width - topLeft.dx, overlay.size.height - topLeft.dy + 8),
      popUpAnimationStyle: AnimationStyle.noAnimation,
      items: items,
    );
  }

  Future<void> _aiMenu(BuildContext anchor) async {
    final s = S.of(context);
    final op = await _menuAbove<String>(anchor, [
      for (final op in _aiOperations.entries) psgMenuItem(context, op.key, s.t(op.value), icon: 'psg:sparkles'),
    ]);
    if (op != null) _ai(op);
  }

  Future<void> _clear() async {
    final s = S.of(context);
    final ok = await psgConfirm(context, s.t('clearContentConfirm'), danger: false);
    if (!ok) return;
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
    final replace = await psgBox<bool>(
      context,
      title: s.t('aiTransformPreview'),
      maxWidth: 520,
      body: Container(
        constraints: const BoxConstraints(maxHeight: 320),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: context.psg.surfaceMuted,
          border: Border.all(color: context.psg.border),
          borderRadius: BorderRadius.circular(PsgRadius.xs),
        ),
        child: SingleChildScrollView(child: SelectableText(result, style: TextStyle(fontSize: 13, height: 1.65, color: context.psg.text))),
      ),
      actions: [
        (s.t('cancel'), false, PsgButtonKind.outline),
        (s.t('aiReplaceSelection'), true, PsgButtonKind.primary),
      ],
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
    final choice = await psgBox<String>(
      context,
      title: s.t('warning'),
      body: Text(s.t('saveDraftConfirm')),
      actions: [
        (s.keepEditing, 'keep', PsgButtonKind.outline),
        (s.discard, 'discard', PsgButtonKind.outline),
        (s.t('confirm'), 'save', PsgButtonKind.primary),
      ],
    );
    if (choice == 'save') await drafts?.save(d);
    return choice == 'save' || choice == 'discard';
  }

  _WindowState _window = _WindowState.normal;

  Future<void> _close() async {
    if (await _confirmClose() && mounted) widget.onDone(null);
  }

  /// Reopens a minimized window (the shell's compose button when one is
  /// already open).
  void restore() {
    if (_window == _WindowState.minimized) setState(() => _window = _WindowState.normal);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final session = context.watch<Session>();
    final size = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final phone = size.width < 768;
    final badge = switch (_sendType) { 'reply' => s.t('reply'), 'forward' => s.t('forward'), _ => s.t('compose') };
    final minimized = _window == _WindowState.minimized;

    // ── Header: badge · subject · minimize / maximize / close ──
    Widget action(String icon, String tip, VoidCallback onTap, {bool close = false}) => _WindowButton(
          icon: icon,
          tooltip: tip,
          onTap: onTap,
          close: close,
          size: minimized ? 32 : 36,
        );
    final header = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: minimized ? () => setState(() => _window = _WindowState.normal) : null,
      child: Container(
        height: minimized ? (phone ? 56 : 52) : 68,
        padding: EdgeInsets.fromLTRB(minimized ? (phone ? 16 : 18) : (phone ? 18 : 28), 0, minimized && phone ? 8 : 16, 0),
        child: Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(color: t.primaryMuted, borderRadius: BorderRadius.circular(PsgRadius.xs)),
            child: Text(badge, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: t.primary)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: ListenableBuilder(
              listenable: _subject,
              builder: (_, _) => Text(
                _subject.text.trim().isEmpty ? s.t('noSubject') : _subject.text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: minimized ? 14 : 20, fontWeight: FontWeight.w700, letterSpacing: -.2, color: t.text),
              ),
            ),
          ),
          const SizedBox(width: 12),
          action('psg:minimize', minimized ? s.t('expand') : s.t('minimize'),
              () => setState(() => _window = minimized ? _WindowState.normal : _WindowState.minimized)),
          if (!phone) ...[
            const SizedBox(width: 6),
            action(_window == _WindowState.maximized ? 'psg:restore' : 'psg:maximize',
                _window == _WindowState.maximized ? s.t('restore') : s.t('maximize'),
                () => setState(() => _window = _window == _WindowState.maximized ? _WindowState.normal : _WindowState.maximized)),
          ],
          const SizedBox(width: 6),
          action('psg:close', s.t('close'), _close, close: true),
        ]),
      ),
    );

    if (minimized) {
      // Docked pill: bottom-right on desktop, above the tab bar on phones.
      final pill = Material(
        color: t.surface,
        elevation: 0,
        borderRadius: BorderRadius.circular(phone ? 18 : PsgRadius.lg),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(phone ? 18 : PsgRadius.lg),
            boxShadow: phone ? PsgShadow.md(context) : PsgShadow.lg(context),
          ),
          child: header,
        ),
      );
      return Stack(children: [
        Positioned(
          right: phone ? 12 : 28,
          left: phone ? 12 : null,
          bottom: phone ? 86 + pad.bottom : 28,
          width: phone ? null : 320,
          child: pill,
        ),
      ]);
    }

    // ── Fields: one grey well (sender, to, cc, bcc, subject) ──
    final recent = session.recentRecipients;
    Widget row(Widget child, {bool first = false, bool last = false, double minHeight = 46}) => Container(
          constraints: BoxConstraints(minHeight: minHeight),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: t.surfaceMuted,
            border: last ? null : Border(bottom: BorderSide(color: t.border)),
            borderRadius: BorderRadius.vertical(
              top: first ? const Radius.circular(18) : Radius.zero,
              bottom: last ? const Radius.circular(18) : Radius.zero,
            ),
          ),
          child: child,
        );
    Widget label(String text) => SizedBox(
          width: 60,
          child: Text(text, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: t.textMuted)),
        );
    Widget toggle(String text, VoidCallback onTap) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(PsgRadius.sm),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            child: Text(text, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, letterSpacing: .35, color: t.textSecondary)),
          ),
        );

    final fromChip = _FromChip(
      account: _from,
      selectable: session.accounts.length > 1,
      onSelect: (a) => setState(() {
        _from = a;
        _autoPicked = false;
      }),
    );

    final fields = Padding(
      padding: EdgeInsets.symmetric(horizontal: phone ? 12 : 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        row(
          first: true,
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 10, runSpacing: 4, children: [
              label(s.t('sender')),
              fromChip,
              if (_autoPicked) Text(s.t('senderAutoPicked'), style: TextStyle(fontSize: 12, color: t.textSecondary)),
            ]),
          ),
        ),
        row(RecipientField(
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
            if (!_showCc) toggle(s.t('cc'), () => setState(() => _showCc = true)),
            if (!_showBcc) ...[const SizedBox(width: 4), toggle(s.t('bcc'), () => setState(() => _showBcc = true))],
            const SizedBox(width: 4),
            PsgIconButton('psg:user-plus', size: 26, iconSize: 14, tooltip: s.t('recentContacts'), onPressed: _contacts),
          ]),
        )),
        if (_showCc)
          row(RecipientField(key: _ccKey, label: s.t('cc'), values: _cc, suggestions: recent, onChanged: (v) => setState(() => _cc = v))),
        if (_showBcc)
          row(RecipientField(key: _bccKey, label: s.t('bcc'), values: _bcc, suggestions: recent, onChanged: (v) => setState(() => _bcc = v))),
        row(
          last: true,
          minHeight: 50,
          Row(children: [
            label(s.t('subject')),
            Expanded(
              child: TextField(
                controller: _subject,
                style: TextStyle(fontSize: 14, color: t.text),
                decoration: InputDecoration(
                  hintText: s.t('subject'),
                  hintStyle: TextStyle(color: t.textMuted, fontSize: 14),
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  isDense: true,
                ),
                textInputAction: TextInputAction.next,
                onChanged: (_) => _touched = true,
                onSubmitted: (_) => _editorFocus.requestFocus(),
              ),
            ),
          ]),
        ),
      ]),
    );

    // ── Editor: formatting bar in a grey strip, then the text ──
    final toolbar = Container(
      margin: EdgeInsets.fromLTRB(phone ? 14 : 24, 14, phone ? 14 : 24, 0),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.md)),
      child: QuillSimpleToolbar(
        controller: _editor,
        config: QuillSimpleToolbarConfig(
          multiRowsDisplay: false,
          color: Colors.transparent,
          showFontFamily: false,
          showFontSize: true,
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
          showQuote: false,
          showHeaderStyle: false,
          showDividers: true,
          buttonOptions: QuillSimpleToolbarButtonOptions(
            base: QuillToolbarBaseButtonOptions(
              iconSize: 15,
              iconTheme: QuillIconTheme(
                iconButtonSelectedData: IconButtonData(
                  style: IconButton.styleFrom(
                    backgroundColor: t.surfaceActive,
                    foregroundColor: t.text,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.xs)),
                  ),
                ),
                iconButtonUnselectedData: IconButtonData(
                  style: IconButton.styleFrom(
                    foregroundColor: t.text,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.xs)),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    final editor = Padding(
      padding: EdgeInsets.fromLTRB(phone ? 18 : 30, 10, phone ? 18 : 30, 0),
      child: QuillEditor(
        controller: _editor,
        focusNode: _editorFocus,
        scrollController: _editorScroll,
        config: QuillEditorConfig(
          placeholder: s.t('bodyPlaceholder'),
          padding: const EdgeInsets.only(bottom: 24),
          expands: false,
          customStyles: DefaultStyles(
            paragraph: DefaultTextBlockStyle(
              TextStyle(fontSize: 15, height: 1.6, color: t.text, fontFamily: 'DM Sans'),
              HorizontalSpacing.zero,
              VerticalSpacing.zero,
              VerticalSpacing.zero,
              null,
            ),
            placeHolder: DefaultTextBlockStyle(
              TextStyle(fontSize: 15, height: 1.6, color: t.textMuted, fontFamily: 'DM Sans'),
              HorizontalSpacing.zero,
              VerticalSpacing.zero,
              VerticalSpacing.zero,
              null,
            ),
          ),
        ),
      ),
    );

    // ── Bottom bar: AI · attach · clear · template | schedule · send ──
    Widget tb(String icon, {String? text, required VoidCallback? onTap, Color? color}) =>
        _ToolButton(icon: icon, label: text, onTap: onTap, color: color);
    final attachments = _files.isEmpty
        ? null
        : SizedBox(
            height: 26,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final f in _files)
                Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  constraints: const BoxConstraints(maxWidth: 200),
                  decoration: BoxDecoration(
                    color: t.surface,
                    border: Border.all(color: t.border),
                    borderRadius: BorderRadius.circular(PsgRadius.sm),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    PsgIcon(isImageName(f.filename) ? 'psg:gallery' : 'psg:paperclip', size: 14, color: t.textSecondary),
                    const SizedBox(width: 5),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 100),
                      child: Text(f.filename,
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: t.text)),
                    ),
                    const SizedBox(width: 5),
                    Text(formatSize(f.size), style: TextStyle(fontSize: 10, color: t.textSecondary)),
                    const SizedBox(width: 5),
                    GestureDetector(
                      onTap: () => setState(() => _files.remove(f)),
                      child: PsgIcon('psg:close-circle', size: 16, color: t.textSecondary),
                    ),
                  ]),
                ),
            ]),
          );
    final sendButton = PsgButton(s.t('send'), icon: 'psg:send', height: 44, busy: _busy, onPressed: _busy ? null : _send);
    final laterButton = phone
        ? _ToolButton(icon: 'psg:clock', onTap: _busy ? null : _sendLater, outlined: true)
        : PsgButton(s.t('sendLater'), icon: 'psg:clock', kind: PsgButtonKind.outline, height: 44, onPressed: _busy ? null : _sendLater);
    final bottomBar = Padding(
      padding: EdgeInsets.fromLTRB(phone ? 12 : 20, 14, phone ? 12 : 20, (phone ? 12 + pad.bottom : 20)),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (attachments != null) ...[attachments, const SizedBox(height: 10)],
        Row(children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                Builder(builder: (b) => tb('psg:sparkles', text: phone ? null : s.t('aiTransform'), onTap: () => _aiMenu(b))),
                const SizedBox(width: 4),
                tb('psg:paperclip', text: phone ? null : s.t('attachments'), onTap: _busy ? null : _pickFiles),
                const SizedBox(width: 4),
                tb('psg:eraser', onTap: _clear),
                const SizedBox(width: 4),
                Builder(builder: (b) => tb('psg:template', text: phone ? null : s.t('insertTemplate'), onTap: () => _insertTemplate(b))),
              ]),
            ),
          ),
          const SizedBox(width: 12),
          laterButton,
          const SizedBox(width: 12),
          sendButton,
        ]),
      ]),
    );

    final card = Material(
      color: t.surface,
      borderRadius: phone ? BorderRadius.zero : BorderRadius.circular(28),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (phone) SizedBox(height: pad.top),
        if (phone)
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(color: t.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
        header,
        fields,
        toolbar,
        Expanded(child: editor),
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
        bottomBar,
      ]),
    );

    final Widget window;
    if (phone) {
      window = card;
    } else {
      final maxed = _window == _WindowState.maximized;
      final w = maxed ? (size.width - 56).clamp(0, 1300).toDouble() : (size.width - 48).clamp(0, 820).toDouble();
      final h = maxed ? (size.height - 56).clamp(0, 860).toDouble() : (size.height - 48).clamp(0, 740).toDouble();
      window = Center(
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          width: w,
          height: h,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), boxShadow: PsgShadow.lg(context)),
          child: card,
        ),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.enter, control: true): _send,
          const SingleActivator(LogicalKeyboardKey.enter, meta: true): _send,
          const SingleActivator(LogicalKeyboardKey.escape): _close,
        },
        child: Stack(children: [
          // Web .send: a soft dim behind the centred card (none on phones,
          // where the composer is full-screen).
          if (!phone)
            Positioned.fill(
              child: GestureDetector(
                onTap: () {},
                child: ColoredBox(color: context.isDark ? const Color(0x99000000) : const Color(0x521C1C1E)),
              ),
            ),
          Positioned.fill(child: window),
        ]),
      ),
    );
  }
}

enum _WindowState { normal, maximized, minimized }

/// Header buttons (web .wh-action-btn): 36px grey squares; Close turns red
/// on hover.
class _WindowButton extends StatefulWidget {
  final String icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool close;
  final double size;
  const _WindowButton({required this.icon, required this.tooltip, required this.onTap, this.close = false, this.size = 36});

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

class _WindowButtonState extends State<_WindowButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final bg = _hover ? (widget.close ? t.danger : t.surfaceActive) : t.surfaceMuted;
    final fg = _hover ? (widget.close ? Colors.white : t.text) : t.textSecondary;
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
            alignment: Alignment.center,
            child: PsgIcon(widget.icon, size: 15, color: fg),
          ),
        ),
      ),
    );
  }
}

/// Bottom-bar button (web .tb-btn): 44px grey, optional label.
class _ToolButton extends StatelessWidget {
  final String icon;
  final String? label;
  final VoidCallback? onTap;
  final Color? color;
  final bool outlined;
  const _ToolButton({required this.icon, this.label, this.onTap, this.color, this.outlined = false});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: outlined ? BorderSide(color: t.border) : BorderSide.none,
    );
    return Opacity(
      opacity: onTap == null ? .5 : 1,
      child: Material(
        color: outlined ? t.surface : t.surfaceMuted,
        shape: shape,
        child: InkWell(
          customBorder: shape,
          hoverColor: t.surfaceActive,
          onTap: onTap,
          child: Container(
            height: 44,
            constraints: const BoxConstraints(minWidth: 44),
            padding: EdgeInsets.symmetric(horizontal: label == null ? 0 : 16),
            alignment: Alignment.center,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              PsgIcon(icon, size: 16, color: color ?? t.text),
              if (label != null) ...[
                const SizedBox(width: 5),
                Text(label!, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: color ?? t.text)),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

/// Web .from-chip: white chip with the mailbox colour dot, name and
/// address; opens the sender menu when there is more than one address.
class _FromChip extends StatelessWidget {
  final Account account;
  final bool selectable;
  final ValueChanged<Account> onSelect;
  const _FromChip({required this.account, required this.selectable, required this.onSelect});

  Future<void> _open(BuildContext context) async {
    final s = S.of(context);
    final t = context.psg;
    final session = context.read<Session>();
    final box = context.findRenderObject() as RenderBox;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final pos = box.localToGlobal(Offset(0, box.size.height + 6), ancestor: overlay);
    final a = await showMenu<Account>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx, pos.dy, overlay.size.width - pos.dx, 0),
      constraints: const BoxConstraints(minWidth: 280),
      items: [
        psgMenuHeading(context, s.t('chooseSender')),
        for (final acc in session.accounts)
          PopupMenuItem<Account>(
            value: acc,
            height: 52,
            child: Row(children: [
              PsgAvatar(name: acc.name.isNotEmpty ? acc.name : acc.email, email: acc.email, size: 34, radius: PsgRadius.sm),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(acc.name.isNotEmpty ? acc.name : acc.email.split('@').first,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: t.text)),
                  Text(acc.email, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: t.textSecondary)),
                ]),
              ),
              if (acc.accountId == account.accountId) PsgIcon('psg:check', size: 18, color: t.primary),
            ]),
          ),
      ],
    );
    if (a != null) onSelect(a);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final name = account.name.isNotEmpty ? account.name : account.email.split('@').first;
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(PsgRadius.sm),
      child: InkWell(
        borderRadius: BorderRadius.circular(PsgRadius.sm),
        onTap: selectable ? () => _open(context) : null,
        child: Container(
          height: 32,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: mailboxColor(account.email), shape: BoxShape.circle)),
            const SizedBox(width: 8),
            Flexible(
              child: Text(name,
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: t.text)),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text('<${account.email}>',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: t.textSecondary)),
            ),
            if (selectable) ...[const SizedBox(width: 6), PsgIcon('psg:chevron-down', size: 12, color: t.textSecondary)],
          ]),
        ),
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
    final t = context.psg;
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 4, 20, 0),
      decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.md)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(PsgRadius.md),
          onTap: () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 2, 10, 2),
            child: Row(children: [
              PsgCheckbox(value: widget.included, onChanged: widget.onToggle),
              const SizedBox(width: 4),
              Expanded(
                child: Text(widget.forward ? s.t('forward') : s.t('quotedText'),
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: t.textSecondary)),
              ),
              PsgIcon(_open ? 'psg:chevron-down' : 'psg:chevron-right', size: 14, color: t.textSecondary),
            ]),
          ),
        ),
        if (_open)
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 200),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
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
  Widget build(BuildContext context) => HtmlWidget(html,
      textStyle: TextStyle(fontSize: 13, height: 1.6, color: context.psg.textSecondary), onTapUrl: openExternal);
}
