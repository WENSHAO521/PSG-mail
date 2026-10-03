import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../l10n/strings.dart';
import '../navigation.dart';
import '../state/session.dart';
import '../ui/dialogs.dart';
import '../ui/psg.dart';
import 'mail_list_view.dart';

/// Web folder icons (layout/folders FOLDERS).
String folderIcon(FolderKind k) => switch (k) {
  FolderKind.inbox => 'psg:inbox',
  FolderKind.allInbox => 'psg:all-mail',
  FolderKind.starred => 'psg:star',
  FolderKind.sent => 'psg:send',
  FolderKind.archive => 'psg:archive',
  FolderKind.spam => 'psg:spam',
  FolderKind.trash => 'psg:trash',
  FolderKind.label => 'psg:tag',
};

/// Pages that have a native screen. Others stay out of the menus until ported.
Set<PageKind> nativePages = {PageKind.drafts, PageKind.scheduled};

/// Web layout/folders LABEL_COLORS, cycled for new labels.
const labelPalette = ['#636366', '#9A6200', '#25613A', '#2F6FB0', '#6B4FA0', '#C62828'];

/// The web folder column: mail folders on the mist ground (the active one
/// lifted onto a white chip), then the labels with a "+" to add one. On
/// phones the same list is the slide-in sheet ([inSheet]).
class FolderNav extends StatelessWidget {
  final Destination selected;
  final ValueChanged<Destination> onSelect;
  final bool inSheet;
  final int inboxUnread;

  const FolderNav({super.key, required this.selected, required this.onSelect, this.inSheet = false, this.inboxUnread = 0});

  Future<void> _newLabel(BuildContext context) async {
    final s = S.of(context);
    final session = context.read<Session>();
    final name = await psgPrompt(
      context,
      title: s.t('newLabel'),
      message: s.t('newLabelPrompt'),
      validator: (v) => v.isEmpty ? s.t('labelNameRequired') : null,
    );
    if (name == null || !context.mounted) return;
    try {
      final created = await session.api.createLabel(name, labelPalette[session.labels.length % labelPalette.length]);
      await session.refreshLabels();
      if (context.mounted) {
        _go(context, Destination.folder(Folder(FolderKind.label, labelId: created.labelId, labelName: created.name)));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t('operationFailMsg'))));
      }
    }
  }

  void _go(BuildContext context, Destination d) {
    onSelect(d);
    if (inSheet) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final session = context.watch<Session>();
    final user = session.user;
    final canSend = user?.can('email:send') ?? true;

    Widget item(Destination d, {required Widget lead, required String title, String? count, bool quietCount = false}) =>
        _FolderItem(
          active: d == selected,
          lead: lead,
          title: title,
          count: count,
          quietCount: quietCount,
          height: inSheet ? 46 : 40,
          onTap: () => _go(context, d),
        );

    Widget folder(FolderKind k, {String? count}) {
      final d = Destination.folder(Folder(k));
      return item(
        d,
        lead: PsgIcon(folderIcon(k), size: 18, color: d == selected ? t.primary : t.textMuted),
        title: destinationTitle(s, d),
        count: count,
      );
    }

    Widget page(PageKind p) {
      final d = Destination.page(p);
      return item(
        d,
        lead: PsgIcon(pageInfo[p]!.icon, size: 18, color: d == selected ? t.primary : t.textMuted),
        title: s.t(pageInfo[p]!.labelKey),
      );
    }

    bool show(PageKind p) => nativePages.contains(p) && pageInfo[p]!.allowed(user);

    return ListView(
      padding: inSheet ? EdgeInsets.zero : const EdgeInsets.fromLTRB(0, 2, 4, 12),
      children: [
        folder(FolderKind.inbox, count: inboxUnread > 0 ? (inboxUnread > 99 ? '99+' : '$inboxUnread') : null),
        if (session.accounts.length > 1) folder(FolderKind.allInbox),
        folder(FolderKind.starred),
        if (canSend) folder(FolderKind.sent),
        if (canSend && show(PageKind.drafts)) page(PageKind.drafts),
        if (canSend && show(PageKind.scheduled)) page(PageKind.scheduled),
        folder(FolderKind.archive),
        folder(FolderKind.spam),
        folder(FolderKind.trash),
        if (canSend) ...[
          PsgSectionLabel(
            s.t('labels'),
            trailing: PsgIconButton(
              'psg:add-circle',
              size: 26,
              iconSize: 15,
              tooltip: s.t('newLabel'),
              color: t.textMuted,
              onPressed: () => _newLabel(context),
            ),
          ),
          for (final l in session.labels)
            item(
              Destination.folder(Folder(FolderKind.label, labelId: l.labelId, labelName: l.name)),
              lead: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: labelColor(l.color) ?? t.textMuted, borderRadius: BorderRadius.circular(3)),
                ),
              ),
              title: l.name,
              count: l.emailCount > 0 ? '${l.emailCount}' : null,
              quietCount: true,
            ),
        ],
      ],
    );
  }
}

/// Web .folder: 40px row, radius 14; active = white chip, bold, xs shadow.
class _FolderItem extends StatefulWidget {
  final bool active;
  final Widget lead;
  final String title;
  final String? count;
  final bool quietCount;
  final double height;
  final VoidCallback onTap;
  const _FolderItem({
    required this.active,
    required this.lead,
    required this.title,
    this.count,
    this.quietCount = false,
    required this.height,
    required this.onTap,
  });

  @override
  State<_FolderItem> createState() => _FolderItemState();
}

class _FolderItemState extends State<_FolderItem> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final active = widget.active;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            height: widget.height,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: active ? t.surface : (_hover ? t.surface.withValues(alpha: .55) : Colors.transparent),
              borderRadius: BorderRadius.circular(PsgRadius.md),
              boxShadow: active ? PsgShadow.xs(context) : null,
            ),
            child: Row(
              children: [
                widget.lead,
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    widget.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: t.text),
                  ),
                ),
                if (widget.count != null)
                  Text(
                    widget.count!,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: widget.quietCount ? FontWeight.w500 : FontWeight.w700,
                      color: widget.quietCount ? t.textMuted : t.primary,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Phone folder sheet (web .folders at ≤1024px): slides in from the left on
/// the mist, "邮件" heading and a white close square.
Future<void> showFolderSheet(
  BuildContext context, {
  required Destination selected,
  required ValueChanged<Destination> onSelect,
  int inboxUnread = 0,
}) {
  final s = S.of(context);
  return showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: s.t('close'),
    barrierColor: Colors.black.withValues(alpha: .32),
    transitionDuration: const Duration(milliseconds: 200),
    pageBuilder: (ctx, _, _) {
      final t = ctx.psg;
      final width = MediaQuery.sizeOf(ctx).width * .84;
      final pad = MediaQuery.paddingOf(ctx);
      return Align(
        alignment: Alignment.centerLeft,
        child: Container(
          width: width > 320 ? 320 : width,
          decoration: BoxDecoration(
            color: t.canvas,
            borderRadius: const BorderRadius.horizontal(right: Radius.circular(PsgRadius.xl)),
            boxShadow: PsgShadow.lg(ctx),
          ),
          child: Material(
            type: MaterialType.transparency,
            child: Padding(
              padding: EdgeInsets.fromLTRB(12, 16 + pad.top, 12, 16 + pad.bottom),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 4, 4, 14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            s.t('mailSection'),
                            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text),
                          ),
                        ),
                        PsgIconButton(
                          'psg:close',
                          style: PsgIconButtonStyle.surface,
                          size: 40,
                          color: t.text,
                          onPressed: () => Navigator.of(ctx).pop(),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: FolderNav(selected: selected, onSelect: onSelect, inSheet: true, inboxUnread: inboxUnread),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
    transitionBuilder: (_, anim, _, child) => SlideTransition(
      position: Tween(
        begin: const Offset(-1.05, 0),
        end: Offset.zero,
      ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
      child: child,
    ),
  );
}
