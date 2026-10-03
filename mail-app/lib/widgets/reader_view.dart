import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../services/print_service.dart';
import '../state/session.dart';
import '../ui/psg.dart';
import '../util/day.dart';
import 'mail_actions.dart';
import 'mail_list_view.dart';

enum ReplyMode { reply, replyAll, forward }

/// Opens a link from a mail outside the app (system browser / mail client).
Future<bool> openExternal(String url) async {
  final uri = Uri.tryParse(url.startsWith('//') ? 'https:$url' : url);
  if (uri == null || !(uri.isScheme('http') || uri.isScheme('https') || uri.isScheme('mailto') || uri.isScheme('tel'))) {
    return true; // swallow relative / javascript: links
  }
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

String formatSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
}

const _imageExt = {'png', 'jpg', 'jpeg', 'bmp', 'gif', 'jfif', 'webp'};
bool isImageName(String name) => _imageExt.contains(name.split('.').last.toLowerCase());

/// Stored mail references its saved images as `{{domain}}<key>`.
String resolveStoredImages(Session session, String html) =>
    html.replaceAllMapped(RegExp(r'\{\{domain\}\}([^"\x27)\s]+)'), (m) => session.ossUrl(m[1]!));

/// Where the reader sits in its list, for previous / next.
class ReaderPosition {
  final int index; // 1-based
  final int total;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;
  const ReaderPosition(this.index, this.total, {this.onPrevious, this.onNext});
}

/// One message with everything the web reader (views/content) offers:
/// star, labels, unread, translate, AI summary / reply suggestion, print,
/// .eml download, spam banner, delivery alerts, attachments and quick reply.
/// [onRemoved] fires after the message leaves the current folder;
/// [onChanged] after read/star/label changes.
class ReaderView extends StatefulWidget {
  final Email email;
  final Folder folder;
  final void Function(ReplyMode mode, Email email) onReply;
  final void Function(Email email) onRemoved;
  final VoidCallback onChanged;
  final VoidCallback? onClose;
  final ReaderPosition? position;

  const ReaderView({
    super.key,
    required this.email,
    required this.folder,
    required this.onReply,
    required this.onRemoved,
    required this.onChanged,
    this.onClose,
    this.position,
  });

  @override
  State<ReaderView> createState() => _ReaderViewState();
}

enum _Panel { none, translate, summary, reply }

class _ReaderViewState extends State<ReaderView> {
  Email get e => widget.email;

  _Panel _panel = _Panel.none;
  bool _panelLoading = false;
  String _panelText = '';
  String _original = '';
  String _targetLang = 'zh';
  String? _spamReason; // null = no verdict
  bool _spamBusy = false;

  @override
  void initState() {
    super.initState();
    _opened();
  }

  @override
  void didUpdateWidget(ReaderView old) {
    super.didUpdateWidget(old);
    if (old.email.emailId != e.emailId) {
      setState(() {
        _panel = _Panel.none;
        _panelText = '';
        _spamReason = null;
      });
      _opened();
    }
  }

  void _opened() {
    if (e.isUnread) {
      e.unread = 1;
      widget.onChanged();
      context.read<Session>().api.markRead([e.emailId]).catchError((_) {});
    }
    if (e.isSpam || widget.folder.kind == FolderKind.spam) {
      final id = e.emailId;
      context.read<Session>().api.spamVerdictReason(id).then((r) {
        if (mounted && e.emailId == id) setState(() => _spamReason = r);
      }).catchError((_) {});
    }
  }

  MailActions get _actions => MailActions(context, widget.folder);

  Future<void> _run(MailAction a) async {
    final gone = await _actions.run(a, [e]);
    if (!mounted) return;
    if (gone.isNotEmpty) {
      widget.onRemoved(e);
    } else {
      setState(() {});
      widget.onChanged();
      if (a == MailAction.unread) widget.onClose?.call();
    }
  }

  Future<void> _toggleStar() async {
    final api = context.read<Session>().api;
    final was = e.isStar;
    setState(() => e.isStar = !was);
    widget.onChanged();
    try {
      await (was ? api.unstar(e.emailId) : api.star(e.emailId));
      if (was && widget.folder.kind == FolderKind.starred) widget.onRemoved(e);
    } catch (err) {
      if (!mounted) return;
      setState(() => e.isStar = was);
      widget.onChanged();
      _actions.toast(S.of(context).error(err));
    }
  }

  // Only used to pick a sensible default direction on first click (web
  // detectLang); the server detects the source language itself.
  static String _detectLang(String text) {
    final cjk = RegExp(r'[一-鿿぀-ヿ]').allMatches(text).length;
    return cjk / (text.isEmpty ? 1 : text.length) > 0.1 ? 'zh' : 'en';
  }

  Future<void> _translate({bool switchLang = false}) async {
    if (_panel == _Panel.translate && !switchLang) {
      setState(() => _panel = _Panel.none);
      return;
    }
    final s = S.of(context);
    final api = context.read<Session>().api;
    final source = e.text.isNotEmpty ? e.text : e.content;
    _targetLang = switchLang ? (_targetLang == 'zh' ? 'en' : 'zh') : (_detectLang(source) == 'zh' ? 'en' : 'zh');
    setState(() {
      _panel = _Panel.translate;
      _panelLoading = true;
      _panelText = '';
      _original = e.text.isNotEmpty ? e.text : e.preview;
    });
    try {
      final r = await api.translate(
        html: e.content.isNotEmpty ? e.content : null,
        text: e.content.isEmpty ? e.text : null,
        targetLang: _targetLang,
      );
      if (!mounted) return;
      setState(() {
        _panelText = r.translated;
        if (r.original.isNotEmpty) _original = r.original;
      });
    } catch (err) {
      if (!mounted) return;
      _actions.toast(err is ApiException ? err.message : s.t('translateFailed'));
      setState(() => _panel = _Panel.none);
    } finally {
      if (mounted) setState(() => _panelLoading = false);
    }
  }

  Future<void> _ai(_Panel which) async {
    final s = S.of(context);
    final api = context.read<Session>().api;
    setState(() {
      _panel = which;
      _panelLoading = true;
      _panelText = '';
    });
    try {
      final text = which == _Panel.summary ? await api.aiSummary(e.emailId) : await api.aiReplySuggestion(e.emailId);
      if (mounted) setState(() => _panelText = text);
    } catch (err) {
      if (!mounted) return;
      _actions.toast(err is ApiException ? err.message : s.t('aiAssistantFail'));
      setState(() => _panel = _Panel.none);
    } finally {
      if (mounted) setState(() => _panelLoading = false);
    }
  }

  Future<void> _notSpam() async {
    final s = S.of(context);
    setState(() => _spamBusy = true);
    try {
      await context.read<Session>().api.notSpam([e.emailId]);
      e.isSpam = false;
      _actions.toast(s.t('notSpamDone'));
      if (widget.folder.kind == FolderKind.spam) widget.onRemoved(e);
    } catch (_) {
      _actions.toast(s.t('operationFailMsg'));
    } finally {
      if (mounted) setState(() => _spamBusy = false);
    }
  }

  Future<void> _print() async {
    final session = context.read<Session>();
    final noSubject = S.of(context).t('noSubject');
    try {
      await PrintService.printEmail(e, resolveStoredImages(session, e.content), noSubject: noSubject);
    } catch (err) {
      if (mounted) _actions.toast(S.of(context).error(err));
    }
  }

  /// Web label popover: every label with its dot; a tick on applied ones.
  Future<void> _labelMenu(BuildContext anchor) async {
    final s = S.of(context);
    final t = context.psg;
    final session = context.read<Session>();
    final box = anchor.findRenderObject() as RenderBox;
    final overlay = Overlay.of(anchor).context.findRenderObject() as RenderBox;
    final pos = box.localToGlobal(Offset(box.size.width, box.size.height + 6), ancestor: overlay);
    final l = await showMenu<MailLabel>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx - 220, pos.dy, overlay.size.width - pos.dx, 0),
      constraints: const BoxConstraints(minWidth: 220, maxWidth: 220),
      items: session.labels.isEmpty
          ? [PopupMenuItem<MailLabel>(enabled: false, child: Text(s.t('labelEmpty'), style: TextStyle(fontSize: 12.5, color: t.textSecondary)))]
          : [
              for (final l in session.labels)
                PopupMenuItem<MailLabel>(
                  value: l,
                  height: 34,
                  child: Row(children: [
                    Container(
                        width: 8, height: 8, decoration: BoxDecoration(color: labelColor(l.color) ?? t.textMuted, shape: BoxShape.circle)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(l.name, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: t.text))),
                    if (e.labels.any((x) => x.labelId == l.labelId)) PsgIcon('psg:check-circle', size: 16, color: t.primary),
                  ]),
                ),
            ],
    );
    if (l == null || !mounted) return;
    final apply = !e.labels.any((x) => x.labelId == l.labelId);
    try {
      await (apply ? session.api.applyLabel(l.labelId, [e.emailId]) : session.api.removeLabel(l.labelId, [e.emailId]));
      setState(() => e.labels = [...e.labels.where((x) => x.labelId != l.labelId), if (apply) l]);
      widget.onChanged();
      if (!apply && widget.folder.kind == FolderKind.label && widget.folder.labelId == l.labelId) widget.onRemoved(e);
    } catch (err) {
      if (mounted) _actions.toast(s.error(err));
    }
  }

  Future<void> _aiMenu(BuildContext anchor, bool showReply) async {
    final s = S.of(context);
    final box = anchor.findRenderObject() as RenderBox;
    final overlay = Overlay.of(anchor).context.findRenderObject() as RenderBox;
    final pos = box.localToGlobal(Offset(box.size.width, box.size.height + 6), ancestor: overlay);
    final p = await showMenu<_Panel>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx - 190, pos.dy, overlay.size.width - pos.dx, 0),
      constraints: const BoxConstraints(minWidth: 190, maxWidth: 220),
      items: [
        psgMenuItem(context, _Panel.summary, s.t('aiMailSummary'), icon: 'psg:mail'),
        if (showReply) psgMenuItem(context, _Panel.reply, s.t('aiReplySuggestion'), icon: 'psg:reply'),
      ],
    );
    if (p != null) _ai(p);
  }

  Future<void> _moreMenu(BuildContext anchor, {required bool phone, required bool showReply, required bool canDelete}) async {
    final s = S.of(context);
    final kind = widget.folder.kind;
    final box = anchor.findRenderObject() as RenderBox;
    final overlay = Overlay.of(anchor).context.findRenderObject() as RenderBox;
    final pos = box.localToGlobal(Offset(box.size.width, box.size.height + 6), ancestor: overlay);
    final translateLabel = _panel == _Panel.translate ? s.t('showOriginal') : s.t('translateEmail');
    final v = await showMenu<Object>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx - 220, pos.dy, overlay.size.width - pos.dx, 0),
      items: [
        // Phones fold the whole toolbar in here (web .mobile-reader-menu).
        if (phone) ...[
          if (kind != FolderKind.trash && kind != FolderKind.spam)
            psgMenuItem<Object>(context, 'star', e.isStar ? s.t('unstar') : s.t('star'),
                icon: e.isStar ? 'fluent-color:star-16' : 'psg:star'),
          if (!e.isSent) psgMenuItem<Object>(context, MailAction.unread, s.t('markAsUnread'), icon: 'psg:mail'),
          psgMenuItem<Object>(context, 'labels', s.t('labelApply'), icon: 'psg:tag'),
          psgMenuItem<Object>(context, 'translate', translateLabel, icon: 'psg:globe'),
          psgMenuItem<Object>(context, _Panel.summary, s.t('aiMailSummary'), icon: 'psg:sparkles'),
          if (showReply) psgMenuItem<Object>(context, _Panel.reply, s.t('aiReplySuggestion'), icon: 'psg:reply'),
          const PopupMenuDivider(height: 9),
        ],
        psgMenuItem<Object>(context, 'print', s.t('printEmail'), icon: 'psg:printer'),
        psgMenuItem<Object>(context, MailAction.exportEml, s.t('downloadEml'), icon: 'psg:download'),
        if (kind == FolderKind.archive)
          psgMenuItem<Object>(context, MailAction.unarchive, s.t('unarchive'), icon: 'solar:inbox-out-linear')
        else if (!const {FolderKind.trash, FolderKind.spam, FolderKind.sent}.contains(kind) && !e.isSent)
          psgMenuItem<Object>(context, MailAction.archive, s.t('archive'), icon: 'psg:archive'),
        if (kind == FolderKind.spam || e.isSpam)
          psgMenuItem<Object>(context, MailAction.notSpam, s.t('notSpam'), icon: 'psg:check-circle')
        else if (!e.isSent && kind != FolderKind.trash)
          psgMenuItem<Object>(context, MailAction.spam, s.t('markAsSpam'), icon: 'psg:warning'),
        if (kind == FolderKind.trash) psgMenuItem<Object>(context, MailAction.restore, s.t('restore'), icon: 'solar:inbox-out-linear'),
        if (phone && canDelete) ...[
          const PopupMenuDivider(height: 9),
          psgMenuItem<Object>(context, MailAction.delete, s.t('delete'), icon: 'psg:trash', danger: true),
        ],
      ],
    );
    if (v == null || !mounted) return;
    switch (v) {
      case 'print':
        _print();
      case 'star':
        _toggleStar();
      case 'labels':
        if (anchor.mounted) _labelMenu(anchor);
      case 'translate':
        _translate();
      case _Panel p:
        _ai(p);
      case MailAction a:
        _run(a);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final session = context.watch<Session>();
    final kind = widget.folder.kind;
    final canSend = session.user?.can('email:send') ?? true;
    final canDelete = session.user?.can('email:delete') ?? true;
    final showReply = canSend && !e.isSent;
    final showStar = kind != FolderKind.trash && kind != FolderKind.spam;
    final pos = widget.position;
    final width = MediaQuery.sizeOf(context).width;
    final phone = width <= 768;
    final contentPad = phone
        ? const EdgeInsets.fromLTRB(14, 18, 14, 32)
        : width <= 1280
            ? const EdgeInsets.fromLTRB(24, 24, 24, 40)
            : const EdgeInsets.fromLTRB(48, 8, 48, 40);

    Widget square(String icon, String tip, VoidCallback? onTap, {bool active = false, Color? color, double iconSize = 19}) =>
        PsgIconButton(icon,
            style: PsgIconButtonStyle.muted,
            size: phone ? 42 : 38,
            iconSize: iconSize,
            tooltip: tip,
            active: active,
            color: color ?? (active ? t.primary : null),
            onPressed: onTap);

    final header = Container(
      constraints: BoxConstraints(minHeight: phone ? 64 : 72),
      padding: phone ? const EdgeInsets.fromLTRB(10, 8, 10, 8) : const EdgeInsets.symmetric(horizontal: 24),
      child: Row(children: [
        if (widget.onClose != null) square('psg:chevron-left', s.t('back'), widget.onClose, iconSize: 20),
        if (!phone) ...[
          if (showStar) ...[
            const SizedBox(width: 6),
            square(e.isStar ? 'fluent-color:star-16' : 'psg:star', s.t('star'), _toggleStar, iconSize: e.isStar ? 20 : 18),
          ],
          if (canDelete) ...[const SizedBox(width: 6), square('psg:trash', s.t('delete'), () => _run(MailAction.delete))],
          if (!e.isSent) ...[
            const SizedBox(width: 6),
            square('psg:mail', s.t('markAsUnread'), () => _run(MailAction.unread)),
          ],
        ],
        const Spacer(),
        if (!phone) ...[
          Builder(builder: (b) => square('psg:tag', s.t('labelApply'), () => _labelMenu(b))),
          const SizedBox(width: 6),
          _panelLoading && _panel == _Panel.translate
              ? SizedBox(
                  width: 38,
                  height: 38,
                  child: Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: t.textMuted))))
              : square('psg:globe', _panel == _Panel.translate ? s.t('showOriginal') : s.t('translateEmail'), () => _translate(),
                  active: _panel == _Panel.translate),
          const SizedBox(width: 6),
          Builder(
              builder: (b) => square('psg:sparkles', s.t('aiTransform'), () => _aiMenu(b, showReply),
                  active: const {_Panel.summary, _Panel.reply}.contains(_panel), iconSize: 18)),
          const SizedBox(width: 6),
        ],
        Builder(
            builder: (b) => square('psg:more', s.t('more'),
                () => _moreMenu(b, phone: phone, showReply: showReply, canDelete: canDelete), iconSize: phone ? 20 : 19)),
        if (!phone && pos != null && pos.total > 0)
          Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Tooltip(
              message: s.t('emailPositionHint'),
              child: Text('${pos.index} / ${pos.total}',
                  style: TextStyle(fontSize: 13, color: t.textMuted, fontFeatures: const [FontFeature.tabularFigures()])),
            ),
          ),
      ]),
    );

    final body = SelectionArea(
      child: ListView(
        padding: contentPad,
        children: [
          Align(
            alignment: Alignment.topLeft,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 820),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(e.subject.isEmpty ? s.t('noSubject') : e.subject,
                    style: TextStyle(
                        fontSize: phone ? 22 : 28,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                        letterSpacing: phone ? 0 : -.28,
                        color: t.text)),
                const SizedBox(height: 14),
                if (e.labels.isNotEmpty) ...[
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    for (final l in e.labels)
                      Builder(builder: (context) {
                        final c = labelColor(l.color) ?? t.textMuted;
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
                          decoration: BoxDecoration(
                            color: c.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(PsgRadius.xs),
                            border: Border.all(color: c.withValues(alpha: .30)),
                          ),
                          child: Text(l.name, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c)),
                        );
                      }),
                  ]),
                  const SizedBox(height: 12),
                ],
                _Header(email: e, phone: phone),
                SizedBox(height: phone ? 16 : 24),
                if (e.isSent) ..._deliveryAlerts(s, t),
                if (e.isSpam || kind == FolderKind.spam) _SpamBanner(reason: _spamReason, busy: _spamBusy, onNotSpam: _notSpam),
                _Body(email: e),
                if (_panel != _Panel.none) _panelCard(s, t),
                if (e.attachments.any((a) => !a.isInline)) _Attachments(email: e, phone: phone),
              ]),
            ),
          ),
        ],
      ),
    );

    final page = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (phone) SafeArea(bottom: false, child: header) else header,
      Expanded(child: body),
      if (showReply && !phone) _QuickReply(email: e, onReply: (m) => widget.onReply(m, e)),
      if (showReply && phone) _PhoneActions(onReply: (m) => widget.onReply(m, e)),
      if (!showReply && canSend && phone) _PhoneActions(onReply: (m) => widget.onReply(m, e), forwardOnly: true),
    ]);

    return CallbackShortcuts(
      bindings: {
        if (widget.onClose != null) const SingleActivator(LogicalKeyboardKey.escape): widget.onClose!,
        const SingleActivator(LogicalKeyboardKey.keyS): _toggleStar,
        const SingleActivator(LogicalKeyboardKey.numberSign, shift: true): () => _run(MailAction.delete),
        const SingleActivator(LogicalKeyboardKey.keyE): () => _run(MailAction.archive),
        const SingleActivator(LogicalKeyboardKey.keyU): () => widget.onClose?.call(),
        if (showReply) const SingleActivator(LogicalKeyboardKey.keyR): () => widget.onReply(ReplyMode.reply, e),
        if (showReply) const SingleActivator(LogicalKeyboardKey.keyA): () => widget.onReply(ReplyMode.replyAll, e),
        if (canSend) const SingleActivator(LogicalKeyboardKey.keyF): () => widget.onReply(ReplyMode.forward, e),
        if (pos?.onNext != null) const SingleActivator(LogicalKeyboardKey.keyJ): pos!.onNext!,
        if (pos?.onPrevious != null) const SingleActivator(LogicalKeyboardKey.keyK): pos!.onPrevious!,
      },
      child: Focus(
        autofocus: true,
        // A pushed reader (phones) is its own screen on the white surface.
        child: widget.onClose != null && ModalRoute.of(context)?.isFirst == false && phone
            ? Scaffold(backgroundColor: t.surface, body: page)
            : Material(color: t.surface, child: page),
      ),
    );
  }

  /// web el-alert for bounced / complained / delayed sent mail.
  List<Widget> _deliveryAlerts(S s, PsgTokens t) {
    final (text, color, bg) = switch (e.status) {
      3 || 8 => (e.deliveryMessage.isNotEmpty ? e.deliveryMessage : s.t('bounced'), t.danger, t.dangerLight9),
      4 => (s.t('complained'), t.warning, t.warningLight9),
      5 => (s.t('delayed'), t.warning, t.warningLight9),
      _ => ('', t.text, t.surface),
    };
    if (text.isEmpty) return const [];
    return [
      Container(
        margin: const EdgeInsets.only(bottom: 20),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(PsgRadius.sm)),
        child: Row(children: [
          PsgIcon('psg:warning', size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(fontSize: 13, color: color))),
        ]),
      ),
    ];
  }

  /// web .translate-panel / .ai-mail-panel.
  Widget _panelCard(S s, PsgTokens t) {
    final translate = _panel == _Panel.translate;
    final title = switch (_panel) {
      _Panel.translate => s.t('translatedResult'),
      _Panel.summary => s.t('aiSummaryTitle'),
      _ => s.t('aiReplySuggestionTitle'),
    };
    final bodyStyle = TextStyle(fontSize: 14, height: 1.7, color: t.text);
    Widget column(String label, String text) => Container(
          color: t.surfaceMuted,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: t.textMuted)),
            const SizedBox(height: 6),
            Text(text, style: bodyStyle),
          ]),
        );
    return Container(
      margin: const EdgeInsets.fromLTRB(0, 16, 0, 8),
      decoration: BoxDecoration(
        color: t.surfaceMuted,
        border: Border.all(color: t.border),
        borderRadius: BorderRadius.circular(PsgRadius.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.border))),
          child: Row(children: [
            PsgIcon(translate ? 'psg:globe' : 'psg:sparkles', size: 15, color: t.textMuted),
            const SizedBox(width: 6),
            Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: t.textMuted)),
            if (translate) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: t.primary, borderRadius: BorderRadius.circular(PsgRadius.xs)),
                child: Text(_targetLang == 'zh' ? s.t('translateToZh') : s.t('translateToEn'),
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: t.onPrimary)),
              ),
            ],
            const Spacer(),
            if (translate)
              OutlinedButton(
                onPressed: _panelLoading ? null : () => _translate(switchLang: true),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 26),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  side: BorderSide(color: t.border),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.xs)),
                  foregroundColor: t.text,
                  textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
                child: Text(_targetLang == 'zh' ? s.t('translateToEn') : s.t('translateToZh')),
              ),
            if (_panel == _Panel.reply && _panelText.isNotEmpty)
              PsgIconButton('psg:copy', size: 30, iconSize: 15, tooltip: s.t('copy'),
                  onPressed: () => Clipboard.setData(ClipboardData(text: _panelText))),
            const SizedBox(width: 6),
            PsgIconButton('psg:close', size: 30, iconSize: 15, tooltip: s.t('close'), onPressed: () => setState(() => _panel = _Panel.none)),
          ]),
        ),
        if (_panelLoading)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: t.textMuted))),
          )
        else if (translate)
          LayoutBuilder(builder: (context, box) {
            final original = column(s.t('showOriginal'), _original);
            final translated = column(s.t('translatedResult'), _panelText);
            return box.maxWidth > 640
                ? Container(
                    color: t.border,
                    child: IntrinsicHeight(
                      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Expanded(child: original),
                        const SizedBox(width: 1),
                        Expanded(child: translated),
                      ]),
                    ),
                  )
                : Container(
                    color: t.border,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [original, const SizedBox(height: 1), translated]),
                  );
          })
        else
          Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 12), child: Text(_panelText, style: bodyStyle)),
      ]),
    );
  }
}

/// web .spam-banner.
class _SpamBanner extends StatelessWidget {
  final String? reason;
  final bool busy;
  final VoidCallback onNotSpam;
  const _SpamBanner({required this.reason, required this.busy, required this.onNotSpam});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      padding: const EdgeInsets.fromLTRB(16, 12, 14, 12),
      decoration: BoxDecoration(
        color: Color.lerp(t.surface, t.warning, .12),
        borderRadius: BorderRadius.circular(PsgRadius.lg),
      ),
      child: Row(children: [
        PsgIcon('psg:spam', size: 18, color: t.warning),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(reason != null ? s.t('aiSpamBannerTitle') : s.t('spamBannerTitle'),
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.text)),
            if (reason != null) ...[
              const SizedBox(height: 2),
              Text(reason!.isNotEmpty ? reason! : s.t('aiSpamBannerFallback'),
                  style: TextStyle(fontSize: 13, height: 1.45, color: t.textSecondary)),
            ],
          ]),
        ),
        const SizedBox(width: 12),
        Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), boxShadow: PsgShadow.xs(context)),
          child: PsgButton(s.t('notSpam'),
              kind: PsgButtonKind.outline, height: 36, radius: 18, busy: busy, onPressed: busy ? null : onNotSpam),
        ),
      ]),
    );
  }
}

/// web .meta-card: tinted avatar, sender, "发给" the recipients (bold),
/// Cc / Bcc, and the date on the right (under the sender on phones).
class _Header extends StatelessWidget {
  final Email email;
  final bool phone;
  const _Header({required this.email, required this.phone});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final to = email.recipients.map((a) => a.address).join(', ');
    final cc = email.cc.map((a) => a.address).join(', ');
    final bcc = parseAddresses(email.bccJson).map((a) => a.address).join(', ');
    final who = email.name.isNotEmpty ? email.name : email.sendEmail;
    final date = Text(formatDetailDate(email.created, en: !s.zh),
        style: TextStyle(fontSize: 12, color: t.textSecondary, fontFeatures: const [FontFeature.tabularFigures()]));

    Widget field(String label, String value, {bool strong = false}) => Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text.rich(
            TextSpan(children: [
              TextSpan(text: '$label  ', style: TextStyle(color: t.textSecondary)),
              TextSpan(text: value, style: TextStyle(color: t.text, fontWeight: strong ? FontWeight.w700 : FontWeight.w400)),
            ]),
            style: const TextStyle(fontSize: 13, height: 1.5),
          ),
        );

    final sender = phone
        ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(who, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
            if (email.name.isNotEmpty) Text(email.sendEmail, style: TextStyle(fontSize: 13, color: t.textSecondary)),
          ])
        : Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
            Flexible(
              child: Text(who,
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.text)),
            ),
            if (email.name.isNotEmpty) ...[
              const SizedBox(width: 8),
              Flexible(
                child: Text(email.sendEmail,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: t.textSecondary)),
              ),
            ],
          ]);

    final avatarSize = phone ? 38.0 : 44.0;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        PsgAvatar(name: who, email: email.sendEmail, size: avatarSize),
        SizedBox(width: phone ? 10 : 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sender,
            if (to.isNotEmpty || email.toEmail.isNotEmpty) field(s.t('sentTo'), to.isNotEmpty ? to : email.toEmail, strong: true),
            if (cc.isNotEmpty) field(s.t('cc'), cc),
            if (bcc.isNotEmpty) field(s.t('bcc'), bcc),
          ]),
        ),
        if (!phone) ...[const SizedBox(width: 12), Padding(padding: const EdgeInsets.only(top: 2), child: date)],
      ]),
      if (phone) Padding(padding: EdgeInsets.only(left: avatarSize + 10, top: 4), child: date),
    ]);
  }
}

class _Body extends StatelessWidget {
  final Email email;
  const _Body({required this.email});

  @override
  Widget build(BuildContext context) {
    final session = context.read<Session>();
    final t = context.psg;
    if (email.content.trim().isEmpty) {
      return Text(email.text,
          style: TextStyle(fontSize: 14, height: 1.8, color: t.textSecondary, fontFamily: 'monospace', fontFamilyFallback: const ['DM Sans']));
    }
    final dark = context.isDark;
    return HtmlWidget(
      resolveStoredImages(session, email.content),
      textStyle: TextStyle(fontSize: 16, height: 1.75, color: t.text),
      onTapUrl: openExternal,
      customStylesBuilder: (el) {
        // Mail HTML often hardcodes a white page / black text; in dark mode
        // let the theme show through (web: psg-dark overrides).
        if (!dark) return null;
        final style = el.attributes['style'] ?? '';
        final out = <String, String>{};
        if (RegExp(r'background(-color)?\s*:\s*(#fff\b|#ffffff|white|rgb\(255,\s*255,\s*255\))', caseSensitive: false).hasMatch(style) ||
            (el.attributes['bgcolor'] ?? '').toLowerCase().contains('fff')) {
          out['background-color'] = 'transparent';
        }
        if (RegExp(r'(^|;)\s*color\s*:\s*(#000\b|#000000|black|#333\b|#333333)', caseSensitive: false).hasMatch(style)) {
          out['color'] = '#F2F2F7';
        }
        return out.isEmpty ? null : out;
      },
    );
  }
}

/// web .att-container: bordered box, one grey row per file with preview /
/// download.
class _Attachments extends StatelessWidget {
  final Email email;
  final bool phone;
  const _Attachments({required this.email, required this.phone});

  Future<void> _save(BuildContext context, Attachment a) async {
    final session = context.read<Session>();
    final s = S.of(context);
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      final bytes = await session.api.download(session.ossUrl(a.key));
      await FilePicker.saveFile(fileName: a.filename, bytes: Uint8List.fromList(bytes),
          mimeType: a.mimeType.isEmpty ? 'application/octet-stream' : a.mimeType);
    } catch (e) {
      messenger?.showSnackBar(SnackBar(content: Text(s.error(e))));
    }
  }

  void _preview(BuildContext context, Attachment a) {
    final url = context.read<Session>().ossUrl(a.key);
    showDialog<void>(
      context: context,
      barrierColor: Colors.black87,
      builder: (c) => Stack(children: [
        Positioned.fill(child: InteractiveViewer(maxScale: 6, child: Center(child: Image.network(url, fit: BoxFit.contain)))),
        Positioned(
          right: 16,
          top: 16,
          child: PsgIconButton('psg:close', style: PsgIconButtonStyle.surface, size: 40, onPressed: () => Navigator.pop(c)),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final files = email.attachments.where((a) => !a.isInline).toList();
    final r = phone ? PsgRadius.sm : PsgRadius.md;
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 560),
        margin: EdgeInsets.only(top: phone ? 28 : 40),
        padding: EdgeInsets.all(phone ? 14 : 16),
        decoration: BoxDecoration(border: Border.all(color: t.border), borderRadius: BorderRadius.circular(r)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(s.t('attachments'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: t.text))),
            Text(s.t('attCount', {'total': files.length}), style: TextStyle(fontSize: 12.5, color: t.textMuted)),
          ]),
          const SizedBox(height: 12),
          for (final a in files)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Material(
                color: t.surfaceMuted,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.sm), side: BorderSide(color: t.border)),
                child: InkWell(
                  borderRadius: BorderRadius.circular(PsgRadius.sm),
                  hoverColor: t.surfaceActive,
                  onTap: isImageName(a.filename) ? () => _preview(context, a) : () => _save(context, a),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Row(children: [
                      PsgIcon(isImageName(a.filename) ? 'psg:gallery' : 'psg:paperclip', size: 20, color: t.textMuted),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(a.filename,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: t.text)),
                      ),
                      const SizedBox(width: 10),
                      Text(formatSize(a.size), style: TextStyle(fontSize: 12, color: t.textMuted)),
                      const SizedBox(width: 6),
                      if (isImageName(a.filename))
                        PsgIconButton('psg:eye', size: 30, iconSize: 18, tooltip: s.t('preview'), onPressed: () => _preview(context, a)),
                      PsgIconButton('psg:download', size: 30, iconSize: 18, tooltip: s.t('download'), onPressed: () => _save(context, a)),
                    ]),
                  ),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}

/// web .quick-reply: the docked "Reply to …" card at the bottom of the
/// reader on wider screens.
class _QuickReply extends StatelessWidget {
  final Email email;
  final ValueChanged<ReplyMode> onReply;
  const _QuickReply({required this.email, required this.onReply});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    Widget btn(String icon, String label, ReplyMode m) => _HoverButton(
          onTap: () => onReply(m),
          hover: t.surface,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            PsgIcon(icon, size: 16, color: t.textSecondary),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: t.textSecondary)),
          ]),
        );
    return Container(
      margin: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
      decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.lg)),
      child: Row(children: [
        Expanded(
          child: _HoverButton(
            onTap: () => onReply(ReplyMode.reply),
            hover: t.surface,
            cursor: SystemMouseCursors.text,
            child: Row(children: [
              PsgIcon('psg:reply', size: 16, color: t.textMuted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(s.t('quickReplyTo', {'name': email.name.isNotEmpty ? email.name : email.sendEmail}),
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: t.textMuted)),
              ),
            ]),
          ),
        ),
        const SizedBox(width: 8),
        btn('psg:reply-all', s.t('replyAll'), ReplyMode.replyAll),
        const SizedBox(width: 6),
        btn('psg:forward', s.t('forward'), ReplyMode.forward),
        const SizedBox(width: 6),
        PsgButton(s.t('reply'), icon: 'psg:reply', height: 44, onPressed: () => onReply(ReplyMode.reply)),
      ]),
    );
  }
}

class _HoverButton extends StatefulWidget {
  final Widget child;
  final VoidCallback onTap;
  final Color hover;
  final MouseCursor cursor;
  const _HoverButton({required this.child, required this.onTap, required this.hover, this.cursor = SystemMouseCursors.click});

  @override
  State<_HoverButton> createState() => _HoverButtonState();
}

class _HoverButtonState extends State<_HoverButton> {
  bool _on = false;

  @override
  Widget build(BuildContext context) => MouseRegion(
        cursor: widget.cursor,
        onEnter: (_) => setState(() => _on = true),
        onExit: (_) => setState(() => _on = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(color: _on ? widget.hover : Colors.transparent, borderRadius: BorderRadius.circular(PsgRadius.md)),
            child: widget.child,
          ),
        ),
      );
}

/// web .mobile-reader-actions: orange Reply plus grey Reply all / Forward.
class _PhoneActions extends StatelessWidget {
  final ValueChanged<ReplyMode> onReply;
  final bool forwardOnly;
  const _PhoneActions({required this.onReply, this.forwardOnly = false});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final bottom = MediaQuery.paddingOf(context).bottom;
    Widget btn(String icon, String label, ReplyMode m, {bool primary = false}) => Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: PsgButton(label,
                icon: icon,
                height: 48,
                kind: primary ? PsgButtonKind.primary : PsgButtonKind.secondary,
                expand: true,
                onPressed: () => onReply(m)),
          ),
        );
    return Container(
      color: t.surface,
      padding: EdgeInsets.fromLTRB(9, 10, 9, 12 + bottom),
      child: Row(children: [
        if (!forwardOnly) ...[
          btn('psg:reply', s.t('reply'), ReplyMode.reply, primary: true),
          btn('psg:reply-all', s.t('replyAll'), ReplyMode.replyAll),
        ],
        btn('psg:forward', s.t('forward'), ReplyMode.forward),
      ]),
    );
  }
}
