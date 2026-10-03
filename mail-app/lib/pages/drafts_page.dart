import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/strings.dart';
import '../state/drafts.dart';
import '../state/session.dart';
import '../widgets/mail_list_view.dart';

/// Drafts kept on this device (web: views/draft). Tap to keep writing.
class DraftsPage extends StatefulWidget {
  final void Function(Draft draft) onOpen;
  const DraftsPage({super.key, required this.onOpen});

  @override
  State<DraftsPage> createState() => _DraftsPageState();
}

class _DraftsPageState extends State<DraftsPage> {
  final Set<String> _selected = {};

  Future<void> _delete(DraftStore store, List<String> ids) async {
    final s = S.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(ids.length == 1 ? s.t('delOneEmailConfirm') : s.t('delEmailsConfirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(s.t('cancel'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(s.t('confirm'))),
        ],
      ),
    );
    if (ok != true) return;
    await store.remove(ids);
    setState(() => _selected.removeAll(ids));
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final store = context.watch<Session>().drafts;
    if (store == null) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final drafts = store.drafts;
        final theme = Theme.of(context);
        return Column(children: [
          if (_selected.isNotEmpty)
            Material(
              color: theme.colorScheme.secondaryContainer,
              child: Row(children: [
                IconButton(icon: const Icon(Icons.close), onPressed: () => setState(_selected.clear)),
                Text('${_selected.length}', style: theme.textTheme.titleMedium),
                const Spacer(),
                IconButton(
                  tooltip: s.t('delete'),
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _delete(store, _selected.toList()),
                ),
              ]),
            ),
          Expanded(
            child: drafts.isEmpty
                ? Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.drafts_outlined, size: 48, color: theme.colorScheme.outline),
                      const SizedBox(height: 12),
                      Text(s.t('noMessagesFound')),
                    ]),
                  )
                : ListView.separated(
                    itemCount: drafts.length,
                    separatorBuilder: (_, _) => const Divider(indent: 16),
                    itemBuilder: (context, i) {
                      final d = drafts[i];
                      final checked = _selected.contains(d.id);
                      void toggle() => setState(() => checked ? _selected.remove(d.id) : _selected.add(d.id));
                      return ListTile(
                        selected: checked,
                        leading: Checkbox(value: checked, onChanged: (_) => toggle()),
                        title: Text(
                          d.to.isEmpty ? '(${s.t('noRecipient')})' : d.to.join(', '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                        subtitle: Text(
                          [d.subject.isEmpty ? '(${s.t('noSubject')})' : d.subject, d.text.replaceAll('\n', ' ')]
                              .where((x) => x.trim().isNotEmpty)
                              .join(' — '),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Text(formatListDate(context, d.updatedAt), style: theme.textTheme.labelSmall),
                        onTap: _selected.isNotEmpty ? toggle : () => widget.onOpen(d),
                        onLongPress: toggle,
                      );
                    },
                  ),
          ),
        ]);
      },
    );
  }
}
