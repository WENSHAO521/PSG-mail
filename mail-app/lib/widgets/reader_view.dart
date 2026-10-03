import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/session.dart';

enum ReplyMode { reply, replyAll, forward }

enum _MenuAction { archive, unarchive, spam, notSpam, unread, delete, restore, deleteForever }

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

/// One message: header, body and attachments, with the message actions.
/// [onRemoved] fires after the message leaves the current folder
/// (archive, spam, delete…); [onChanged] after read/star changes.
class ReaderView extends StatefulWidget {
  final Email email;
  final Folder folder;
  final void Function(ReplyMode mode, Email email) onReply;
  final void Function(Email email) onRemoved;
  final VoidCallback onChanged;
  final VoidCallback? onClose;

  const ReaderView({
    super.key,
    required this.email,
    required this.folder,
    required this.onReply,
    required this.onRemoved,
    required this.onChanged,
    this.onClose,
  });

  @override
  State<ReaderView> createState() => _ReaderViewState();
}

class _ReaderViewState extends State<ReaderView> {
  Email get e => widget.email;

  @override
  void initState() {
    super.initState();
    _markRead();
  }

  @override
  void didUpdateWidget(ReaderView old) {
    super.didUpdateWidget(old);
    if (old.email.emailId != e.emailId) _markRead();
  }

  void _markRead() {
    if (!e.isUnread) return;
    e.unread = 1;
    widget.onChanged();
    context.read<Session>().api.markRead([e.emailId]).catchError((_) {});
  }

  Future<void> _run(Future<void> Function() call, {bool removes = false}) async {
    try {
      await call();
      if (removes) widget.onRemoved(e);
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$err')));
    }
  }

  Future<void> _toggleStar() async {
    final api = context.read<Session>().api;
    final was = e.isStar;
    setState(() => e.isStar = !was);
    widget.onChanged();
    try {
      await (was ? api.unstar(e.emailId) : api.star(e.emailId));
    } catch (err) {
      setState(() => e.isStar = was);
      widget.onChanged();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$err')));
    }
  }

  void _menu(_MenuAction a) {
    final api = context.read<Session>().api;
    final ids = [e.emailId];
    switch (a) {
      case _MenuAction.archive:
        _run(() => api.archive(ids), removes: true);
      case _MenuAction.unarchive:
        _run(() => api.unarchive(ids), removes: true);
      case _MenuAction.spam:
        _run(() => api.markSpam(ids), removes: true);
      case _MenuAction.notSpam:
        _run(() => api.notSpam(ids), removes: true);
      case _MenuAction.delete:
        _run(() => api.moveToTrash(ids), removes: true);
      case _MenuAction.restore:
        _run(() => api.restore(ids), removes: true);
      case _MenuAction.deleteForever:
        _run(() => api.deleteForever(ids), removes: true);
      case _MenuAction.unread:
        _run(() async {
          await api.markUnread(ids);
          e.unread = 0;
          widget.onChanged();
          widget.onClose?.call();
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final kind = widget.folder.kind;
    final canSend = context.select<Session, bool>((x) => x.user?.can('email:send') ?? true);
    final menu = <PopupMenuEntry<_MenuAction>>[
      if (kind == FolderKind.archive)
        PopupMenuItem(value: _MenuAction.unarchive, child: Text(s.unarchive))
      else if (kind != FolderKind.trash && kind != FolderKind.spam)
        PopupMenuItem(value: _MenuAction.archive, child: Text(s.moveToArchive)),
      if (kind == FolderKind.spam)
        PopupMenuItem(value: _MenuAction.notSpam, child: Text(s.notSpam))
      else if (!e.isSent && kind != FolderKind.trash)
        PopupMenuItem(value: _MenuAction.spam, child: Text(s.markSpam)),
      if (!e.isSent) PopupMenuItem(value: _MenuAction.unread, child: Text(s.markUnread)),
      if (kind == FolderKind.trash) ...[
        PopupMenuItem(value: _MenuAction.restore, child: Text(s.restore)),
        PopupMenuItem(value: _MenuAction.deleteForever, child: Text(s.deleteForever)),
      ] else
        PopupMenuItem(value: _MenuAction.delete, child: Text(s.delete)),
    ];

    final page = Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: widget.onClose == null,
        leading: widget.onClose != null ? IconButton(icon: const Icon(Icons.close), onPressed: widget.onClose) : null,
        actions: [
          IconButton(
            tooltip: e.isStar ? s.unstar : s.star,
            icon: Icon(e.isStar ? Icons.star : Icons.star_outline, color: e.isStar ? Colors.amber : null),
            onPressed: _toggleStar,
          ),
          if (kind != FolderKind.trash)
            IconButton(tooltip: s.delete, icon: const Icon(Icons.delete_outline), onPressed: () => _menu(_MenuAction.delete)),
          PopupMenuButton<_MenuAction>(onSelected: _menu, itemBuilder: (_) => menu),
        ],
      ),
      body: SelectionArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Text(e.subject.isEmpty ? s.noSubject : e.subject, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            _Header(email: e),
            const Divider(height: 32),
            _Body(email: e),
            if (e.attachments.any((a) => !a.isInline)) ...[
              const Divider(height: 32),
              _Attachments(email: e),
            ],
            if (canSend) ...[
              const SizedBox(height: 24),
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton.icon(onPressed: () => widget.onReply(ReplyMode.reply, e), icon: const Icon(Icons.reply), label: Text(s.reply)),
                OutlinedButton.icon(onPressed: () => widget.onReply(ReplyMode.replyAll, e), icon: const Icon(Icons.reply_all), label: Text(s.replyAll)),
                OutlinedButton.icon(onPressed: () => widget.onReply(ReplyMode.forward, e), icon: const Icon(Icons.forward), label: Text(s.forward)),
              ]),
            ],
          ],
        ),
      ),
    );
    if (widget.onClose == null) return page;
    return CallbackShortcuts(
      bindings: {const SingleActivator(LogicalKeyboardKey.escape): widget.onClose!},
      child: Focus(autofocus: true, child: page),
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
    final to = email.recipients.map((a) => a.display).join(', ');
    final cc = email.cc.map((a) => a.display).join(', ');
    final created = email.created;
    final who = email.name.isNotEmpty ? email.name : email.sendEmail;
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      CircleAvatar(child: Text(who.isEmpty ? '?' : who.substring(0, 1).toUpperCase())),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(who, style: theme.textTheme.titleSmall),
          Text(email.sendEmail, style: muted),
          if (to.isNotEmpty || email.toEmail.isNotEmpty)
            Text('${s.to}: ${to.isNotEmpty ? to : email.toEmail}', style: muted),
          if (cc.isNotEmpty) Text('${s.cc}: $cc', style: muted),
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
    // Stored mail references its saved images as {{domain}}<key>.
    final html = email.content.replaceAllMapped(RegExp(r'\{\{domain\}\}([^"\x27)\s]+)'), (m) => session.ossUrl(m[1]!));
    return HtmlWidget(
      html,
      textStyle: Theme.of(context).textTheme.bodyMedium,
      onTapUrl: openExternal,
      customStylesBuilder: (el) {
        // Mail HTML often hardcodes a white page; let the app theme show
        // through instead in dark mode.
        if (Theme.of(context).brightness == Brightness.dark && el.localName == 'body') {
          return {'background-color': 'transparent'};
        }
        return null;
      },
    );
  }
}

class _Attachments extends StatelessWidget {
  final Email email;
  const _Attachments({required this.email});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final session = context.read<Session>();
    final files = email.attachments.where((a) => !a.isInline).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(s.attachmentCount(files.length), style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final a in files)
          ActionChip(
            avatar: const Icon(Icons.insert_drive_file_outlined, size: 18),
            label: Text('${a.filename} · ${formatSize(a.size)}'),
            onPressed: () => openExternal(session.ossUrl(a.key)),
          ),
      ]),
    ]);
  }
}
