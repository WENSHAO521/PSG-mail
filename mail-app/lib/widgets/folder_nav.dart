import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../navigation.dart';
import '../state/session.dart';
import 'reader_view.dart';

IconData folderIcon(FolderKind k) => switch (k) {
      FolderKind.inbox => Icons.inbox_outlined,
      FolderKind.allInbox => Icons.all_inbox_outlined,
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

/// Pages that have a native screen. Others stay out of the menu until ported.
Set<PageKind> nativePages = {PageKind.drafts, PageKind.scheduled};

/// Account switcher, mail folders, labels, workspace and admin pages — the
/// web app's folder column + top bar + avatar menu in one list. Used as the
/// phone drawer and as the desktop side column.
class FolderNav extends StatelessWidget {
  final Destination selected;
  final ValueChanged<Destination> onSelect;
  final bool inDrawer;

  const FolderNav({super.key, required this.selected, required this.onSelect, this.inDrawer = false});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final session = context.watch<Session>();
    final user = session.user;
    final canSend = user?.can('email:send') ?? true;
    final scheme = Theme.of(context).colorScheme;

    bool show(PageKind p) => nativePages.contains(p) && pageInfo[p]!.allowed(user);

    Widget item(Destination d, Widget leading, String title, {Widget? trailing}) {
      final active = d == selected;
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
          trailing: trailing,
          onTap: () {
            onSelect(d);
            if (inDrawer) Navigator.of(context).pop();
          },
        ),
      );
    }

    Widget folder(FolderKind k) {
      final d = Destination.folder(Folder(k));
      return item(d, Icon(folderIcon(k)), destinationTitle(s, d));
    }

    Widget page(PageKind p) => item(Destination.page(p), Icon(pageInfo[p]!.icon), s.t(pageInfo[p]!.labelKey));

    Widget header(String text) => Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 6),
          child: Text(text, style: Theme.of(context).textTheme.labelMedium),
        );

    final workspace = [PageKind.contactGroups, PageKind.templates, PageKind.rules].where(show).toList();
    final admin = [PageKind.analytics, PageKind.accessManagement, PageKind.allMail, PageKind.systemSettings]
        .where(show)
        .toList();
    final more = [PageKind.settings, PageKind.download, PageKind.vpn, PageKind.about].where(show).toList();

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          _AccountPicker(inDrawer: inDrawer),
          const Divider(),
          folder(FolderKind.inbox),
          if (session.accounts.length > 1) folder(FolderKind.allInbox),
          folder(FolderKind.starred),
          if (canSend) folder(FolderKind.sent),
          if (show(PageKind.drafts)) page(PageKind.drafts),
          if (show(PageKind.scheduled)) page(PageKind.scheduled),
          folder(FolderKind.archive),
          folder(FolderKind.spam),
          folder(FolderKind.trash),
          if (session.labels.isNotEmpty) ...[
            header(s.t('labels')),
            for (final l in session.labels)
              item(
                Destination.folder(Folder(FolderKind.label, labelId: l.labelId, labelName: l.name)),
                Icon(Icons.label, color: labelColor(l.color)),
                l.name,
                trailing: l.emailCount > 0 ? Text('${l.emailCount}') : null,
              ),
          ],
          if (workspace.isNotEmpty) ...[header(s.t('workspace')), for (final p in workspace) page(p)],
          if (admin.isNotEmpty) ...[header(s.t('manage')), for (final p in admin) page(p)],
          const Divider(),
          for (final p in more) page(p),
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
              title: Text(s.t('logOut')),
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
      tooltip: S.of(context).t('mailboxes'),
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
