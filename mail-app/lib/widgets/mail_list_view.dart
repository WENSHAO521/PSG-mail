import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/mail_list.dart';
import '../state/session.dart';
import 'folder_nav.dart';

String formatListDate(BuildContext context, DateTime? t) {
  if (t == null) return '';
  final now = DateTime.now();
  final locale = Localizations.localeOf(context).toLanguageTag();
  if (t.year == now.year && t.month == now.month && t.day == now.day) return DateFormat.Hm(locale).format(t);
  if (t.year == now.year) return DateFormat.MMMd(locale).format(t);
  return DateFormat.yMd(locale).format(t);
}

class MailListView extends StatefulWidget {
  final MailList list;
  final int? selectedId;
  final ValueChanged<Email> onOpen;

  const MailListView({super.key, required this.list, required this.onOpen, this.selectedId});

  @override
  State<MailListView> createState() => _MailListViewState();
}

class _MailListViewState extends State<MailListView> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 600) widget.list.loadMore();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _swipe(Email e, DismissDirection dir) async {
    final api = context.read<Session>().api;
    final list = widget.list;
    final archiveSide = dir == DismissDirection.startToEnd;
    list.remove([e.emailId]);
    try {
      if (list.folder.kind == FolderKind.trash) {
        await (archiveSide ? api.restore([e.emailId]) : api.deleteForever([e.emailId]));
      } else if (archiveSide) {
        await (list.folder.kind == FolderKind.archive ? api.unarchive([e.emailId]) : api.archive([e.emailId]));
      } else {
        await api.moveToTrash([e.emailId]);
      }
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$err')));
      list.refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return ListenableBuilder(
      listenable: widget.list,
      builder: (context, _) {
        final list = widget.list;
        if (list.items.isEmpty) {
          if (list.loading) return const Center(child: CircularProgressIndicator());
          return RefreshIndicator(
            onRefresh: list.refresh,
            child: ListView(children: [
              const SizedBox(height: 120),
              Icon(list.error != null ? Icons.cloud_off_outlined : folderIcon(list.folder.kind), size: 48,
                  color: Theme.of(context).colorScheme.outline),
              const SizedBox(height: 12),
              Center(child: Text(list.error != null ? '${s.loadFailed}: ${list.error}' : s.noMail)),
              if (list.error != null) Center(child: TextButton(onPressed: list.refresh, child: Text(s.retry))),
            ]),
          );
        }
        final swipeable = !list.isSearch && list.folder.kind != FolderKind.spam;
        return RefreshIndicator(
          onRefresh: list.refresh,
          child: ListView.separated(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: list.items.length + (list.hasMore ? 1 : 0),
            separatorBuilder: (_, _) => const Divider(indent: 72),
            itemBuilder: (context, i) {
              if (i == list.items.length) {
                return const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
                );
              }
              final e = list.items[i];
              final row = MailRow(email: e, selected: e.emailId == widget.selectedId, onTap: () => widget.onOpen(e));
              if (!swipeable) return row;
              final trash = list.folder.kind == FolderKind.trash;
              final archived = list.folder.kind == FolderKind.archive;
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
                onDismissed: (dir) => _swipe(e, dir),
                child: row,
              );
            },
          ),
        );
      },
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
  final bool selected;
  final VoidCallback onTap;
  const MailRow({super.key, required this.email, required this.onTap, this.selected = false});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final unread = email.isUnread;
    final weight = unread ? FontWeight.w700 : FontWeight.w400;
    final who = email.counterpart;
    return Material(
      color: selected ? theme.colorScheme.secondaryContainer.withValues(alpha: .6) : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            CircleAvatar(
              radius: 20,
              child: Text(who.isEmpty ? '?' : who.substring(0, 1).toUpperCase()),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text(who, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: weight)),
                  ),
                  const SizedBox(width: 8),
                  Text(formatListDate(context, email.created),
                      style: theme.textTheme.labelSmall?.copyWith(fontWeight: weight,
                          color: unread ? theme.colorScheme.primary : theme.colorScheme.outline)),
                ]),
                const SizedBox(height: 2),
                Text(email.subject.isEmpty ? s.noSubject : email.subject, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: weight)),
                const SizedBox(height: 2),
                Row(children: [
                  Expanded(
                    child: Text(email.preview, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
                  ),
                  if (email.attachments.any((a) => !a.isInline))
                    Icon(Icons.attach_file, size: 16, color: theme.colorScheme.outline),
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
