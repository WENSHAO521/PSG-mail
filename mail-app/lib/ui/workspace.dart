import 'package:flutter/material.dart';

import 'psg.dart';

/// The web's workspace page frame (styles/workspace.css), shared by the
/// templates, groups, rules, scheduled and settings pages.
bool isPhoneWidth(BuildContext context) => MediaQuery.sizeOf(context).width <= 767;

/// `.workspace-page`: a centred column up to 1120px wide.
class WorkspacePage extends StatelessWidget {
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  const WorkspacePage({super.key, required this.children, this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final phone = isPhoneWidth(context);
    final narrow = MediaQuery.sizeOf(context).width < 360;
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: phone ? EdgeInsets.fromLTRB(narrow ? 10 : 12, 18, narrow ? 10 : 12, 32) : const EdgeInsets.fromLTRB(32, 28, 32, 64),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1056),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
          ),
        ),
      ],
    );
    return onRefresh == null ? list : RefreshIndicator(color: context.psg.primary, onRefresh: onRefresh!, child: list);
  }
}

/// `.workspace-hero`: page title, description and an optional main action.
class WorkspaceHero extends StatelessWidget {
  final String title;
  final String? description;
  final Widget? action;
  const WorkspaceHero({super.key, required this.title, this.description, this.action});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final phone = isPhoneWidth(context);
    final text = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title,
          style: TextStyle(fontSize: phone ? 24 : 28, fontWeight: FontWeight.w700, letterSpacing: -.56, height: 1.15, color: t.text)),
      if (description != null) ...[
        const SizedBox(height: 6),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Text(description!, style: TextStyle(fontSize: phone ? 13 : 14, height: phone ? 1.5 : 1.6, color: t.textSecondary)),
        ),
      ],
    ]);
    return Padding(
      padding: EdgeInsets.only(bottom: phone ? 16 : 22),
      child: phone
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [text, if (action != null) ...[const SizedBox(height: 12), action!]])
          : Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(child: text),
              if (action != null) ...[const SizedBox(width: 28), action!],
            ]),
    );
  }
}

/// `.workspace-note`: grey rounded strip with an accent info icon.
class WorkspaceNote extends StatelessWidget {
  final String text;
  final String icon;
  const WorkspaceNote(this.text, {super.key, this.icon = 'psg:info-circle'});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.lg)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 1), child: PsgIcon(icon, size: 17, color: t.primary)),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: TextStyle(fontSize: 13, height: 1.55, color: t.textSecondary))),
      ]),
    );
  }
}

/// One `.workspace-stat-card`.
class WorkspaceStat {
  final String label;
  final String value;
  final bool accent;
  /// Wide cards show [value] as a sentence rather than a big number.
  final bool wide;
  const WorkspaceStat(this.label, this.value, {this.accent = false, this.wide = false});
}

/// `.workspace-stats`: two number cards and a wide one.
class WorkspaceStats extends StatelessWidget {
  final List<WorkspaceStat> stats;
  const WorkspaceStats(this.stats, {super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final phone = isPhoneWidth(context);
    Widget card(WorkspaceStat s) => Container(
          constraints: BoxConstraints(minHeight: phone ? 76 : 92),
          padding: phone ? const EdgeInsets.all(12) : const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.lg)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: t.textMuted)),
            const SizedBox(height: 10),
            s.wide
                ? Text(s.value, style: TextStyle(fontSize: 13, height: 1.45, color: t.textSecondary))
                : Text(s.value,
                    style: TextStyle(
                      fontSize: phone ? 22 : 30,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -.6,
                      height: 1,
                      color: s.accent ? t.primary : t.text,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    )),
          ]),
        );
    final narrow = stats.where((s) => !s.wide).toList();
    final wide = stats.where((s) => s.wide).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: phone
          ? Column(children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (var i = 0; i < narrow.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: card(narrow[i])),
                ],
              ]),
              for (final w in wide) ...[const SizedBox(height: 8), SizedBox(width: double.infinity, child: card(w))],
            ])
          : IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (var i = 0; i < stats.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  Expanded(flex: stats[i].wide ? 170 : 65, child: card(stats[i])),
                ],
              ]),
            ),
    );
  }
}

/// `.workspace-surface-header`: section title, description, actions.
class WorkspaceSection extends StatelessWidget {
  final String title;
  final String? description;
  final List<Widget> actions;
  const WorkspaceSection({super.key, required this.title, this.description, this.actions = const []});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final phone = isPhoneWidth(context);
    final text = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -.18, color: t.text)),
      if (description != null) ...[
        const SizedBox(height: 2),
        Text(description!, style: TextStyle(fontSize: 13, height: 1.5, color: t.textMuted)),
      ],
    ]);
    return Padding(
      padding: phone ? const EdgeInsets.only(top: 4, bottom: 12) : const EdgeInsets.only(top: 8, bottom: 14),
      child: phone
          ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              text,
              if (actions.isNotEmpty) ...[const SizedBox(height: 12), Row(children: _spaced(actions))],
            ])
          : Row(children: [Expanded(child: text), const SizedBox(width: 16), ..._spaced(actions)]),
    );
  }

  static List<Widget> _spaced(List<Widget> w) => [
        for (var i = 0; i < w.length; i++) ...[if (i > 0) const SizedBox(width: 8), w[i]],
      ];
}

/// `.workspace-icon-button`: 40px grey square.
class WorkspaceIconButton extends StatelessWidget {
  final String icon;
  final String tooltip;
  final VoidCallback? onPressed;
  const WorkspaceIconButton(this.icon, {super.key, required this.tooltip, this.onPressed});

  @override
  Widget build(BuildContext context) =>
      PsgIconButton(icon, style: PsgIconButtonStyle.muted, size: 40, iconSize: 16, tooltip: tooltip, color: context.psg.textSecondary, onPressed: onPressed);
}

/// `.workspace-empty`: grey panel, white icon tile, title, text, action.
class WorkspaceEmpty extends StatelessWidget {
  final String icon;
  final String title;
  final String? description;
  final Widget? action;
  const WorkspaceEmpty({super.key, required this.icon, required this.title, this.description, this.action});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final phone = isPhoneWidth(context);
    return Container(
      padding: phone ? const EdgeInsets.fromLTRB(18, 42, 18, 48) : const EdgeInsets.fromLTRB(24, 56, 24, 60),
      decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.lg)),
      child: Column(children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(PsgRadius.lg)),
          alignment: Alignment.center,
          child: PsgIcon(icon, size: 26, color: t.primary),
        ),
        const SizedBox(height: 16),
        Text(title, textAlign: TextAlign.center, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
        if (description != null) ...[
          const SizedBox(height: 5),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Text(description!, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, height: 1.55, color: t.textSecondary)),
          ),
        ],
        if (action != null) ...[const SizedBox(height: 18), action!],
      ]),
    );
  }
}

/// A list row that shows its trailing actions on hover (always on touch).
class WorkspaceRow extends StatefulWidget {
  final Widget leading;
  final Widget body;
  final List<Widget> actions;
  final VoidCallback? onTap;
  final bool divider;
  const WorkspaceRow({super.key, required this.leading, required this.body, this.actions = const [], this.onTap, this.divider = true});

  @override
  State<WorkspaceRow> createState() => _WorkspaceRowState();
}

class _WorkspaceRowState extends State<WorkspaceRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final touch = Theme.of(context).platform == TargetPlatform.android || Theme.of(context).platform == TargetPlatform.iOS;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          decoration: BoxDecoration(
            color: _hover ? t.surfaceMuted : Colors.transparent,
            border: widget.divider ? Border(bottom: BorderSide(color: t.border)) : null,
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            widget.leading,
            const SizedBox(width: 12),
            Expanded(child: widget.body),
            if (widget.actions.isNotEmpty)
              AnimatedOpacity(
                duration: const Duration(milliseconds: 140),
                opacity: touch || _hover ? 1 : 0,
                child: Row(mainAxisSize: MainAxisSize.min, children: widget.actions),
              ),
          ]),
        ),
      ),
    );
  }
}

/// `.act-btn`: 28px ghost icon button; danger ones turn red on hover.
class ActButton extends StatefulWidget {
  final String icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool danger;
  const ActButton(this.icon, {super.key, required this.tooltip, this.onPressed, this.danger = false});

  @override
  State<ActButton> createState() => _ActButtonState();
}

class _ActButtonState extends State<ActButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final bg = _hover ? (widget.danger ? t.dangerMuted : t.surfaceMuted) : Colors.transparent;
    final fg = _hover ? (widget.danger ? t.danger : t.text) : t.textSecondary;
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onPressed,
          child: Container(
            width: 28,
            height: 28,
            margin: const EdgeInsets.only(left: 2),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(PsgRadius.sm)),
            alignment: Alignment.center,
            child: PsgIcon(widget.icon, size: 14, color: fg),
          ),
        ),
      ),
    );
  }
}
