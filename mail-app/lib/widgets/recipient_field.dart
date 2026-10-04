import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../ui/psg.dart';

final emailPattern = RegExp(r'^[^\s@<>,;，]+@[^\s@<>,;，]+\.[^\s@<>,;，]+$');

/// Addresses as chips with an input that commits on Enter / comma / space /
/// leaving the field, and suggestions from [suggestions] (web: el-input-tag
/// with the recent-recipient select).
class RecipientField extends StatefulWidget {
  final String label;
  final List<String> values;
  final List<String> suggestions;
  final ValueChanged<List<String>> onChanged;
  final Widget? trailing;
  final bool autofocus;
  final void Function(String invalid)? onInvalid;

  const RecipientField({
    super.key,
    required this.label,
    required this.values,
    required this.onChanged,
    this.suggestions = const [],
    this.trailing,
    this.autofocus = false,
    this.onInvalid,
  });

  @override
  State<RecipientField> createState() => RecipientFieldState();
}

class RecipientFieldState extends State<RecipientField> {
  final _text = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus) commit();
    });
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Turns typed text into chips; returns false if something was invalid.
  bool commit([String? raw]) {
    final input = raw ?? _text.text;
    final parts = input.split(RegExp(r'[,，;；\s]+')).map((e) => e.trim()).where((e) => e.isNotEmpty);
    final next = [...widget.values];
    var ok = true;
    for (final p in parts) {
      if (!emailPattern.hasMatch(p)) {
        ok = false;
        widget.onInvalid?.call(p);
        continue;
      }
      if (!next.contains(p)) next.add(p);
    }
    _text.text = ok ? '' : input;
    if (next.length != widget.values.length) widget.onChanged(next);
    return ok;
  }

  void _remove(String e) => widget.onChanged([...widget.values]..remove(e));

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      SizedBox(
        width: 60,
        child: Text(widget.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: t.textMuted)),
      ),
      Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            // Web el-tag type="primary": light accent fill, accent text.
            for (final e in widget.values)
              Container(
                height: 24,
                padding: const EdgeInsets.only(left: 9, right: 4),
                decoration: BoxDecoration(
                  color: t.primaryMuted,
                  border: Border.all(color: t.primaryLight8),
                  borderRadius: BorderRadius.circular(PsgRadius.xs - 2),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(e, style: TextStyle(fontSize: 12, color: t.primary)),
                  const SizedBox(width: 3),
                  InkWell(
                    onTap: () => _remove(e),
                    borderRadius: BorderRadius.circular(8),
                    child: Icon(Icons.close_rounded, size: 13, color: t.primary),
                  ),
                ]),
              ),
            ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 160, maxWidth: 420),
              child: RawAutocomplete<String>(
                textEditingController: _text,
                focusNode: _focus,
                optionsBuilder: (v) {
                  final q = v.text.trim().toLowerCase();
                  if (q.isEmpty) return const [];
                  return widget.suggestions
                      .where((s) => s.toLowerCase().startsWith(q) && !widget.values.contains(s))
                      .take(10);
                },
                onSelected: (s) => commit(s),
                fieldViewBuilder: (context, controller, focus, onSubmit) => Focus(
                  canRequestFocus: false,
                  skipTraversal: true,
                  onKeyEvent: (_, k) {
                    // Backspace on an empty input removes the last chip.
                    if (k is KeyDownEvent &&
                        k.logicalKey == LogicalKeyboardKey.backspace &&
                        controller.text.isEmpty &&
                        widget.values.isNotEmpty) {
                      _remove(widget.values.last);
                      return KeyEventResult.handled;
                    }
                    return KeyEventResult.ignored;
                  },
                  child: TextField(
                    controller: controller,
                    focusNode: focus,
                    autofocus: widget.autofocus,
                    keyboardType: TextInputType.emailAddress,
                    style: TextStyle(fontSize: 14, color: t.text),
                    decoration: const InputDecoration(
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(vertical: 6),
                    ),
                    onChanged: (v) {
                      if (RegExp(r'[,，;；\s]$').hasMatch(v)) commit();
                    },
                    onSubmitted: (_) {
                      commit();
                      focus.requestFocus();
                    },
                  ),
                ),
                optionsViewBuilder: (context, onSelected, options) => Align(
                  alignment: Alignment.topLeft,
                  child: Material(
                    color: t.surface,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.sm), side: BorderSide(color: t.border)),
                    clipBehavior: Clip.antiAlias,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 240, maxWidth: 360),
                      child: ListView(
                        padding: EdgeInsets.zero,
                        shrinkWrap: true,
                        children: [
                          for (final o in options)
                            InkWell(
                              onTap: () => onSelected(o),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                                child: Text(o, style: TextStyle(fontSize: 13.5, color: t.textSecondary)),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ),
      ?widget.trailing,
    ]);
  }
}
