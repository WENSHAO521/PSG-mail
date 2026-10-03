import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../services/print_service.dart';
import '../state/session.dart';
import 'folder_nav.dart';
import 'mail_actions.dart';

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

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final session = context.watch<Session>();
    final kind = widget.folder.kind;
    final canSend = session.user?.can('email:send') ?? true;
    final canDelete = session.user?.can('email:delete') ?? true;
    final showReply = canSend && !e.isSent;
    final pos = widget.position;

    final overflow = <PopupMenuEntry<Object>>[
      if (kind == FolderKind.archive)
        PopupMenuItem(value: MailAction.unarchive, child: Text(s.t('unarchive')))
      else if (!const {FolderKind.trash, FolderKind.spam, FolderKind.sent}.contains(kind) && !e.isSent)
        PopupMenuItem(value: MailAction.archive, child: Text(s.t('archive'))),
      if (kind == FolderKind.spam || e.isSpam)
        PopupMenuItem(value: MailAction.notSpam, child: Text(s.t('notSpam')))
      else if (!e.isSent && kind != FolderKind.trash)
        PopupMenuItem(value: MailAction.spam, child: Text(s.t('markAsSpam'))),
      if (kind == FolderKind.trash) PopupMenuItem(value: MailAction.restore, child: Text(s.t('restore'))),
      const PopupMenuDivider(),
      PopupMenuItem(value: 'print', child: Text(s.t('printEmail'))),
      PopupMenuItem(value: MailAction.exportEml, child: Text(s.t('downloadEml'))),
    ];

    final page = Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: widget.onClose == null,
        leading: widget.onClose != null
            ? IconButton(tooltip: s.t('back'), icon: const Icon(Icons.arrow_back), onPressed: widget.onClose)
            : null,
        titleSpacing: 0,
        title: pos != null && pos.total > 0
            ? Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(
                  tooltip: s.t('previous'),
                  icon: const Icon(Icons.keyboard_arrow_up),
                  onPressed: pos.onPrevious,
                ),
                Tooltip(
                  message: s.t('emailPositionHint'),
                  child: Text('${pos.index} / ${pos.total}', style: theme.textTheme.labelMedium),
                ),
                IconButton(tooltip: s.t('next'), icon: const Icon(Icons.keyboard_arrow_down), onPressed: pos.onNext),
              ])
            : null,
        actions: [
          IconButton(
            tooltip: e.isStar ? s.t('unstar') : s.t('star'),
            icon: Icon(e.isStar ? Icons.star : Icons.star_outline, color: e.isStar ? Colors.amber : null),
            onPressed: _toggleStar,
          ),
          if (canDelete)
            IconButton(tooltip: s.t('delete'), icon: const Icon(Icons.delete_outline), onPressed: () => _run(MailAction.delete)),
          if (!e.isSent)
            IconButton(
              tooltip: s.t('markAsUnread'),
              icon: const Icon(Icons.mark_email_unread_outlined),
              onPressed: () => _run(MailAction.unread),
            ),
          IconButton(
            tooltip: s.t('labelApply'),
            icon: const Icon(Icons.label_outline),
            onPressed: () => _run(MailAction.labels),
          ),
          IconButton(
            tooltip: _panel == _Panel.translate ? s.t('showOriginal') : s.t('translateEmail'),
            icon: Icon(Icons.translate, color: _panel == _Panel.translate ? theme.colorScheme.primary : null),
            onPressed: _panelLoading ? null : () => _translate(),
          ),
          PopupMenuButton<_Panel>(
            tooltip: s.t('aiTransform'),
            icon: Icon(Icons.auto_awesome_outlined,
                color: const {_Panel.summary, _Panel.reply}.contains(_panel) ? theme.colorScheme.primary : null),
            onSelected: _ai,
            itemBuilder: (_) => [
              PopupMenuItem(value: _Panel.summary, child: Text(s.t('aiMailSummary'))),
              if (showReply) PopupMenuItem(value: _Panel.reply, child: Text(s.t('aiReplySuggestion'))),
            ],
          ),
          PopupMenuButton<Object>(
            tooltip: s.t('more'),
            onSelected: (v) => v == 'print' ? _print() : _run(v as MailAction),
            itemBuilder: (_) => overflow,
          ),
        ],
      ),
      body: SelectionArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Text(e.subject.isEmpty ? s.t('noSubject') : e.subject, style: theme.textTheme.titleLarge),
            if (e.labels.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: [
                for (final l in e.labels)
                  Chip(
                    visualDensity: VisualDensity.compact,
                    avatar: Icon(Icons.label, size: 16, color: labelColor(l.color)),
                    label: Text(l.name),
                  ),
              ]),
            ],
            const SizedBox(height: 16),
            _Header(email: e),
            if (e.isSent) ..._deliveryAlerts(s, theme),
            if (e.isSpam || kind == FolderKind.spam) ...[
              const SizedBox(height: 12),
              _SpamBanner(reason: _spamReason, busy: _spamBusy, onNotSpam: _notSpam),
            ],
            const Divider(height: 32),
            _Body(email: e),
            if (_panel != _Panel.none) ...[
              const SizedBox(height: 16),
              _panelCard(s, theme),
            ],
            if (e.attachments.any((a) => !a.isInline)) ...[
              const Divider(height: 32),
              _Attachments(email: e),
            ],
            if (showReply) ...[
              const SizedBox(height: 24),
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.icon(onPressed: () => widget.onReply(ReplyMode.reply, e), icon: const Icon(Icons.reply), label: Text(s.t('reply'))),
                OutlinedButton.icon(onPressed: () => widget.onReply(ReplyMode.replyAll, e), icon: const Icon(Icons.reply_all), label: Text(s.t('replyAll'))),
                OutlinedButton.icon(onPressed: () => widget.onReply(ReplyMode.forward, e), icon: const Icon(Icons.forward), label: Text(s.t('forward'))),
              ]),
            ] else if (canSend) ...[
              const SizedBox(height: 24),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                    onPressed: () => widget.onReply(ReplyMode.forward, e), icon: const Icon(Icons.forward), label: Text(s.t('forward'))),
              ),
            ],
          ],
        ),
      ),
    );

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
      child: Focus(autofocus: true, child: page),
    );
  }

  List<Widget> _deliveryAlerts(S s, ThemeData theme) {
    final (text, color) = switch (e.status) {
      3 || 8 => (e.deliveryMessage.isNotEmpty ? e.deliveryMessage : s.t('bounced'), theme.colorScheme.error),
      4 => (s.t('complained'), Colors.orange.shade800),
      5 => (s.t('delayed'), Colors.orange.shade800),
      _ => ('', null),
    };
    if (text.isEmpty) return const [];
    return [
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color!.withValues(alpha: .1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: .4)),
        ),
        child: Row(children: [
          Icon(Icons.warning_amber_rounded, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: color))),
        ]),
      ),
    ];
  }

  Widget _panelCard(S s, ThemeData theme) {
    final title = switch (_panel) {
      _Panel.translate => s.t('translatedResult'),
      _Panel.summary => s.t('aiSummaryTitle'),
      _ => s.t('aiReplySuggestionTitle'),
    };
    final mono = theme.textTheme.bodyMedium;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(_panel == _Panel.translate ? Icons.translate : Icons.auto_awesome_outlined, size: 18),
            const SizedBox(width: 8),
            Text(title, style: theme.textTheme.titleSmall),
            if (_panel == _Panel.translate) ...[
              const SizedBox(width: 8),
              Chip(
                visualDensity: VisualDensity.compact,
                label: Text(_targetLang == 'zh' ? s.t('translateToZh') : s.t('translateToEn')),
              ),
            ],
            const Spacer(),
            if (_panel == _Panel.translate)
              TextButton(
                onPressed: _panelLoading ? null : () => _translate(switchLang: true),
                child: Text(_targetLang == 'zh' ? s.t('translateToEn') : s.t('translateToZh')),
              ),
            if (_panel == _Panel.reply && _panelText.isNotEmpty)
              IconButton(
                tooltip: s.t('copy'),
                icon: const Icon(Icons.copy, size: 18),
                onPressed: () => Clipboard.setData(ClipboardData(text: _panelText)),
              ),
            IconButton(
              tooltip: s.t('close'),
              icon: const Icon(Icons.close, size: 18),
              onPressed: () => setState(() => _panel = _Panel.none),
            ),
          ]),
          const SizedBox(height: 8),
          if (_panelLoading)
            const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
          else if (_panel == _Panel.translate)
            LayoutBuilder(builder: (context, box) {
              final original = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.t('showOriginal'), style: theme.textTheme.labelMedium),
                const SizedBox(height: 4),
                Text(_original, style: mono),
              ]);
              final translated = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.t('translatedResult'), style: theme.textTheme.labelMedium),
                const SizedBox(height: 4),
                Text(_panelText, style: mono),
              ]);
              return box.maxWidth > 560
                  ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(child: original),
                      const SizedBox(width: 16),
                      Expanded(child: translated),
                    ])
                  : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [translated, const Divider(height: 24), original]);
            })
          else
            Text(_panelText, style: mono),
        ]),
      ),
    );
  }
}

class _SpamBanner extends StatelessWidget {
  final String? reason;
  final bool busy;
  final VoidCallback onNotSpam;
  const _SpamBanner({required this.reason, required this.busy, required this.onNotSpam});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final color = Colors.orange.shade800;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: .4)),
      ),
      child: Row(children: [
        Icon(Icons.report_gmailerrorred_outlined, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(reason != null ? s.t('aiSpamBannerTitle') : s.t('spamBannerTitle'),
                style: theme.textTheme.titleSmall),
            if (reason != null)
              Text(reason!.isNotEmpty ? reason! : s.t('aiSpamBannerFallback'), style: theme.textTheme.bodySmall),
          ]),
        ),
        const SizedBox(width: 8),
        OutlinedButton(onPressed: busy ? null : onNotSpam, child: Text(s.t('notSpam'))),
      ]),
    );
  }
}

class _Header extends StatelessWidget {
  final Email email;
  const _Header({required this.email});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final to = email.recipients.map((a) => a.address).join(', ');
    final cc = email.cc.map((a) => a.address).join(', ');
    final bcc = parseAddresses(email.bccJson).map((a) => a.address).join(', ');
    final created = email.created;
    final who = email.name.isNotEmpty ? email.name : email.sendEmail;
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      CircleAvatar(child: Text(who.isEmpty ? '?' : who.substring(0, 1).toUpperCase())),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(who, style: theme.textTheme.titleSmall),
          if (email.name.isNotEmpty) Text(email.sendEmail, style: muted),
          if (to.isNotEmpty || email.toEmail.isNotEmpty) Text('${s.t('sentTo')} ${to.isNotEmpty ? to : email.toEmail}', style: muted),
          if (cc.isNotEmpty) Text('${s.t('cc')} $cc', style: muted),
          if (bcc.isNotEmpty) Text('${s.t('bcc')} $bcc', style: muted),
        ]),
      ),
      if (created != null)
        Text(DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).add_Hm().format(created), style: muted),
    ]);
  }
}

class _Body extends StatelessWidget {
  final Email email;
  const _Body({required this.email});

  @override
  Widget build(BuildContext context) {
    final session = context.read<Session>();
    if (email.content.trim().isEmpty) {
      return Text(email.text, style: Theme.of(context).textTheme.bodyMedium);
    }
    final dark = Theme.of(context).brightness == Brightness.dark;
    return HtmlWidget(
      resolveStoredImages(session, email.content),
      textStyle: Theme.of(context).textTheme.bodyMedium,
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
          out['color'] = '#E6EAE7';
        }
        return out.isEmpty ? null : out;
      },
    );
  }
}

class _Attachments extends StatelessWidget {
  final Email email;
  const _Attachments({required this.email});

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
      builder: (c) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: Stack(children: [
          InteractiveViewer(maxScale: 6, child: Center(child: Image.network(url, fit: BoxFit.contain))),
          Positioned(
            right: 4,
            top: 4,
            child: IconButton.filledTonal(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(c)),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final files = email.attachments.where((a) => !a.isInline).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${s.t('attachments')} · ${s.t('attCount', {'total': files.length})}',
          style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final a in files)
          InputChip(
            avatar: Icon(isImageName(a.filename) ? Icons.image_outlined : Icons.insert_drive_file_outlined, size: 18),
            label: Text('${a.filename} · ${formatSize(a.size)}'),
            onPressed: isImageName(a.filename) ? () => _preview(context, a) : () => _save(context, a),
            deleteIcon: const Icon(Icons.download, size: 18),
            deleteButtonTooltipMessage: s.t('download'),
            onDeleted: () => _save(context, a),
          ),
      ]),
    ]);
  }
}
