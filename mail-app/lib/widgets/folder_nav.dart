import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/session.dart';
import 'reader_view.dart';

String folderTitle(S s, Folder f) => switch (f.kind) {
      FolderKind.inbox => s.inbox,
      FolderKind.starred => s.starred,
      FolderKind.sent => s.sent,
      FolderKind.archive => s.archive,
      FolderKind.spam => s.spam,
      FolderKind.trash => s.trash,
      FolderKind.label => f.labelName ?? s.labels,
    };

IconData folderIcon(FolderKind k) => switch (k) {
      FolderKind.inbox => Icons.inbox_outlined,
      FolderKind.starred => Icons.star_outline,
      FolderKind.sent => Icons.send_outlined,
      FolderKind.archive => Icons.archive_outlined,
      FolderKind.spam => Icons.report_gmailerrorred_outlined,
      FolderKind.trash => Icons.delete_outline,
      FolderKind.label => Icons.label_outline,
    };

Color? labelColor(String hex) {
  final h = hex.replaceFirst('#', '');
  final v = int.tryParse(h.length == 6 ? 'FF$h' : h, radix: 16);
  return v == null ? null : Color(v);
}

/// Account switcher + folders + labels. Used as the phone drawer and as the
/// desktop side column.
class FolderNav extends StatelessWidget {
  final Folder selected;
  final ValueChanged<Folder> onSelect;
  final bool inDrawer;

  const FolderNav({super.key, required this.selected, required this.onSelect, this.inDrawer = false});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final session = context.watch<Session>();
    final canSend = session.user?.can('email:send') ?? true;
    final folders = [
      FolderKind.inbox,
      FolderKind.starred,
      if (canSend) FolderKind.sent,
      FolderKind.archive,
      FolderKind.spam,
      FolderKind.trash,
    ];
    final scheme = Theme.of(context).colorScheme;

    Widget item(Folder f, Widget leading, String title) {
      final active = f == selected;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
        child: ListTile(
          dense: true,
          selected: active,
          selectedTileColor: scheme.secondaryContainer,
          selectedColor: scheme.onSecondaryContainer,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          leading: leading,
          title: Text(title, overflow: TextOverflow.ellipsis),
          onTap: () {
            onSelect(f);
            if (inDrawer) Navigator.of(context).pop();
          },
        ),
      );
    }

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          _AccountPicker(inDrawer: inDrawer),
          const Divider(),
          for (final k in folders) item(Folder(k), Icon(folderIcon(k)), folderTitle(s, Folder(k))),
          if (session.labels.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 6),
              child: Text(s.labels, style: Theme.of(context).textTheme.labelMedium),
            ),
            for (final l in session.labels)
              item(
                Folder(FolderKind.label, labelId: l.labelId, labelName: l.name),
                Icon(Icons.label, color: labelColor(l.color)),
                l.name,
              ),
          ],
          const Divider(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.open_in_new),
              title: Text(s.webApp, overflow: TextOverflow.ellipsis),
              onTap: () => openExternal(Session.apiBase(session.server).replaceFirst(RegExp(r'/api$'), '')),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.logout),
              title: Text(s.signOut),
              onTap: () => session.signOut(),
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountPicker extends StatelessWidget {
  final bool inDrawer;
  const _AccountPicker({required this.inDrawer});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final current = session.current;
    final user = session.user;
    final label = current?.name.isNotEmpty == true ? current!.name : (user?.name ?? '');
    return PopupMenuButton<Account>(
      tooltip: S.of(context).accounts,
      enabled: session.accounts.length > 1,
      onSelected: (a) {
        session.selectAccount(a);
        if (inDrawer) Navigator.of(context).pop();
      },
      itemBuilder: (_) => [
        for (final a in session.accounts)
          CheckedPopupMenuItem(value: a, checked: a.accountId == current?.accountId, child: Text(a.email)),
      ],
      child: ListTile(
        leading: CircleAvatar(child: Text((current?.email ?? '?').substring(0, 1).toUpperCase())),
        title: Text(label.isEmpty ? (current?.email ?? '') : label, overflow: TextOverflow.ellipsis),
        subtitle: Text(current?.email ?? '', overflow: TextOverflow.ellipsis),
        trailing: session.accounts.length > 1 ? const Icon(Icons.unfold_more) : null,
      ),
    );
  }
}
