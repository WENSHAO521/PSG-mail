import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/mail_list.dart';
import '../state/session.dart';
import 'folder_nav.dart';
import 'mail_actions.dart';
import 'reader_view.dart';

String formatListDate(BuildContext context, DateTime? t) {
  if (t == null) return '';
  final now = DateTime.now();
  final locale = Localizations.localeOf(context).toLanguageTag();
  if (t.year == now.year && t.month == now.month && t.day == now.day) return DateFormat.Hm(locale).format(t);
  if (t.year == now.year) return DateFormat.MMMd(locale).format(t);
  return DateFormat.yMd(locale).format(t);
}

/// Delivery status of sent mail (web email-scroll statusIconMap).
(IconData, Color?, String)? sentStatus(S s, ColorScheme c, int status) => switch (status) {
      1 => (Icons.send_outlined, null, s.t('sent')),
      2 => (Icons.check_circle_outline, Colors.green.shade600, s.t('delivered')),
      3 || 8 => (Icons.error_outline, c.error, s.t('bounced')),
      4 => (Icons.warning_amber_outlined, Colors.orange.shade700, s.t('complained')),
      5 => (Icons.schedule, Colors.orange.shade700, s.t('delayed')),
      7 => (Icons.mail_outline, Colors.orange.shade700, s.t('noRecipient')),
      _ => null,
    };

/// Row actions available in each folder (web: email-scroll context menu).
List<MailAction> rowActions(FolderKind k, Email e) => [
      if (e.isUnread) MailAction.read else if (!e.isSent) MailAction.unread,
      e.isStar ? MailAction.unstar : MailAction.star,
      if (k == FolderKind.archive) MailAction.unarchive,
      if (const {FolderKind.inbox, FolderKind.allInbox, FolderKind.starred, FolderKind.label}.contains(k) && !e.isSent)
        MailAction.archive,
      if (k == FolderKind.spam) MailAction.notSpam,
      if (const {FolderKind.inbox, FolderKind.allInbox}.contains(k)) MailAction.spam,
      if (k == FolderKind.trash) MailAction.restore,
      MailAction.labels,
      MailAction.exportEml,
      MailAction.delete,
    ];

String actionLabel(S s, MailAction a, FolderKind k) => switch (a) {
      MailAction.read => s.t('markAsRead'),
      MailAction.unread => s.t('markAsUnread'),
      MailAction.star => s.t('star'),
      MailAction.unstar => s.t('unstar'),
      MailAction.archive => s.t('archive'),
      MailAction.unarchive => s.t('unarchive'),
      MailAction.spam => s.t('markAsSpam'),
      MailAction.notSpam => s.t('notSpam'),
      MailAction.restore => s.t('restore'),
      MailAction.exportEml => s.t('exportEml'),
      MailAction.labels => s.t('labels'),
      MailAction.delete => k == FolderKind.trash ? s.t('permanentDelete') : s.t('delete'),
    };

IconData actionIcon(MailAction a) => switch (a) {
      MailAction.read => Icons.mark_email_read_outlined,
      MailAction.unread => Icons.mark_email_unread_outlined,
      MailAction.star => Icons.star_outline,
      MailAction.unstar => Icons.star,
      MailAction.archive => Icons.archive_outlined,
      MailAction.unarchive => Icons.move_to_inbox_outlined,
      MailAction.spam => Icons.report_gmailerrorred_outlined,
      MailAction.notSpam => Icons.verified_outlined,
      MailAction.restore => Icons.restore,
      MailAction.exportEml => Icons.file_download_outlined,
      MailAction.labels => Icons.label_outline,
      MailAction.delete => Icons.delete_outline,
    };

class MailListView extends StatefulWidget {
  final MailList list;
  final int? selectedId;
  final ValueChanged<Email> onOpen;
  final void Function(ReplyMode mode, Email email)? onReply;

  const MailListView({super.key, required this.list, required this.onOpen, this.selectedId, this.onReply});

  @override
  State<MailListView> createState() => _MailListViewState();
}

class _MailListViewState extends State<MailListView> {
  final _scroll = ScrollController();

  MailList get list => widget.list;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 600) list.loadMore();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  MailActions get _actions => MailActions(context, list.folder);

  Future<void> _run(MailAction a, List<Email> mail) async {
    final gone = await _actions.run(a, mail, onUndone: list.refresh);
    if (!mounted) return;
    if (gone.isNotEmpty) list.remove(gone);
    if (a != MailAction.labels || gone.isEmpty) list.touch();
    if (const {MailAction.read, MailAction.unread, MailAction.star, MailAction.unstar, MailAction.exportEml, MailAction.labels}
        .contains(a)) {
      list.clearSelection();
    }
  }

  Future<void> _swipe(Email e, DismissDirection dir) async {
    final archiveSide = dir == DismissDirection.startToEnd;
    final k = list.folder.kind;
    final action = k == FolderKind.trash
        ? (archiveSide ? MailAction.restore : MailAction.delete)
        : archiveSide
            ? (k == FolderKind.archive ? MailAction.unarchive : MailAction.archive)
            : MailAction.delete;
    await _run(action, [e]);
  }

  Future<void> _contextMenu(Email e, Offset at) async {
    final s = S.of(context);
    final k = list.folder.kind;
    final canSend = context.read<Session>().user?.can('email:send') ?? true;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final choice = await showMenu<Object>(
      context: context,
      position: RelativeRect.fromRect(at & const Size(1, 1), Offset.zero & overlay.size),
      items: [
        if (e.code.isNotEmpty) PopupMenuItem(value: 'code', child: _menuRow(Icons.copy, s.t('copyCode'))),
        if (canSend && widget.onReply != null && !e.isSent) ...[
          PopupMenuItem(value: ReplyMode.reply, child: _menuRow(Icons.reply, s.t('reply'))),
          PopupMenuItem(value: ReplyMode.replyAll, child: _menuRow(Icons.reply_all, s.t('replyAll'))),
        ],
        if (canSend && widget.onReply != null)
          PopupMenuItem(value: ReplyMode.forward, child: _menuRow(Icons.forward, s.t('forward'))),
        const PopupMenuDivider(),
        for (final a in rowActions(k, e)) PopupMenuItem(value: a, child: _menuRow(actionIcon(a), actionLabel(s, a, k))),
      ],
    );
    if (!mounted || choice == null) return;
    if (choice == 'code') {
      _actions.copyCode(e.code);
    } else if (choice is ReplyMode) {
      widget.onReply?.call(choice, e);
    } else if (choice is MailAction) {
      _run(choice, [e]);
    }
  }

  static Widget _menuRow(IconData icon, String text) =>
      Row(children: [Icon(icon, size: 18), const SizedBox(width: 12), Text(text)]);

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return ListenableBuilder(
      listenable: list,
      builder: (context, _) {
        return Column(children: [
          list.selecting ? _SelectionBar(list: list, onAction: _run) : _Toolbar(list: list),
          Expanded(child: _body(s)),
        ]);
      },
    );
  }

  Widget _body(S s) {
    final items = list.items;
    if (items.isEmpty) {
      if (list.loading) return const Center(child: CircularProgressIndicator());
      return RefreshIndicator(
        onRefresh: list.refresh,
        child: ListView(children: [
          const SizedBox(height: 120),
          Icon(list.error != null ? Icons.cloud_off_outlined : folderIcon(list.folder.kind),
              size: 48, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Center(
            child: Text(list.error != null
                ? '${s.loadFailed}: ${list.error}'
                : (list.isSearch ? s.t('noSearchResults') : s.t('noMessagesFound'))),
          ),
          if (list.error != null) Center(child: TextButton(onPressed: list.refresh, child: Text(s.retry))),
        ]),
      );
    }
    final k = list.folder.kind;
    final swipeable = !list.isSearch && k != FolderKind.spam && !list.selecting;
    return RefreshIndicator(
      onRefresh: list.refresh,
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: items.length + (list.hasMore ? 1 : 0),
        separatorBuilder: (_, _) => const Divider(indent: 72),
        itemBuilder: (context, i) {
          if (i == items.length) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: list.loading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(s.t('noMoreData'), style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              ),
            );
          }
          final e = items[i];
          final row = MailRow(
            email: e,
            folder: k,
            showMailbox: k == FolderKind.allInbox,
            selected: e.emailId == widget.selectedId,
            checked: list.selected.contains(e.emailId),
            onTap: () => list.selecting ? list.toggleSelect(e.emailId) : widget.onOpen(e),
            onToggle: () => list.toggleSelect(e.emailId),
            onContextMenu: (at) => _contextMenu(e, at),
            onCopyCode: () => _actions.copyCode(e.code),
          );
          if (!swipeable) return row;
          final trash = k == FolderKind.trash;
          final archived = k == FolderKind.archive;
          return Dismissible(
            key: ValueKey(e.emailId),
            background: _SwipeBg(
              alignment: Alignment.centerLeft,
              color: Colors.green.shade700,
              icon: trash ? Icons.restore : (archived ? Icons.move_to_inbox : Icons.archive_outlined),
            ),
            secondaryBackground: _SwipeBg(
              alignment: Alignment.centerRight,
              color: Colors.red.shade700,
              icon: trash ? Icons.delete_forever : Icons.delete_outline,
            ),
            // Delete asks first (web confirms), so the row only goes once confirmed.
            confirmDismiss: (dir) async {
              await _swipe(e, dir);
              return false;
            },
            child: row,
          );
        },
      ),
    );
  }
}

/// Count, unread filter, sort and refresh (web: explorer toolbar).
class _Toolbar extends StatelessWidget {
  final MailList list;
  const _Toolbar({required this.list});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final unread = list.unreadCount;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
      child: Row(children: [
        if (list.hasUnread) ...[
          ChoiceChip(
            label: Text(s.t('all')),
            selected: !list.unreadOnly,
            onSelected: (_) => list.setUnreadOnly(false),
            visualDensity: VisualDensity.compact,
          ),
          const SizedBox(width: 6),
          ChoiceChip(
            label: Text(s.t('unreadOnly')),
            selected: list.unreadOnly,
            onSelected: (_) => list.setUnreadOnly(true),
            visualDensity: VisualDensity.compact,
          ),
        ],
        const Spacer(),
        if (list.hasUnread && unread > 0)
          IconButton(
            tooltip: s.t('markAllRead'),
            icon: const Icon(Icons.done_all),
            onPressed: () async {
              final mail = list.all.where((e) => e.isUnread).toList();
              await MailActions(context, list.folder).run(MailAction.read, mail);
              list.touch();
            },
          ),
        IconButton(
          tooltip: s.t('select'),
          icon: const Icon(Icons.checklist),
          onPressed: list.items.isEmpty ? null : list.selectAll,
        ),
        if (list.sortable)
          IconButton(
            tooltip: list.oldestFirst ? s.t('sortOldest') : s.t('sortNewest'),
            icon: Icon(list.oldestFirst ? Icons.arrow_upward : Icons.arrow_downward),
            onPressed: () => SortToggle.of(context)?.call(),
          ),
        Text(
          list.isSearch ? s.t('searchResultCount', {'count': list.items.length}) : '',
          style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.outline),
        ),
      ]),
    );
  }
}

/// Lets the shell provide the sort toggle (the list is rebuilt per order).
class SortToggle extends InheritedWidget {
  final VoidCallback onToggle;
  const SortToggle({super.key, required this.onToggle, required super.child});

  static VoidCallback? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<SortToggle>()?.onToggle;

  @override
  bool updateShouldNotify(SortToggle old) => old.onToggle != onToggle;
}

/// Batch actions for the selected rows.
class _SelectionBar extends StatelessWidget {
  final MailList list;
  final Future<void> Function(MailAction, List<Email>) onAction;
  const _SelectionBar({required this.list, required this.onAction});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final k = list.folder.kind;
    final mail = list.selectedMail;
    final allStarred = mail.isNotEmpty && mail.every((e) => e.isStar);
    final anyUnread = mail.any((e) => e.isUnread);
    final actions = <MailAction>[
      anyUnread ? MailAction.read : MailAction.unread,
      allStarred ? MailAction.unstar : MailAction.star,
      if (k == FolderKind.archive) MailAction.unarchive,
      if (const {FolderKind.inbox, FolderKind.allInbox, FolderKind.starred, FolderKind.label}.contains(k))
        MailAction.archive,
      if (k == FolderKind.spam) MailAction.notSpam,
      if (const {FolderKind.inbox, FolderKind.allInbox}.contains(k)) MailAction.spam,
      if (k == FolderKind.trash) MailAction.restore,
      MailAction.labels,
      MailAction.exportEml,
      MailAction.delete,
    ];
    final primary = actions.take(4).toList();
    final overflow = actions.skip(4).toList();
    return Material(
      color: Theme.of(context).colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: Row(children: [
          IconButton(tooltip: s.t('cancel'), icon: const Icon(Icons.close), onPressed: list.clearSelection),
          Text('${list.selected.length}', style: Theme.of(context).textTheme.titleMedium),
          IconButton(tooltip: s.t('selectAll'), icon: const Icon(Icons.select_all), onPressed: list.selectAll),
          const Spacer(),
          for (final a in primary)
            IconButton(tooltip: actionLabel(s, a, k), icon: Icon(actionIcon(a)), onPressed: () => onAction(a, mail)),
          PopupMenuButton<MailAction>(
            onSelected: (a) => onAction(a, mail),
            itemBuilder: (_) => [
              for (final a in overflow)
                PopupMenuItem(
                  value: a,
                  child: Row(children: [Icon(actionIcon(a), size: 18), const SizedBox(width: 12), Text(actionLabel(s, a, k))]),
                ),
            ],
          ),
        ]),
      ),
    );
  }
}

class _SwipeBg extends StatelessWidget {
  final Alignment alignment;
  final Color color;
  final IconData icon;
  const _SwipeBg({required this.alignment, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) => Container(
        color: color,
        alignment: alignment,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Icon(icon, color: Colors.white),
      );
}

class MailRow extends StatelessWidget {
  final Email email;
  final FolderKind folder;
  final bool selected;
  final bool checked;
  final bool showMailbox;
  final VoidCallback onTap;
  final VoidCallback? onToggle;
  final void Function(Offset at)? onContextMenu;
  final VoidCallback? onCopyCode;

  const MailRow({
    super.key,
    required this.email,
    required this.onTap,
    this.folder = FolderKind.inbox,
    this.selected = false,
    this.checked = false,
    this.showMailbox = false,
    this.onToggle,
    this.onContextMenu,
    this.onCopyCode,
  });

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final unread = email.isUnread;
    final weight = unread ? FontWeight.w700 : FontWeight.w400;
    final who = email.counterpart;
    final status = email.isSent ? sentStatus(s, scheme, email.status) : null;
    final session = context.read<Session>();
    final mailbox = showMailbox
        ? session.accounts.where((a) => a.accountId == email.accountId).map((a) => a.email).firstOrNull
        : null;
    return Material(
      color: checked
          ? scheme.primaryContainer.withValues(alpha: .5)
          : selected
              ? scheme.secondaryContainer.withValues(alpha: .6)
              : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: onToggle,
        onSecondaryTapDown: onContextMenu == null ? null : (d) => onContextMenu!(d.globalPosition),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            GestureDetector(
              onTap: onToggle,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 150),
                child: checked
                    ? CircleAvatar(
                        key: const ValueKey('checked'),
                        radius: 20,
                        backgroundColor: scheme.primary,
                        child: Icon(Icons.check, color: scheme.onPrimary),
                      )
                    : CircleAvatar(
                        key: const ValueKey('avatar'),
                        radius: 20,
                        child: Text(who.isEmpty ? '?' : who.substring(0, 1).toUpperCase()),
                      ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  if (status != null) ...[
                    Tooltip(message: status.$3, child: Icon(status.$1, size: 14, color: status.$2 ?? scheme.outline)),
                    const SizedBox(width: 4),
                  ],
                  Expanded(
                    child: Text(who, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: weight)),
                  ),
                  const SizedBox(width: 8),
                  Text(formatListDate(context, email.created),
                      style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: weight, color: unread ? scheme.primary : scheme.outline)),
                ]),
                const SizedBox(height: 2),
                Row(children: [
                  if (email.code.isNotEmpty) ...[
                    InkWell(
                      onTap: onCopyCode,
                      borderRadius: BorderRadius.circular(4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: scheme.tertiaryContainer,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text('${s.t('codeLabel')}${email.code}',
                            style: theme.textTheme.labelSmall?.copyWith(color: scheme.onTertiaryContainer)),
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: Text(email.subject.isEmpty ? s.t('noSubject') : email.subject,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: weight)),
                  ),
                ]),
                const SizedBox(height: 2),
                Row(children: [
                  if (mailbox != null) ...[
                    Text('${mailbox.split('@').first}@',
                        style: theme.textTheme.labelSmall?.copyWith(color: scheme.primary)),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: Text(email.preview, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.outline)),
                  ),
                  for (final l in email.labels.take(3))
                    Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        decoration: BoxDecoration(
                          color: (labelColor(l.color) ?? scheme.outline).withValues(alpha: .15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(l.name,
                            style: theme.textTheme.labelSmall?.copyWith(color: labelColor(l.color) ?? scheme.outline)),
                      ),
                    ),
                  if (email.attachments.any((a) => !a.isInline))
                    Icon(Icons.attach_file, size: 16, color: scheme.outline),
                  if (email.isStar) const Icon(Icons.star, size: 16, color: Colors.amber),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
