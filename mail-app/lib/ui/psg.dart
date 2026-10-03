import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'tokens.g.dart';
import 'web_icons.g.dart';

export 'tokens.g.dart';

/// The web's tokens on the current theme: `context.psg.primary`, etc.
class PsgTheme extends ThemeExtension<PsgTheme> {
  final PsgTokens t;
  const PsgTheme(this.t);

  @override
  PsgTheme copyWith({PsgTokens? t}) => PsgTheme(t ?? this.t);

  @override
  PsgTheme lerp(PsgTheme? other, double v) => v < .5 ? this : (other ?? this);
}

extension PsgContext on BuildContext {
  PsgTokens get psg => Theme.of(this).extension<PsgTheme>()?.t ?? PsgTokens.light;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

/// --psg-shadow-* (light values; dark mode uses deeper ones as on the web).
abstract final class PsgShadow {
  static List<BoxShadow> xs(BuildContext c) => [
        BoxShadow(color: c.isDark ? const Color(0x4D000000) : const Color(0x0D1C1C1E), blurRadius: 2, offset: const Offset(0, 1)),
      ];
  static List<BoxShadow> sm(BuildContext c) => [
        BoxShadow(color: c.isDark ? const Color(0x59000000) : const Color(0x0F1C1C1E), blurRadius: c.isDark ? 10 : 8, offset: Offset(0, c.isDark ? 3 : 2)),
      ];
  static List<BoxShadow> md(BuildContext c) => [
        BoxShadow(color: c.isDark ? const Color(0x73000000) : const Color(0x1A1C1C1E), blurRadius: c.isDark ? 30 : 28, offset: Offset(0, c.isDark ? 12 : 10)),
      ];
  static List<BoxShadow> lg(BuildContext c) => [
        BoxShadow(color: c.isDark ? const Color(0x99000000) : const Color(0x3D1C1C1E), blurRadius: 80, offset: const Offset(0, 30)),
      ];
}

/// An icon from the web app's set (`psg:inbox`, `solar:info-circle-linear`…),
/// drawn in [color] (the SVGs use currentColor).
class PsgIcon extends StatelessWidget {
  final String name;
  final double size;
  final Color? color;
  const PsgIcon(this.name, {super.key, this.size = 18, this.color});

  @override
  Widget build(BuildContext context) {
    final svg = webIcons[name];
    final c = color ?? IconTheme.of(context).color ?? context.psg.text;
    if (svg == null) return Icon(Icons.circle_outlined, size: size, color: c);
    return SvgPicture.string(svg, width: size, height: size, theme: SvgTheme(currentColor: c));
  }
}

/// The PSG Mail mark (web components/brand-logo): a document with a folded
/// corner and a small square, in the ink colour.
class BrandLogo extends StatelessWidget {
  final double height;
  final Color? color;
  const BrandLogo({super.key, this.height = 31, this.color});

  @override
  Widget build(BuildContext context) => SvgPicture.string(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 14 60 72"><path fill="currentColor" fill-rule="evenodd" d="M22 16H58L78 36V84H22ZM30 66V78H42V66Z"/></svg>',
        height: height,
        width: height * 60 / 72,
        theme: SvgTheme(currentColor: color ?? context.psg.text),
      );
}

int _hash(String s) {
  var h = 0;
  for (final c in s.codeUnits) {
    h = (31 * h + c) & 0xFFFFFFFF;
  }
  return (h >= 0x80000000 ? h - 0x100000000 : h).abs();
}

Color _mix(Color a, Color b, double t) => Color.lerp(b, a, t)!;

/// web utils/avatar.js avatarTint(): a soft tint with a deeper letter of
/// the same hue.
({Color bg, Color fg}) avatarTint(BuildContext context, String seed) {
  const hues = [0xFF2F6FB0, 0xFF7A2E6E, 0xFF9A3C0C, 0xFF25613A, 0xFF463C9E, 0xFF8F2D2D, 0xFF1D6A73, 0xFF6B5A12];
  final hue = Color(hues[_hash(seed.toLowerCase()) % hues.length]);
  final t = context.psg;
  return (bg: _mix(hue, t.surface, .16), fg: _mix(hue, t.text, .60));
}

/// web utils/avatar.js mailboxColor(): identity colour of an address.
Color mailboxColor(String email) {
  const palette = [0xFF1E7A50, 0xFFB57916, 0xFF2F6FB0, 0xFFA23E5A, 0xFF6B4FA0, 0xFF1D7A70];
  return Color(palette[_hash(email.toLowerCase()) % palette.length]);
}

/// Chip colours for a mailbox (web .mailbox-chip: hue mixed toward text).
({Color bg, Color fg}) mailboxChip(BuildContext context, String email) {
  final c = mailboxColor(email);
  return (bg: c.withValues(alpha: .14), fg: _mix(c, context.psg.text, .60));
}

String gravatarUrl(String email) =>
    'https://www.gravatar.com/avatar/${md5.convert(utf8.encode(email.trim().toLowerCase()))}?d=404&s=80';

/// Rounded-square avatar (web .mrow-avatar): Gravatar when there is one,
/// otherwise the tinted initial.
class PsgAvatar extends StatelessWidget {
  final String name;
  final String email;
  final double size;
  final double? radius;
  final String? imageUrl;
  const PsgAvatar({super.key, required this.name, required this.email, this.size = 44, this.radius, this.imageUrl});

  @override
  Widget build(BuildContext context) {
    final seed = email.isNotEmpty ? email : name;
    final tint = avatarTint(context, seed);
    final letter = ((name.isNotEmpty ? name : email).isEmpty ? '?' : (name.isNotEmpty ? name : email)[0]).toUpperCase();
    final fallback = Center(
      child: Text(letter, style: TextStyle(color: tint.fg, fontSize: size * 15 / 44, fontWeight: FontWeight.w700, height: 1)),
    );
    final url = imageUrl ?? (email.contains('@') ? gravatarUrl(email) : null);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius ?? PsgRadius.md),
      child: Container(
        width: size,
        height: size,
        color: tint.bg,
        child: url == null
            ? fallback
            : Image.network(url, fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback,
                frameBuilder: (_, child, frame, sync) => frame == null && !sync ? fallback : child),
      ),
    );
  }
}

/// White rounded card on the mist (web .mail-list-pane / .workspace-pane).
class PsgCard extends StatelessWidget {
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry? padding;
  final Color? color;
  const PsgCard({super.key, required this.child, this.radius = PsgRadius.xl, this.padding, this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: color ?? context.psg.surface, borderRadius: BorderRadius.circular(radius)),
        child: child,
      );
}

enum PsgIconButtonStyle {
  /// 44px white square (top bar, phone header).
  surface,
  /// 36px grey square (reader toolbar).
  muted,
  /// Transparent until hovered (list toolbars, row actions).
  ghost,
}

class PsgIconButton extends StatelessWidget {
  final String icon;
  final VoidCallback? onPressed;
  final String? tooltip;
  final PsgIconButtonStyle style;
  final double? size;
  final double iconSize;
  final Color? color;
  final bool active;

  const PsgIconButton(this.icon,
      {super.key, this.onPressed, this.tooltip, this.style = PsgIconButtonStyle.ghost, this.size, this.iconSize = 18, this.color, this.active = false});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final dim = size ?? switch (style) { PsgIconButtonStyle.surface => 44.0, PsgIconButtonStyle.muted => 38.0, _ => 32.0 };
    final bg = switch (style) {
      PsgIconButtonStyle.surface => t.surface,
      PsgIconButtonStyle.muted => active ? t.primaryMuted : t.surfaceMuted,
      _ => active ? t.surfaceMuted : Colors.transparent,
    };
    final fg = color ?? (active ? t.primary : (style == PsgIconButtonStyle.ghost ? t.textSecondary : t.text));
    final radius = BorderRadius.circular(style == PsgIconButtonStyle.ghost ? PsgRadius.md : (style == PsgIconButtonStyle.muted ? PsgRadius.sm : PsgRadius.md));
    final button = Material(
      color: bg,
      borderRadius: radius,
      child: InkWell(
        borderRadius: radius,
        hoverColor: style == PsgIconButtonStyle.ghost ? t.surfaceMuted : t.surfaceActive.withValues(alpha: .5),
        onTap: onPressed,
        child: SizedBox(
          width: dim,
          height: dim,
          child: Center(child: Opacity(opacity: onPressed == null ? .4 : 1, child: PsgIcon(icon, size: iconSize, color: fg))),
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

enum PsgButtonKind { primary, secondary, outline, danger, ink }

/// Text button in the web's styles: primary = orange (.tb-compose / send),
/// secondary = grey well (.quick-reply-btn), outline = white with border,
/// ink = near-black pill.
class PsgButton extends StatelessWidget {
  final String label;
  final String? icon;
  final VoidCallback? onPressed;
  final PsgButtonKind kind;
  final double height;
  final bool expand;
  final bool busy;
  final double radius;

  const PsgButton(this.label,
      {super.key,
      this.icon,
      this.onPressed,
      this.kind = PsgButtonKind.primary,
      this.height = 44,
      this.expand = false,
      this.busy = false,
      this.radius = PsgRadius.md});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final (bg, fg, border) = switch (kind) {
      PsgButtonKind.primary => (t.primary, t.onPrimary, null),
      PsgButtonKind.secondary => (t.surfaceMuted, t.text, null),
      PsgButtonKind.outline => (t.surface, t.text, t.border),
      PsgButtonKind.danger => (t.danger, Colors.white, null),
      PsgButtonKind.ink => (t.text, t.surface, null),
    };
    final hover = switch (kind) {
      PsgButtonKind.primary => t.primaryHover,
      PsgButtonKind.danger => t.dangerHover,
      PsgButtonKind.ink => t.text.withValues(alpha: .85),
      _ => t.surfaceActive,
    };
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: border == null ? BorderSide.none : BorderSide(color: border),
    );
    final content = Row(mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
      if (busy)
        SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
      else if (icon != null)
        PsgIcon(icon!, size: 17, color: fg),
      if (icon != null || busy) const SizedBox(width: 8),
      Flexible(
        child: Text(label,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: fg, fontWeight: kind == PsgButtonKind.primary ? FontWeight.w700 : FontWeight.w600, fontSize: 14)),
      ),
    ]);
    return Opacity(
      opacity: onPressed == null && !busy ? .5 : 1,
      child: Material(
        color: bg,
        shape: shape,
        child: InkWell(
          customBorder: shape,
          hoverColor: hover,
          onTap: busy ? null : onPressed,
          child: Container(
            height: height,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            alignment: Alignment.center,
            child: content,
          ),
        ),
      ),
    );
  }
}

/// Pill filter (web .filter-chip): active = filled ink, rest outlined.
class PsgPill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback? onTap;
  const PsgPill(this.label, {super.key, this.active = false, this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    return Material(
      color: active ? t.text : t.surface,
      shape: StadiumBorder(side: BorderSide(color: active ? t.text : t.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        hoverColor: t.surfaceMuted,
        onTap: onTap,
        child: Container(
          height: 28,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          child: Text(label,
              style: TextStyle(fontSize: 13, fontWeight: active ? FontWeight.w600 : FontWeight.w500, color: active ? t.surface : t.text)),
        ),
      ),
    );
  }
}

/// Search box (web .explorer-search-row / .tb-search): a grey well that
/// turns white with an orange ring when focused.
class PsgSearchField extends StatefulWidget {
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String hint;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final double height;
  final bool onSurface;
  final Widget? trailing;
  const PsgSearchField(
      {super.key,
      this.controller,
      this.focusNode,
      required this.hint,
      this.onSubmitted,
      this.onChanged,
      this.height = 40,
      this.onSurface = false,
      this.trailing});

  @override
  State<PsgSearchField> createState() => _PsgSearchFieldState();
}

class _PsgSearchFieldState extends State<PsgSearchField> {
  late final FocusNode _focus = widget.focusNode ?? FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    if (widget.focusNode == null) _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final focused = _focus.hasFocus;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      height: widget.height,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: focused || widget.onSurface ? t.surface : t.surfaceMuted,
        borderRadius: BorderRadius.circular(PsgRadius.md),
        boxShadow: focused ? [BoxShadow(color: t.primary, spreadRadius: 2)] : null,
      ),
      child: Row(children: [
        PsgIcon('psg:search', size: 15, color: t.textMuted),
        const SizedBox(width: 8),
        Expanded(
          child: TextField(
            controller: widget.controller,
            focusNode: _focus,
            onSubmitted: widget.onSubmitted,
            onChanged: widget.onChanged,
            textInputAction: TextInputAction.search,
            style: TextStyle(fontSize: 13.5, color: t.text),
            decoration: InputDecoration(
              hintText: widget.hint,
              hintStyle: TextStyle(color: t.textMuted, fontSize: 13.5),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              filled: false,
              isDense: true,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        ?widget.trailing,
      ]),
    );
  }
}

/// Section heading inside the folder column (web .folders-title).
class PsgSectionLabel extends StatelessWidget {
  final String text;
  final Widget? trailing;
  const PsgSectionLabel(this.text, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 18, 8, 6),
        child: Row(children: [
          Expanded(
            child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.psg.textMuted)),
          ),
          ?trailing,
        ]),
      );
}

/// Dropdown / context-menu entry (web .ctx-item / .tb-menu-item): a 16px
/// icon and the label; danger entries are red, checked ones get a tick.
PopupMenuItem<T> psgMenuItem<T>(BuildContext context, T value, String text,
    {String? icon, bool danger = false, bool checked = false, bool enabled = true}) {
  final t = context.psg;
  final c = danger ? t.danger : t.text;
  return PopupMenuItem<T>(
    value: value,
    enabled: enabled,
    height: 38,
    child: Row(children: [
      if (icon != null) ...[PsgIcon(icon, size: 16, color: danger ? t.danger : t.textSecondary), const SizedBox(width: 10)],
      Expanded(child: Text(text, style: TextStyle(fontSize: 14, color: c))),
      if (checked) ...[const SizedBox(width: 10), PsgIcon('psg:check-circle', size: 15, color: t.primary)],
    ]),
  );
}

/// Muted heading row inside a dropdown (web .tb-menu-heading).
PopupMenuItem<T> psgMenuHeading<T>(BuildContext context, String text) => PopupMenuItem<T>(
      enabled: false,
      height: 30,
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.psg.textMuted)),
    );

/// Element Plus style checkbox: 14px square, orange when checked.
class PsgCheckbox extends StatelessWidget {
  final bool? value;
  final ValueChanged<bool>? onChanged;
  final bool tristate;
  const PsgCheckbox({super.key, required this.value, this.onChanged, this.tristate = false});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final on = value != false;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onChanged == null ? null : () => onChanged!(value != true),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            color: on ? t.primary : t.surface,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: on ? t.primary : t.borderStrong),
          ),
          child: !on
              ? null
              : value == null
                  ? Center(child: Container(width: 8, height: 2, color: t.onPrimary))
                  : Icon(Icons.check_rounded, size: 13, color: t.onPrimary),
        ),
      ),
    );
  }
}

/// Grey-circle empty state (web .empty--compact).
class PsgEmpty extends StatelessWidget {
  final String icon;
  final String title;
  final Widget? action;
  const PsgEmpty({super.key, required this.icon, required this.title, this.action});

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.md)),
        alignment: Alignment.center,
        child: PsgIcon(icon, size: 20, color: t.textMuted),
      ),
      const SizedBox(height: 10),
      Text(title, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: t.textSecondary)),
      if (action != null) ...[const SizedBox(height: 8), action!],
    ]);
  }
}
