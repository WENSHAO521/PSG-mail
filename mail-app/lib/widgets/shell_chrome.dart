import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../l10n/strings.dart';
import '../navigation.dart';
import '../state/app_settings.dart';
import '../state/notifications.dart';
import '../state/session.dart';
import '../ui/psg.dart';
import '../util/day.dart';
import 'reader_view.dart';

/// The web's top-level sections (layout/topbar sections).
enum Section { mail, groups, templates, rules }

Section? sectionOf(Destination d) {
  if (d.isMail) return Section.mail;
  return switch (d.page) {
    PageKind.drafts || PageKind.scheduled => Section.mail,
    PageKind.contactGroups => Section.groups,
    PageKind.templates => Section.templates,
    PageKind.rules => Section.rules,
    _ => null,
  };
}

const _adminPages = [PageKind.analytics, PageKind.accessManagement, PageKind.allMail, PageKind.systemSettings];

/// Web layout/topbar: brand · section pills · global search · compose ·
/// bell · avatar menu. 72px tall, sits on the mist.
class PsgTopBar extends StatelessWidget {
  final Destination dest;
  final ValueChanged<Destination> onNavigate;
  final TextEditingController search;
  final FocusNode searchFocus;
  final ValueChanged<String> onSearch;
  final VoidCallback? onCompose;
  final ValueChanged<int> onOpenMail;
  final bool compact;

  const PsgTopBar({
    super.key,
    required this.dest,
    required this.onNavigate,
    required this.search,
    required this.searchFocus,
    required this.onSearch,
    required this.onOpenMail,
    this.onCompose,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final user = context.watch<Session>().user;
    final section = sectionOf(dest);
    final admin = _adminPages.where((p) => pageInfo[p]!.allowed(user)).toList();
    final adminActive = admin.contains(dest.page);

    Widget navItem(String label, bool active, VoidCallback onTap, {bool chevron = false}) => _NavPill(
          label: label,
          active: active,
          chevron: chevron,
          onTap: onTap,
        );

    return SizedBox(
      height: 72,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(children: [
          // Brand
          MouseRegion(
            cursor: SystemMouseCursors.click,
            child: GestureDetector(
              onTap: () => onNavigate(Destination.inbox),
              child: SizedBox(
                width: compact ? null : 196,
                child: Row(children: [
                  const BrandLogo(height: 31),
                  if (!compact) ...[
                    const SizedBox(width: 10),
                    Text('PSG Mail', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: t.text, letterSpacing: -.17)),
                  ],
                ]),
              ),
            ),
          ),
          if (compact) const SizedBox(width: 16),
          // Section nav
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(PsgRadius.md)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              navItem(s.t('mailSection'), section == Section.mail, () => onNavigate(Destination.inbox)),
              const SizedBox(width: 4),
              navItem(s.t('contactGroups'), section == Section.groups, () => onNavigate(const Destination.page(PageKind.contactGroups))),
              const SizedBox(width: 4),
              navItem(s.t('templates'), section == Section.templates, () => onNavigate(const Destination.page(PageKind.templates))),
              const SizedBox(width: 4),
              navItem(s.t('subjectKeywords'), section == Section.rules, () => onNavigate(const Destination.page(PageKind.rules))),
              if (admin.isNotEmpty) ...[
                const SizedBox(width: 4),
                Builder(
                  builder: (ctx) => navItem(s.t('manage'), adminActive, () async {
                    final box = ctx.findRenderObject() as RenderBox;
                    final overlay = Overlay.of(ctx).context.findRenderObject() as RenderBox;
                    final pos = box.localToGlobal(Offset(0, box.size.height + 6), ancestor: overlay);
                    final p = await showMenu<PageKind>(
                      context: ctx,
                      position: RelativeRect.fromLTRB(pos.dx, pos.dy, overlay.size.width - pos.dx, 0),
                      items: [
                        for (final p in admin) psgMenuItem(ctx, p, s.t(pageInfo[p]!.labelKey), icon: pageInfo[p]!.icon),
                      ],
                    );
                    if (p != null) onNavigate(Destination.page(p));
                  }, chevron: true),
                ),
              ],
            ]),
          ),
          const SizedBox(width: 16),
          // Search
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520, minWidth: 220),
                child: PsgSearchField(
                  controller: search,
                  focusNode: searchFocus,
                  hint: s.t('searchAllMailboxes'),
                  height: 44,
                  onSurface: true,
                  onSubmitted: onSearch,
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(6)),
                    child: Text('/', style: TextStyle(fontSize: 11, color: t.textMuted, fontFamily: 'monospace')),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
          if (onCompose != null) ...[
            PsgButton(s.t('compose'), icon: 'psg:compose', onPressed: onCompose, height: 44),
            const SizedBox(width: 16),
          ],
          NotificationButton(onOpenMail: onOpenMail),
          const SizedBox(width: 16),
          AccountButton(onNavigate: onNavigate),
        ]),
      ),
    );
  }
}

class _NavPill extends StatefulWidget {
  final String label;
  final bool active;
  final bool chevron;
  final VoidCallback onTap;
  const _NavPill({required this.label, required this.active, required this.onTap, this.chevron = false});

  @override
  State<_NavPill> createState() => _NavPillState();
}

class _NavPillState extends State<_NavPill> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final active = widget.active;
    final fg = active ? t.surface : (_hover ? t.text : t.textSecondary);
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? t.text : (_hover ? t.surfaceMuted : Colors.transparent),
            borderRadius: BorderRadius.circular(PsgRadius.sm),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(widget.label, style: TextStyle(fontSize: 14, fontWeight: active ? FontWeight.w600 : FontWeight.w500, color: fg)),
            if (widget.chevron) ...[const SizedBox(width: 4), PsgIcon('psg:chevron-down', size: 12, color: fg)],
          ]),
        ),
      ),
    );
  }
}

/// The avatar square and its menu (web .tb-avatar dropdown): who is signed
/// in, the mailboxes, settings and app pages, theme, language, log out.
class AccountButton extends StatelessWidget {
  final ValueChanged<Destination> onNavigate;
  final double size;
  const AccountButton({super.key, required this.onNavigate, this.size = 44});

  Future<void> _open(BuildContext context) async {
    final s = S.of(context);
    final t = context.psg;
    final session = context.read<Session>();
    final settings = context.read<AppSettings?>();
    final user = session.user;
    final box = context.findRenderObject() as RenderBox;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final pos = box.localToGlobal(Offset(box.size.width, box.size.height + 6), ancestor: overlay);
    final activeLang = (settings?.langCode.isNotEmpty ?? false) ? settings!.langCode : (s.zh ? 'zh' : 'en');
    final activeTheme = settings?.themeMode ?? ThemeMode.system;
    final pages = [PageKind.settings, PageKind.download, PageKind.vpn, PageKind.about];

    final choice = await showMenu<Object>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx - 260, pos.dy, overlay.size.width - pos.dx, 0),
      constraints: const BoxConstraints(minWidth: 240, maxWidth: 280),
      items: [
        PopupMenuItem<Object>(
          enabled: false,
          height: 52,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(user?.name.isNotEmpty == true ? user!.name : (user?.email ?? ''),
                maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.text)),
            const SizedBox(height: 2),
            Text(user?.email ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: t.textMuted)),
          ]),
        ),
        if (session.accounts.length > 1) ...[
          const PopupMenuDivider(height: 9),
          psgMenuHeading(context, s.t('mailboxes')),
          for (final a in session.accounts)
            PopupMenuItem<Object>(
              value: a,
              height: 36,
              child: Row(children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(color: mailboxColor(a.email), shape: BoxShape.circle)),
                const SizedBox(width: 10),
                Expanded(child: Text(a.email, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: t.text))),
                if (a.accountId == session.current?.accountId) PsgIcon('psg:check-circle', size: 15, color: t.primary),
              ]),
            ),
        ],
        const PopupMenuDivider(height: 9),
        for (final p in pages) psgMenuItem<Object>(context, p, s.t(pageInfo[p]!.labelKey), icon: pageInfo[p]!.icon),
        psgMenuItem<Object>(context, 'web', s.webApp, icon: 'psg:globe'),
        const PopupMenuDivider(height: 9),
        psgMenuHeading(context, s.t('theme')),
        psgMenuItem<Object>(context, ThemeMode.light, s.t('themeLight'), checked: activeTheme == ThemeMode.light),
        psgMenuItem<Object>(context, ThemeMode.dark, s.t('themeDark'), checked: activeTheme == ThemeMode.dark),
        psgMenuItem<Object>(context, ThemeMode.system, s.t('themeSystem'), checked: activeTheme == ThemeMode.system),
        psgMenuHeading(context, s.t('language')),
        psgMenuItem<Object>(context, 'lang:zh', '中文', checked: activeLang == 'zh'),
        psgMenuItem<Object>(context, 'lang:en', 'English', checked: activeLang == 'en'),
        const PopupMenuDivider(height: 9),
        psgMenuItem<Object>(context, 'logout', s.t('logOut'), icon: 'psg:logout', danger: true),
      ],
    );
    if (choice == null || !context.mounted) return;
    switch (choice) {
      case PageKind p:
        onNavigate(Destination.page(p));
      case ThemeMode m:
        settings?.setThemeMode(m);
      case 'lang:zh' || 'lang:en':
        settings?.setLang((choice as String).substring(5));
      case 'web':
        openExternal(Session.apiBase(session.server).replaceFirst(RegExp(r'/api$'), ''));
      case 'logout':
        session.signOut();
      default:
        if (choice is! String) {
          // An account row.
          final a = session.accounts.where((x) => identical(x, choice)).firstOrNull;
          if (a != null) session.selectAccount(a);
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final session = context.watch<Session>();
    final user = session.user;
    final initial = ((user?.name.isNotEmpty == true ? user!.name : (user?.email ?? '?')).characters.firstOrNull ?? '?').toUpperCase();
    final avatar = user?.avatar ?? '';
    return Tooltip(
      message: S.of(context).t('settings'),
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(PsgRadius.md),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _open(context),
          child: SizedBox(
            width: size,
            height: size,
            child: avatar.isNotEmpty
                ? Image.network(avatar, fit: BoxFit.cover, errorBuilder: (_, _, _) => _letter(t, initial))
                : _letter(t, initial),
          ),
        ),
      ),
    );
  }

  Widget _letter(PsgTokens t, String initial) =>
      Center(child: Text(initial, style: TextStyle(fontWeight: FontWeight.w700, color: t.text, fontSize: 14)));
}

/// Bell square with an unread badge; opens the web's 320px notification
/// popover (newest mail events, mark all read, clear).
class NotificationButton extends StatelessWidget {
  final ValueChanged<int> onOpenMail;
  final double size;
  const NotificationButton({super.key, required this.onOpenMail, this.size = 44});

  Future<void> _open(BuildContext context) async {
    final center = context.read<NotificationCenter>();
    center.load();
    final box = context.findRenderObject() as RenderBox;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final pos = box.localToGlobal(Offset(box.size.width, box.size.height + 8), ancestor: overlay);
    final screen = overlay.size;
    final width = screen.width < 352 ? screen.width - 32 : 320.0;
    final picked = await showGeneralDialog<int>(
      context: context,
      barrierDismissible: true,
      barrierLabel: S.of(context).t('close'),
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 120),
      pageBuilder: (ctx, _, _) => Stack(children: [
        Positioned(
          top: pos.dy,
          left: (pos.dx - width).clamp(16, screen.width - width - 16),
          width: width,
          child: ChangeNotifierProvider.value(value: center, child: const _NoticePanel()),
        ),
      ]),
      transitionBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
    );
    if (picked != null) {
      center.markRead(picked);
      onOpenMail(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final unread = context.watch<NotificationCenter>().unreadCount;
    return Stack(clipBehavior: Clip.none, children: [
      PsgIconButton('psg:bell',
          style: PsgIconButtonStyle.surface,
          size: size,
          iconSize: 20,
          color: t.text,
          tooltip: S.of(context).t('notifications'),
          onPressed: () => _open(context)),
      if (unread > 0)
        Positioned(
          right: 4,
          top: 4,
          child: IgnorePointer(
            child: Container(
              height: 16,
              constraints: const BoxConstraints(minWidth: 16),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(color: t.danger, borderRadius: BorderRadius.circular(8)),
              alignment: Alignment.center,
              child: Text(unread > 99 ? '99+' : '$unread',
                  style: TextStyle(fontSize: 10, color: t.onPrimary, fontWeight: FontWeight.w600, height: 1)),
            ),
          ),
        ),
    ]);
  }
}

class _NoticePanel extends StatelessWidget {
  const _NoticePanel();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final center = context.watch<NotificationCenter>();
    final items = center.items;
    Widget action(String label, VoidCallback onTap) => InkWell(
          onTap: onTap,
          child: Text(label, style: TextStyle(fontSize: 11.5, color: t.textSecondary)),
        );
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(PsgRadius.sm),
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      child: Container(
        constraints: const BoxConstraints(maxHeight: 420),
        decoration: BoxDecoration(
          border: Border.all(color: t.border),
          borderRadius: BorderRadius.circular(PsgRadius.sm),
          boxShadow: PsgShadow.md(context),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.border))),
            child: Row(children: [
              Expanded(
                child: Text(s.t('notifications').toUpperCase(),
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: t.text, letterSpacing: .5)),
              ),
              if (items.isNotEmpty) ...[
                if (center.unreadCount > 0) ...[action(s.t('markAllRead'), center.markAllRead), const SizedBox(width: 10)],
                action(s.t('clearAll'), center.clear),
              ],
            ]),
          ),
          if (items.isEmpty)
            SizedBox(
              height: 156,
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: t.surfaceMuted,
                    border: Border.all(color: t.border),
                    borderRadius: BorderRadius.circular(PsgRadius.xs),
                  ),
                  alignment: Alignment.center,
                  child: PsgIcon('psg:bell', size: 20, color: t.textMuted),
                ),
                const SizedBox(height: 10),
                Text(s.t('noNotifications'), style: TextStyle(fontSize: 13, color: t.textSecondary)),
              ]),
            )
          else
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                itemCount: items.length,
                separatorBuilder: (_, _) => Divider(height: 1, color: t.border),
                itemBuilder: (ctx, i) {
                  final n = items[i];
                  return InkWell(
                    onTap: () => Navigator.of(ctx).pop(n.emailId),
                    child: Container(
                      color: n.read ? null : t.primaryMuted,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(n.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: t.text)),
                        const SizedBox(height: 2),
                        Text(n.subject.isEmpty ? s.t('noSubject') : n.subject, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: t.textSecondary)),
                        const SizedBox(height: 3),
                        Text(fromNow(n.time, en: !s.zh), style: TextStyle(fontSize: 11, color: t.textMuted)),
                      ]),
                    ),
                  );
                },
              ),
            ),
        ]),
      ),
    );
  }
}

/// Web layout/mobile-header: big title that opens the folder sheet, then
/// the bell and avatar squares.
class PhoneHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onTitle;
  final ValueChanged<Destination> onNavigate;
  final ValueChanged<int> onOpenMail;
  const PhoneHeader({super.key, required this.title, this.onTitle, required this.onNavigate, required this.onOpenMail});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    return Container(
      height: 64,
      padding: const EdgeInsets.fromLTRB(18, 8, 16, 8),
      child: Row(children: [
        Flexible(
          child: GestureDetector(
            onTap: onTitle,
            behavior: HitTestBehavior.opaque,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Flexible(
                child: Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -.52, color: t.text)),
              ),
              if (onTitle != null) ...[const SizedBox(width: 6), PsgIcon('psg:chevron-down', size: 16, color: t.text)],
            ]),
          ),
        ),
        const Spacer(),
        NotificationButton(onOpenMail: onOpenMail, size: 42),
        const SizedBox(width: 8),
        AccountButton(onNavigate: onNavigate, size: 42),
      ]),
    );
  }
}

enum PhoneTab { mail, search, starred, settings }

/// Web layout/mobile-tabbar: a floating ink bar.
class PhoneTabBar extends StatelessWidget {
  final PhoneTab? current;
  final ValueChanged<PhoneTab> onTab;
  const PhoneTabBar({super.key, required this.current, required this.onTab});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final bottom = MediaQuery.paddingOf(context).bottom;
    final tabs = [
      (PhoneTab.mail, 'psg:inbox', s.t('mailSection')),
      (PhoneTab.search, 'psg:search', s.t('search')),
      (PhoneTab.starred, 'psg:star', s.t('starred')),
      (PhoneTab.settings, 'psg:user', s.t('settings')),
    ];
    return Container(
      height: 64,
      margin: EdgeInsets.fromLTRB(10, 0, 10, 10 + bottom),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(22),
        boxShadow: PsgShadow.md(context),
      ),
      child: Row(children: [
        for (final (tab, icon, label) in tabs)
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => onTab(tab),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                PsgIcon(icon, size: 22, color: tab == current ? Colors.white : const Color(0xFFA1A1A6)),
                const SizedBox(height: 3),
                Text(label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: tab == current ? FontWeight.w700 : FontWeight.w500,
                      color: tab == current ? Colors.white : const Color(0xFFA1A1A6),
                    )),
              ]),
            ),
          ),
      ]),
    );
  }
}

/// Web .m-fab: orange compose button floating above the tab bar.
class PhoneFab extends StatelessWidget {
  final VoidCallback onPressed;
  const PhoneFab({super.key, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: t.primary.withValues(alpha: .32), blurRadius: 24, offset: const Offset(0, 10))],
      ),
      child: PsgButton(S.of(context).t('compose'), icon: 'psg:compose', height: 54, radius: 18, onPressed: onPressed),
    );
  }
}

/// Web components/mailbox-chips: "All mailboxes" plus one chip per address,
/// shown above the list when there is more than one.
class MailboxChips extends StatelessWidget {
  final bool allActive;
  final VoidCallback onAll;
  final ValueChanged<Account> onAccount;
  const MailboxChips({super.key, required this.allActive, required this.onAll, required this.onAccount});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final session = context.watch<Session>();
    if (session.accounts.length < 2) return const SizedBox.shrink();
    Widget chip(String label, bool active, VoidCallback onTap, {Color? dot, String? tooltip}) {
      final w = Material(
        color: active ? t.primaryMutedStrong : t.surfaceMuted,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Container(
            height: 30,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (dot != null) ...[
                Container(width: 7, height: 7, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                const SizedBox(width: 6),
              ],
              Text(label,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                      color: active ? Color.lerp(t.text, t.primary, .8) : t.textSecondary)),
            ]),
          ),
        ),
      );
      return tooltip == null ? w : Tooltip(message: tooltip, child: w);
    }

    return SizedBox(
      height: 42,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        children: [
          chip(s.t('allInbox'), allActive, onAll),
          for (final a in session.accounts) ...[
            const SizedBox(width: 6),
            chip('${a.email.split('@').first}@',
                !allActive && a.accountId == session.current?.accountId, () => onAccount(a),
                dot: mailboxColor(a.email), tooltip: a.email),
          ],
        ],
      ),
    );
  }
}
