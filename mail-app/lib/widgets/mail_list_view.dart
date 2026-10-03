import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/mail_list.dart';
import '../state/session.dart';
import '../ui/psg.dart';
import '../util/day.dart';
import 'mail_actions.dart';
import 'reader_view.dart';

/// List time, as the web list shows it (utils/day.js fromNow).
String formatListDate(BuildContext context, DateTime? t) => fromNow(t, en: !S.of(context).zh);

/// Delivery status of sent mail (web email-scroll statusIconMap).
(String, Color, String)? sentStatus(BuildContext context, int status) {
  final s = S.of(context);
  final t = context.psg;
  return switch (status) {
    1 => ('psg:send', t.textMuted, s.t('sent')),
    2 => ('psg:check-circle', t.success, s.t('delivered')),
    3 || 8 => ('psg:warning', t.danger, s.t('bounced')),
    4 => ('psg:warning', t.warning, s.t('complained')),
    5 => ('psg:clock', t.warning, s.t('delayed')),
    7 => ('psg:mail', t.warning, s.t('noRecipient')),
    _ => null,
  };
}

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

/// The web context menu's icon for each action.
String actionIcon(MailAction a) => switch (a) {
      MailAction.read || MailAction.unread => 'psg:mail',
      MailAction.star => 'psg:star',
      MailAction.unstar => 'fluent-color:star-16',
      MailAction.archive => 'psg:archive',
      MailAction.unarchive || MailAction.restore => 'solar:inbox-out-linear',
      MailAction.spam => 'psg:warning',
      MailAction.notSpam => 'psg:check-circle',
      MailAction.exportEml => 'psg:download',
      MailAction.labels => 'psg:tag',
      MailAction.delete => 'psg:trash',
    };

/// The folder's mail (web components/email-scroll): optional explorer head
/// ([head]: title, mailbox chips, search), the toolbar, then the rows.
class MailListView extends StatefulWidget {
  final MailList list;
  final int? selectedId;
  final ValueChanged<Email> onOpen;
  final void Function(ReplyMode mode, Email email)? onReply;
  final Widget? head;

  const MailListView({super.key, required this.list, required this.onOpen, this.selectedId, this.onReply, this.head});

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

  Future<void> _contextMenu(Email e, Offset at) async {
    final s = S.of(context);
    final k = list.folder.kind;
    final canSend = context.read<Session>().user?.can('email:send') ?? true;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final choice = await showMenu<Object>(
      context: context,
      position: RelativeRect.fromRect(at & const Size(1, 1), Offset.zero & overlay.size),
      items: [
        if (e.code.isNotEmpty) psgMenuItem(context, 'code', s.t('copyCode'), icon: 'fluent-color:clipboard-24'),
        if (canSend && widget.onReply != null && !e.isSent) ...[
          psgMenuItem(context, ReplyMode.reply, s.t('reply'), icon: 'psg:reply'),
          psgMenuItem(context, ReplyMode.replyAll, s.t('replyAll'), icon: 'psg:reply-all'),
        ],
        if (canSend && widget.onReply != null) psgMenuItem(context, ReplyMode.forward, s.t('forward'), icon: 'psg:forward'),
        const PopupMenuDivider(height: 9),
        for (final a in rowActions(k, e))
          psgMenuItem(context, a, actionLabel(s, a, k), icon: actionIcon(a), danger: a == MailAction.delete),
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

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: list,
      builder: (context, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        ?widget.head,
        _Toolbar(list: list, onAction: _run),
        Expanded(child: _body()),
      ]),
    );
  }

  Widget _body() {
    final s = S.of(context);
    final t = context.psg;
    final items = list.items;
    if (items.isEmpty) {
      if (list.loading) return const _Skeleton();
      return RefreshIndicator(
        color: t.primary,
        onRefresh: list.refresh,
        child: ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
          const SizedBox(height: 80),
          PsgEmpty(
            icon: list.error != null ? 'psg:warning' : (list.isSearch ? 'psg:search' : 'psg:mail'),
            title: list.error != null
                ? '${s.loadFailed}: ${s.error(list.error!)}'
                : (list.isSearch ? s.t('noSearchResults') : s.t('noMessagesFound')),
            action: list.error != null ? PsgButton(s.retry, kind: PsgButtonKind.secondary, height: 34, onPressed: list.refresh) : null,
          ),
        ]),
      );
    }
    final k = list.folder.kind;
    final swipeable = !list.isSearch && k != FolderKind.spam && !list.selecting;
    final session = context.read<Session>();
    return RefreshIndicator(
      color: t.primary,
      onRefresh: list.refresh,
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 8),
        itemCount: items.length + 1,
        itemBuilder: (context, i) {
          if (i == items.length) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: list.hasMore
                    ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: t.textMuted))
                    : Text(s.t('noMoreData'), style: TextStyle(fontSize: 12, color: t.textMuted)),
              ),
            );
          }
          final e = items[i];
          final row = MailRow(
            email: e,
            folder: k,
            mailbox: k == FolderKind.allInbox && !e.isSent && e.toEmail.isNotEmpty ? e.toEmail : null,
            open: e.emailId == widget.selectedId,
            checked: list.selected.contains(e.emailId),
            selecting: list.selecting,
            onTap: () => list.selecting ? list.toggleSelect(e.emailId) : widget.onOpen(e),
            onToggle: () => list.toggleSelect(e.emailId),
            onContextMenu: (at) => _contextMenu(e, at),
            onCopyCode: () => _actions.copyCode(e.code),
            onQuick: (a) => _run(a, [e]),
            canDelete: session.user?.can('email:delete') ?? true,
          );
          if (!swipeable) return row;
          // Web: swipe right archives (restores in Trash / Archive), swipe
          // left reveals "More" (here: opens the row menu).
          final archiveAction = switch (k) {
            FolderKind.trash => MailAction.restore,
            FolderKind.archive => MailAction.unarchive,
            FolderKind.sent || FolderKind.starred when e.isSent => null,
            _ => MailAction.archive,
          };
          return Dismissible(
            key: ValueKey(e.emailId),
            direction: archiveAction == null ? DismissDirection.endToStart : DismissDirection.horizontal,
            background: archiveAction == null
                ? const SizedBox.shrink()
                : _SwipeBg(label: actionLabel(s, archiveAction, k), icon: actionIcon(archiveAction), archive: true),
            secondaryBackground: _SwipeBg(label: s.t('more'), icon: 'psg:more', archive: false),
            confirmDismiss: (dir) async {
              if (dir == DismissDirection.startToEnd) {
                await _run(archiveAction!, [e]);
              } else {
                final box = context.findRenderObject() as RenderBox?;
                final size = MediaQuery.sizeOf(context);
                _contextMenu(e, box?.localToGlobal(Offset(size.width - 40, 0)) ?? Offset(size.width - 40, size.height / 2));
              }
              return false;
            },
            child: row,
          );
        },
      ),
    );
  }
}

/// Web .mail-toolbar: select-all, the All/Unread pills, sort, refresh, the
/// batch actions while rows are checked, and the count on the right.
class _Toolbar extends StatelessWidget {
  final MailList list;
  final Future<void> Function(MailAction, List<Email>) onAction;
  const _Toolbar({required this.list, required this.onAction});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final k = list.folder.kind;
    final phone = MediaQuery.sizeOf(context).width <= 768;
    final items = list.items;
    final selected = list.selectedMail;
    final allChecked = items.isNotEmpty && selected.length == items.length;
    final canDelete = context.read<Session>().user?.can('email:delete') ?? true;

    void checkAll(bool v) => v ? list.selectAll() : list.clearSelection();

    final overflow = <MailAction>[
      if (selected.isNotEmpty) ...[
        selected.every((e) => e.isStar) ? MailAction.unstar : MailAction.star,
        if (selected.any((e) => e.isUnread)) MailAction.read else MailAction.unread,
        if (k == FolderKind.archive) MailAction.unarchive,
        if (const {FolderKind.inbox, FolderKind.allInbox, FolderKind.starred, FolderKind.label}.contains(k))
          MailAction.archive,
        if (k == FolderKind.spam) MailAction.notSpam,
        if (const {FolderKind.inbox, FolderKind.allInbox}.contains(k)) MailAction.spam,
        if (k == FolderKind.trash) MailAction.restore,
        MailAction.labels,
      ],
    ];

    final controls = <Widget>[
      if (list.selecting && phone)
        PsgIconButton('psg:close', iconSize: 16, tooltip: s.t('cancel'), onPressed: list.clearSelection),
      PsgCheckbox(
        value: allChecked ? true : (selected.isEmpty ? false : null),
        onChanged: items.isEmpty ? null : checkAll,
      ),
      if (list.hasUnread) ...[
        const SizedBox(width: 6),
        PsgPill(s.t('all'), active: !list.unreadOnly, onTap: () => list.setUnreadOnly(false)),
        const SizedBox(width: 6),
        PsgPill(s.t('unreadOnly'), active: list.unreadOnly, onTap: () => list.setUnreadOnly(true)),
        const SizedBox(width: 4),
      ],
      if (list.sortable)
        PsgIconButton('psg:sort',
            iconSize: 13,
            tooltip: list.oldestFirst ? s.t('sortOldest') : s.t('sortNewest'),
            onPressed: () => SortToggle.of(context)?.call()),
      PsgIconButton('psg:refresh', iconSize: 17, tooltip: s.t('refresh'), onPressed: list.refresh),
      if (selected.isNotEmpty && canDelete)
        PsgIconButton('psg:trash',
            iconSize: 17, tooltip: s.t('delete'), onPressed: () => onAction(MailAction.delete, selected)),
      if (selected.isNotEmpty)
        PsgIconButton('psg:download',
            iconSize: 17, tooltip: s.t('exportEml'), onPressed: () => onAction(MailAction.exportEml, selected)),
      if (selected.isEmpty && list.hasUnread && list.unreadCount > 0)
        PsgIconButton('psg:mail', iconSize: 19, tooltip: s.t('markAllRead'), onPressed: () async {
          final mail = list.all.where((e) => e.isUnread).toList();
          await MailActions(context, list.folder).run(MailAction.read, mail);
          list.touch();
        }),
      if (overflow.isNotEmpty)
        PopupMenuButton<MailAction>(
          tooltip: s.t('more'),
          onSelected: (a) => onAction(a, selected),
          itemBuilder: (ctx) => [
            for (final a in overflow) psgMenuItem(ctx, a, actionLabel(s, a, k), icon: actionIcon(a)),
          ],
          child: const IgnorePointer(child: PsgIconButton('psg:more', iconSize: 17, onPressed: _noop)),
        ),
    ];

    String? count;
    if (list.isSearch) {
      count = s.t('searchResultCount', {'count': items.length});
    } else if (selected.isNotEmpty) {
      count = '${selected.length} / ${items.length}';
    } else if ((list.total ?? 0) > 0) {
      count = s.t('emailCount', {'total': list.total});
    }

    return SizedBox(
      height: phone ? 58 : 48,
      child: Padding(
        padding: phone ? const EdgeInsets.fromLTRB(16, 8, 12, 8) : const EdgeInsets.fromLTRB(12, 0, 10, 0),
        child: Row(children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [for (final c in controls) Padding(padding: const EdgeInsets.only(right: 2), child: c)]),
            ),
          ),
          if (count != null && !phone)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(count,
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: t.textSecondary,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ),
        ]),
      ),
    );
  }

  static void _noop() {}
}

/// Lets the shell provide the sort toggle (the list is rebuilt per order).
class SortToggle extends InheritedWidget {
  final VoidCallback onToggle;
  const SortToggle({super.key, required this.onToggle, required super.child});

  static VoidCallback? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<SortToggle>()?.onToggle;

  @override
  bool updateShouldNotify(SortToggle old) => old.onToggle != onToggle;
}

/// Web .swipe-bg: orange "Archive" under a right swipe, grey "More" under a
/// left one.
class _SwipeBg extends StatelessWidget {
  final String label;
  final String icon;
  final bool archive;
  const _SwipeBg({required this.label, required this.icon, required this.archive});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final fg = archive ? t.onPrimary : t.text;
    return Container(
      color: archive ? t.primary : t.surfaceActive,
      alignment: archive ? Alignment.centerLeft : Alignment.centerRight,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        PsgIcon(icon, size: 18, color: fg),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg)),
      ]),
    );
  }
}

/// Grey placeholder rows while the first page loads (web skeletonBlock).
class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    Widget bar(double w, double h) => Container(
        width: w, height: h, decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(6)));
    return ListView.builder(
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 8,
      itemBuilder: (_, _) => Padding(
        padding: const EdgeInsets.fromLTRB(26, 14, 22, 14),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.md))),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [bar(90, 12), const Spacer(), bar(36, 10)]),
              const SizedBox(height: 10),
              bar(180, 11),
              const SizedBox(height: 9),
              bar(240, 10),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Web .mrow: unread dot · avatar (doubles as the checkbox) · name/time,
/// subject with code tag and label dots, mailbox chip + preview. Hovering
/// swaps the time for quick actions.
class MailRow extends StatefulWidget {
  final Email email;
  final FolderKind folder;
  final bool open;
  final bool checked;
  final bool selecting;
  final String? mailbox;
  final bool canDelete;
  final VoidCallback onTap;
  final VoidCallback? onToggle;
  final void Function(Offset at)? onContextMenu;
  final VoidCallback? onCopyCode;
  final ValueChanged<MailAction>? onQuick;

  const MailRow({
    super.key,
    required this.email,
    required this.onTap,
    this.folder = FolderKind.inbox,
    this.open = false,
    this.checked = false,
    this.selecting = false,
    this.mailbox,
    this.canDelete = true,
    this.onToggle,
    this.onContextMenu,
    this.onCopyCode,
    this.onQuick,
  });

  @override
  State<MailRow> createState() => _MailRowState();
}

class _MailRowState extends State<MailRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final e = widget.email;
    final k = widget.folder;
    final showUnread = k != FolderKind.sent && k != FolderKind.trash;
    final unread = e.isUnread && showUnread && !e.isSent;
    final showStar = k != FolderKind.trash && k != FolderKind.spam;
    final status = e.isSent ? sentStatus(context, e.status) : null;
    final who = e.counterpart;
    final bg = widget.checked
        ? t.primaryMuted
        : (widget.open || _hover)
            ? t.surfaceMuted
            : Colors.transparent;
    final showCheck = widget.checked || widget.selecting || _hover;

    final quick = <(MailAction, String, String)>[
      if (k == FolderKind.archive) (MailAction.unarchive, 'solar:inbox-out-linear', s.t('unarchive')),
      if (const {FolderKind.inbox, FolderKind.allInbox, FolderKind.starred, FolderKind.label}.contains(k) && !e.isSent)
        (MailAction.archive, 'psg:archive', s.t('archive')),
      if (k == FolderKind.trash) (MailAction.restore, 'solar:inbox-out-linear', s.t('restore')),
      if (showStar)
        (e.isStar ? MailAction.unstar : MailAction.star, e.isStar ? 'fluent-color:star-16' : 'psg:star', s.t('star')),
      if (widget.canDelete) (MailAction.delete, 'psg:trash', s.t('delete')),
    ];

    final nameStyle = TextStyle(fontSize: 14, fontWeight: unread ? FontWeight.w700 : FontWeight.w500, color: t.text, height: 1.4);
    final timeStyle = TextStyle(
        fontSize: 12,
        color: unread ? t.primary : t.textSecondary,
        fontWeight: unread ? FontWeight.w600 : FontWeight.w400,
        fontFeatures: const [FontFeature.tabularFigures()]);

    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        onLongPress: widget.onToggle,
        onSecondaryTapDown: widget.onContextMenu == null ? null : (d) => widget.onContextMenu!(d.globalPosition),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          height: 80,
          margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
          padding: const EdgeInsets.fromLTRB(4, 12, 12, 6),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(PsgRadius.lg)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Unread dot column.
            SizedBox(
              width: 8,
              child: Padding(
                padding: const EdgeInsets.only(top: 18),
                child: Center(
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(color: unread ? t.primary : Colors.transparent, shape: BoxShape.circle),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            GestureDetector(
              onTap: showCheck ? widget.onToggle : null,
              child: Stack(children: [
                PsgAvatar(name: who, email: e.isSent ? e.toEmail : e.sendEmail),
                if (showCheck)
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(PsgRadius.md)),
                    alignment: Alignment.center,
                    child: PsgCheckbox(value: widget.checked, onChanged: (_) => widget.onToggle?.call()),
                  ),
              ]),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                  height: 20,
                  child: Row(children: [
                    if (status != null) ...[
                      Tooltip(message: status.$3, child: PsgIcon(status.$1, size: 14, color: status.$2)),
                      const SizedBox(width: 6),
                    ],
                    Expanded(child: Text(who, maxLines: 1, overflow: TextOverflow.ellipsis, style: nameStyle)),
                    if (e.isStar && showStar) ...[
                      const SizedBox(width: 6),
                      const PsgIcon('fluent-color:star-16', size: 13),
                    ],
                    const SizedBox(width: 6),
                    if (_hover && quick.isNotEmpty && widget.onQuick != null)
                      Transform.translate(
                        offset: const Offset(8, 0),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          for (final q in quick)
                            PsgIconButton(q.$2,
                                size: 28,
                                iconSize: 15,
                                tooltip: q.$3,
                                onPressed: () => widget.onQuick!(q.$1)),
                        ]),
                      )
                    else
                      Text(formatListDate(context, e.created), style: timeStyle),
                  ]),
                ),
                const SizedBox(height: 2),
                SizedBox(
                  height: 20,
                  child: Row(children: [
                    if (e.code.isNotEmpty) ...[
                      GestureDetector(
                        onTap: widget.onCopyCode,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(
                              border: Border.all(color: t.border), borderRadius: BorderRadius.circular(4)),
                          child: Text('[${s.t('codeLabel')}${e.code}]', style: TextStyle(fontSize: 11, color: t.text)),
                        ),
                      ),
                      const SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(e.subject.isEmpty ? s.t('noSubject') : e.subject,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 14,
                              height: 1.4,
                              color: unread ? t.text : t.textSecondary,
                              fontWeight: unread ? FontWeight.w600 : FontWeight.w400)),
                    ),
                    if (e.labels.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      for (final l in e.labels)
                        Padding(
                          padding: const EdgeInsets.only(right: 3),
                          child: Tooltip(
                            message: l.name,
                            child: Container(
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                  color: labelColor(l.color) ?? t.textMuted, borderRadius: BorderRadius.circular(2)),
                            ),
                          ),
                        ),
                    ],
                    if (e.attachments.any((a) => !a.isInline)) ...[
                      const SizedBox(width: 4),
                      PsgIcon('psg:paperclip', size: 13, color: t.textMuted),
                    ],
                  ]),
                ),
                const SizedBox(height: 2),
                SizedBox(
                  height: 18,
                  child: Row(children: [
                    if (widget.mailbox != null) ...[
                      Builder(builder: (context) {
                        final chip = mailboxChip(context, widget.mailbox!);
                        return Container(
                          constraints: const BoxConstraints(maxWidth: 110),
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          decoration: BoxDecoration(color: chip.bg, borderRadius: BorderRadius.circular(4)),
                          child: Text('${widget.mailbox!.split('@').first}@',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, height: 16 / 11, color: chip.fg)),
                        );
                      }),
                      const SizedBox(width: 6),
                    ],
                    Expanded(
                      child: Text(e.preview,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13, color: t.textMuted, height: 1.35)),
                    ),
                  ]),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// `#RRGGBB` label colour.
Color? labelColor(String hex) {
  final h = hex.replaceFirst('#', '');
  final v = int.tryParse(h.length == 6 ? 'FF$h' : h, radix: 16);
  return v == null ? null : Color(v);
}
