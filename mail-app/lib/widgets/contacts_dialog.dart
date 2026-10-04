import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/session.dart';

/// Pick recipients (web Compose → Contacts): recent recipients, the
/// deployment's directory, or a whole contact group. Returns the addresses
/// to add, or null when cancelled.
Future<List<String>?> showContactsDialog(BuildContext context, {List<String> current = const []}) {
  return showDialog<List<String>>(context: context, builder: (_) => _ContactsDialog(current: current));
}

class _ContactsDialog extends StatefulWidget {
  final List<String> current;
  const _ContactsDialog({required this.current});

  @override
  State<_ContactsDialog> createState() => _ContactsDialogState();
}

class _ContactsDialogState extends State<_ContactsDialog> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  late Set<String> _picked = widget.current.toSet();
  List<String> _recent = const [];
  List<Contact>? _directory;
  List<ContactGroup>? _groups;
  String _filter = '';

  @override
  void initState() {
    super.initState();
    _recent = context.read<Session>().recentRecipients;
    _tabs.addListener(_loadTab);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _loadTab() async {
    final api = context.read<Session>().api;
    if (_tabs.index == 1 && _directory == null) {
      try {
        final d = await api.directory();
        if (mounted) setState(() => _directory = d);
      } catch (_) {
        if (mounted) setState(() => _directory = const []);
      }
    }
    if (_tabs.index == 2 && _groups == null) {
      try {
        final g = await api.contactGroups();
        if (mounted) setState(() => _groups = g);
      } catch (_) {
        if (mounted) setState(() => _groups = const []);
      }
    }
  }

  void _toggle(String email) => setState(() => _picked.contains(email) ? _picked.remove(email) : _picked.add(email));

  Future<void> _clearRecent() async {
    final s = S.of(context);
    final session = context.read<Session>();
    final chosen = _recent.where(_picked.contains).toList();
    if (chosen.isEmpty) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(s.t('confirmDeletionOfContacts')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(s.t('cancel'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(s.t('confirm'))),
        ],
      ),
    );
    if (ok != true) return;
    await session.forgetRecipients(chosen);
    setState(() {
      _recent = session.recentRecipients;
      _picked = _picked.difference(chosen.toSet());
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final dir = (_directory ?? const <Contact>[])
        .where((c) => _filter.isEmpty || c.email.toLowerCase().contains(_filter) || c.name.toLowerCase().contains(_filter))
        .toList();
    return AlertDialog(
      titlePadding: EdgeInsets.zero,
      contentPadding: EdgeInsets.zero,
      title: TabBar(controller: _tabs, tabs: [
        Tab(text: s.t('recentTab')),
        Tab(text: s.t('internalDirectory')),
        Tab(text: s.t('contactGroups')),
      ]),
      content: SizedBox(
        width: 460,
        height: 420,
        child: TabBarView(controller: _tabs, children: [
          // Recent
          _recent.isEmpty
              ? Center(child: Text(s.t('noData')))
              : ListView(children: [
                  for (final e in _recent)
                    CheckboxListTile(dense: true, value: _picked.contains(e), title: Text(e), onChanged: (_) => _toggle(e)),
                ]),
          // Directory
          Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: s.t('searchPlaceholder'), isDense: true),
                onChanged: (v) => setState(() => _filter = v.trim().toLowerCase()),
              ),
            ),
            Expanded(
              child: _directory == null
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(children: [
                      for (final c in dir)
                        CheckboxListTile(
                          dense: true,
                          value: _picked.contains(c.email),
                          title: Text(c.name.isEmpty ? c.email : c.name),
                          subtitle: c.name.isEmpty ? null : Text(c.email),
                          onChanged: (_) => _toggle(c.email),
                        ),
                    ]),
            ),
          ]),
          // Groups
          _groups == null
              ? const Center(child: CircularProgressIndicator())
              : _groups!.isEmpty
                  ? Center(child: Text(s.t('noGroups')))
                  : ListView(children: [
                      for (final g in _groups!)
                        ListTile(
                          leading: const Icon(Icons.group_outlined),
                          title: Text(g.name),
                          subtitle: Text(g.contacts.map((c) => c.email).join(', '), maxLines: 2, overflow: TextOverflow.ellipsis),
                          trailing: FilledButton.tonal(
                            onPressed: () => Navigator.pop(context, {..._picked, ...g.contacts.map((c) => c.email)}.toList()),
                            child: Text(s.t('insertGroup')),
                          ),
                        ),
                    ]),
        ]),
      ),
      actions: [
        if (_tabs.index == 0 && _recent.isNotEmpty) TextButton(onPressed: _clearRecent, child: Text(s.t('clear'))),
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s.t('cancel'))),
        FilledButton(onPressed: () => Navigator.pop(context, _picked.toList()), child: Text(s.t('selectContacts'))),
      ],
    );
  }
}
