import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import 'psg.dart';

/// Web ElMessageBox look: title, message, optional input, Cancel and an
/// orange (or red) confirm on the right.
class _PsgBox extends StatelessWidget {
  final String? title;
  final Widget body;
  final String confirmText;
  final bool danger;
  final VoidCallback onConfirm;
  const _PsgBox({this.title, required this.body, required this.confirmText, required this.danger, required this.onConfirm});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (title != null) ...[
              Row(children: [
                Expanded(child: Text(title!, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: t.text))),
                PsgIconButton('psg:close', iconSize: 16, onPressed: () => Navigator.pop(context)),
              ]),
              const SizedBox(height: 10),
            ],
            DefaultTextStyle.merge(style: TextStyle(fontSize: 14, color: t.textSecondary, height: 1.5), child: body),
            const SizedBox(height: 20),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              PsgButton(s.t('cancel'), kind: PsgButtonKind.outline, height: 36, radius: PsgRadius.sm,
                  onPressed: () => Navigator.pop(context)),
              const SizedBox(width: 10),
              PsgButton(confirmText,
                  kind: danger ? PsgButtonKind.danger : PsgButtonKind.primary,
                  height: 36,
                  radius: PsgRadius.sm,
                  onPressed: onConfirm),
            ]),
          ]),
        ),
      ),
    );
  }
}

Future<bool> psgConfirm(BuildContext context, String message, {String? title, bool danger = true, String? confirmText}) async {
  final s = S.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => _PsgBox(
      title: title ?? s.t('warning'),
      body: Text(message),
      confirmText: confirmText ?? s.t('confirm'),
      danger: danger,
      onConfirm: () => Navigator.pop(c, true),
    ),
  );
  return ok == true;
}

/// ElMessageBox.prompt: returns the trimmed text, or null when cancelled.
Future<String?> psgPrompt(BuildContext context,
    {required String title, String? message, String initial = '', String? hint, String? Function(String)? validator}) {
  final s = S.of(context);
  final ctl = TextEditingController(text: initial);
  String? error;
  return showDialog<String>(
    context: context,
    builder: (c) => StatefulBuilder(builder: (c, setState) {
      void submit() {
        final v = ctl.text.trim();
        final e = validator?.call(v);
        if (e != null) return setState(() => error = e);
        Navigator.pop(c, v);
      }

      return _PsgBox(
        title: title,
        confirmText: s.t('confirm'),
        danger: false,
        onConfirm: submit,
        body: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (message != null) ...[Text(message), const SizedBox(height: 10)],
          TextField(
            controller: ctl,
            autofocus: true,
            onSubmitted: (_) => submit(),
            decoration: InputDecoration(hintText: hint, errorText: error),
          ),
        ]),
      );
    }),
  );
}

/// A message box with any body and buttons; returns the chosen value.
Future<T?> psgBox<T>(BuildContext context,
    {String? title, required Widget body, required List<(String, T, PsgButtonKind)> actions, double maxWidth = 420}) {
  return showDialog<T>(
    context: context,
    builder: (c) {
      final t = c.psg;
      return Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (title != null) ...[
                Row(children: [
                  Expanded(child: Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: t.text))),
                  PsgIconButton('psg:close', iconSize: 16, onPressed: () => Navigator.pop(c)),
                ]),
                const SizedBox(height: 10),
              ],
              Flexible(
                child: DefaultTextStyle.merge(style: TextStyle(fontSize: 14, color: t.textSecondary, height: 1.5), child: body),
              ),
              const SizedBox(height: 20),
              Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 8, children: [
                for (final (label, value, kind) in actions)
                  PsgButton(label, kind: kind, height: 36, radius: PsgRadius.sm, onPressed: () => Navigator.pop(c, value)),
              ]),
            ]),
          ),
        ),
      );
    },
  );
}
