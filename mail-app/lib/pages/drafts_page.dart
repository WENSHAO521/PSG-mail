import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/strings.dart';
import '../state/drafts.dart';
import '../state/session.dart';
import '../ui/dialogs.dart';
import '../ui/psg.dart';
import '../widgets/mail_list_view.dart';

/// Drafts kept on this device (web: views/draft, an email-scroll list with
/// the recipients as the name). Tap to keep writing.
class DraftsPage extends StatefulWidget {
  final void Function(Draft draft) onOpen;
  const DraftsPage({super.key, required this.onOpen});

  @override
  State<DraftsPage> createState() => _DraftsPageState();
}

class _DraftsPageState extends State<DraftsPage> {
  final Set<String> _selected = {};
  final _search = TextEditingController();
  bool _oldestFirst = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _delete(DraftStore store, List<String> ids) async {
    final s = S.of(context);
    if (!await psgConfirm(context, ids.length == 1 ? s.t('delOneEmailConfirm') : s.t('delEmailsConfirm'))) return;
    await store.remove(ids);
    setState(() => _selected.removeAll(ids));
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final store = context.watch<Session>().drafts;
    if (store == null) return const SizedBox.shrink();
    final phone = MediaQuery.sizeOf(context).width <= 1024;
    return ListenableBuilder(
      listenable: Listenable.merge([store, _search]),
      builder: (context, _) {
        final q = _search.text.trim().toLowerCase();
        final drafts = store.drafts
            .where((d) => q.isEmpty || [d.subject, d.text, ...d.to].any((x) => x.toLowerCase().contains(q)))
            .toList()
          ..sort((a, b) => _oldestFirst ? a.updatedAt.compareTo(b.updatedAt) : b.updatedAt.compareTo(a.updatedAt));
        final allChecked = drafts.isNotEmpty && drafts.every((d) => _selected.contains(d.id));
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (!phone)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Text(s.t('drafts'), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text)),
            ),
          Padding(
            padding: EdgeInsets.fromLTRB(phone ? 14 : 20, phone ? 8 : 12, phone ? 14 : 20, 0),
            child: PsgSearchField(
              controller: _search,
              hint: s.t('searchPlaceholder'),
              trailing: _search.text.isEmpty
                  ? null
                  : PsgIconButton('psg:close-circle', size: 24, iconSize: 14, tooltip: s.t('clear'), onPressed: _search.clear),
            ),
          ),
          SizedBox(
            height: phone ? 58 : 48,
            child: Padding(
              padding: phone ? const EdgeInsets.fromLTRB(16, 8, 12, 8) : const EdgeInsets.fromLTRB(12, 0, 10, 0),
              child: Row(children: [
                PsgCheckbox(
                  value: allChecked ? true : (_selected.isEmpty ? false : null),
                  onChanged: drafts.isEmpty
                      ? null
                      : (v) => setState(() => v ? _selected.addAll(drafts.map((d) => d.id)) : _selected.clear()),
                ),
                const SizedBox(width: 4),
                PsgIconButton('psg:sort',
                    iconSize: 13,
                    tooltip: _oldestFirst ? s.t('sortOldest') : s.t('sortNewest'),
                    onPressed: () => setState(() => _oldestFirst = !_oldestFirst)),
                PsgIconButton('psg:refresh', iconSize: 17, tooltip: s.t('refresh'), onPressed: store.load),
                if (_selected.isNotEmpty)
                  PsgIconButton('psg:trash',
                      iconSize: 17, tooltip: s.t('delete'), onPressed: () => _delete(store, _selected.toList())),
                const Spacer(),
                if (!phone && drafts.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text(s.t('emailCount', {'total': drafts.length}),
                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: t.textSecondary)),
                  ),
              ]),
            ),
          ),
          Expanded(
            child: drafts.isEmpty
                ? ListView(children: [
                    const SizedBox(height: 80),
                    PsgEmpty(
                        icon: q.isEmpty ? 'psg:mail' : 'psg:search',
                        title: q.isEmpty ? s.t('noMessagesFound') : s.t('noSearchResults')),
                  ])
                : ListView.builder(
                    padding: const EdgeInsets.only(bottom: 8),
                    itemCount: drafts.length + 1,
                    itemBuilder: (context, i) {
                      if (i == drafts.length) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Center(child: Text(s.t('noMoreData'), style: TextStyle(fontSize: 12, color: t.textMuted))),
                        );
                      }
                      final d = drafts[i];
                      final checked = _selected.contains(d.id);
                      void toggle() => setState(() => checked ? _selected.remove(d.id) : _selected.add(d.id));
                      return _DraftRow(
                        draft: d,
                        checked: checked,
                        selecting: _selected.isNotEmpty,
                        onTap: _selected.isNotEmpty ? toggle : () => widget.onOpen(d),
                        onToggle: toggle,
                        onDelete: () => _delete(store, [d.id]),
                      );
                    },
                  ),
          ),
        ]);
      },
    );
  }
}

/// A draft as a web .mrow: recipients as the name, then subject and text.
class _DraftRow extends StatefulWidget {
  final Draft draft;
  final bool checked;
  final bool selecting;
  final VoidCallback onTap;
  final VoidCallback onToggle;
  final VoidCallback onDelete;
  const _DraftRow(
      {required this.draft, required this.checked, required this.selecting, required this.onTap, required this.onToggle, required this.onDelete});

  @override
  State<_DraftRow> createState() => _DraftRowState();
}

class _DraftRowState extends State<_DraftRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final d = widget.draft;
    final who = d.to.isEmpty ? '(${s.t('noRecipient')})' : d.to.join(',');
    final showCheck = widget.checked || widget.selecting || _hover;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        onLongPress: widget.onToggle,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          height: 80,
          margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
          padding: const EdgeInsets.fromLTRB(4, 12, 12, 6),
          decoration: BoxDecoration(
            color: widget.checked ? t.primaryMuted : (_hover ? t.surfaceMuted : Colors.transparent),
            borderRadius: BorderRadius.circular(PsgRadius.lg),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(width: 18),
            GestureDetector(
              onTap: showCheck ? widget.onToggle : null,
              child: Stack(children: [
                PsgAvatar(name: d.to.firstOrNull ?? '?', email: d.to.firstOrNull ?? ''),
                if (showCheck)
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(PsgRadius.md)),
                    alignment: Alignment.center,
                    child: PsgCheckbox(value: widget.checked, onChanged: (_) => widget.onToggle()),
                  ),
              ]),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                  height: 20,
                  child: Row(children: [
                    Expanded(
                      child: Text(who,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, height: 1.4, color: t.text)),
                    ),
                    const SizedBox(width: 6),
                    if (_hover)
                      PsgIconButton('psg:trash', size: 28, iconSize: 15, tooltip: s.t('delete'), onPressed: widget.onDelete)
                    else
                      Text(formatListDate(context, d.updatedAt), style: TextStyle(fontSize: 12, color: t.textSecondary)),
                  ]),
                ),
                const SizedBox(height: 2),
                SizedBox(
                  height: 20,
                  child: Row(children: [
                    Flexible(
                      child: Text(d.subject.isEmpty ? '(${s.t('noSubject')})' : d.subject,
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, height: 1.4, color: t.textSecondary)),
                    ),
                    if (d.attachments.isNotEmpty) ...[
                      const SizedBox(width: 4),
                      PsgIcon('psg:paperclip', size: 13, color: t.textMuted),
                    ],
                  ]),
                ),
                const SizedBox(height: 2),
                SizedBox(
                  height: 18,
                  child: Text(d.text.replaceAll('\n', ' '),
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, height: 1.35, color: t.textMuted)),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
