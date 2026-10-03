import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
    final theme = Theme.of(context);
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      SizedBox(
        width: 64,
        child: Text(widget.label, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline)),
      ),
      Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            for (final e in widget.values)
              InputChip(
                label: Text(e),
                visualDensity: VisualDensity.compact,
                onDeleted: () => _remove(e),
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
                    decoration: const InputDecoration(border: InputBorder.none, isDense: true),
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
                    elevation: 4,
                    borderRadius: BorderRadius.circular(8),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 240, maxWidth: 360),
                      child: ListView(
                        padding: EdgeInsets.zero,
                        shrinkWrap: true,
                        children: [
                          for (final o in options)
                            ListTile(dense: true, leading: const Icon(Icons.history, size: 18), title: Text(o), onTap: () => onSelected(o)),
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
