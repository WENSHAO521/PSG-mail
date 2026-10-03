import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/session.dart';

/// Scheduled sends (web: views/scheduled): edit, send now, cancel.
class ScheduledPage extends StatefulWidget {
  /// Opens the composer with a cancelled schedule's full payload.
  final void Function(Map<String, dynamic> payload) onEdit;
  const ScheduledPage({super.key, required this.onEdit});

  @override
  State<ScheduledPage> createState() => _ScheduledPageState();
}

class _ScheduledPageState extends State<ScheduledPage> {
  List<ScheduledMail>? _rows;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await context.read<Session>().api.scheduledList();
      if (mounted) {
        setState(() {
          _rows = rows;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _toast(String m) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(m)));

  Future<bool> _confirm(String text) async {
    final s = S.of(context);
    return await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            content: Text(text),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, false), child: Text(s.t('cancel'))),
              FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(s.t('confirm'))),
            ],
          ),
        ) ==
        true;
  }

  Future<void> _cancel(ScheduledMail r) async {
    final s = S.of(context);
    final api = context.read<Session>().api;
    if (!await _confirm(s.t('scheduledCancelConfirm'))) return;
    try {
      await api.scheduleCancel(r.id);
      _toast(s.t('scheduledCancelSuccess'));
    } catch (_) {
      _toast(s.t('scheduledCancelFail'));
    }
    _load();
  }

  Future<void> _sendNow(ScheduledMail r) async {
    final s = S.of(context);
    final api = context.read<Session>().api;
    if (!await _confirm(s.t('scheduledSendNowConfirm'))) return;
    try {
      await api.scheduleSendNow(r.id);
      _toast(s.t('scheduledSendNowSuccess'));
    } catch (e) {
      _toast('${s.t('scheduledSendNowFail')}: ${s.error(e)}');
    }
    _load();
  }

  Future<void> _edit(ScheduledMail r) async {
    final s = S.of(context);
    try {
      final payload = await context.read<Session>().api.scheduleEdit(r.id);
      widget.onEdit(payload);
    } catch (_) {
      _toast(s.t('scheduledEditFail'));
    }
    _load();
  }

  static String _statusKey(String status) =>
      {'pending': 'Pending', 'processing': 'Processing', 'sent': 'Sent', 'failed': 'Failed', 'cancelled': 'Cancelled'}[status] ??
      'Pending';

  static IconData _statusIcon(String status) => switch (status) {
        'processing' => Icons.autorenew,
        'sent' => Icons.check_circle_outline,
        'failed' => Icons.error_outline,
        'cancelled' => Icons.cancel_outlined,
        _ => Icons.schedule,
      };

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final rows = _rows;
    if (rows == null) {
      return _error == null
          ? const Center(child: CircularProgressIndicator())
          : Center(child: TextButton(onPressed: _load, child: Text('${s.loadFailed} · ${s.retry}')));
    }
    final pending = rows.where((r) => r.status == 'pending').length;
    final issues = rows.where((r) => r.status == 'failed' || r.status == 'processing').length;
    final fmt = DateFormat('yyyy-MM-dd HH:mm');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(s.t('scheduledDesc'), style: theme.textTheme.bodyMedium),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.info_outline),
              title: Text(s.t('scheduledScopeNote'), style: theme.textTheme.bodySmall),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            _Stat(label: s.t('scheduledTotalCount'), value: '${rows.length}'),
            _Stat(label: s.t('scheduledPendingCount'), value: '$pending', accent: true),
            _Stat(label: s.t('scheduledIssueCount'), value: '$issues'),
          ]),
          const SizedBox(height: 16),
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Column(children: [
                Icon(Icons.schedule, size: 48, color: theme.colorScheme.outline),
                const SizedBox(height: 12),
                Text(s.t('scheduledEmpty'), style: theme.textTheme.titleMedium),
                Text(s.t('scheduledEmptyDesc'), textAlign: TextAlign.center),
              ]),
            )
          else
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(children: [
                for (final r in rows) ...[
                  ListTile(
                    leading: Icon(_statusIcon(r.status),
                        color: r.status == 'failed' ? theme.colorScheme.error : theme.colorScheme.onSurfaceVariant),
                    title: Text(r.subject.isEmpty ? s.t('noSubject') : r.subject),
                    subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(r.receiveEmail.join(', '), maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text([
                        s.t('scheduledStatus${_statusKey(r.status)}'),
                        if (r.when != null) '${s.t('scheduledSendAt')}: ${fmt.format(r.when!)}',
                        if (r.attachmentCount > 0) '📎 ${r.attachmentCount}',
                      ].join(' · ')),
                      if (r.status == 'failed' && r.lastError.isNotEmpty)
                        Text('${s.t('scheduledLastError')}: ${r.lastError} (${r.attemptCount} ${s.t('scheduledAttemptCount')})',
                            style: TextStyle(color: theme.colorScheme.error)),
                    ]),
                    isThreeLine: true,
                    trailing: r.status == 'pending'
                        ? Row(mainAxisSize: MainAxisSize.min, children: [
                            IconButton(tooltip: s.t('scheduledEdit'), icon: const Icon(Icons.edit_outlined), onPressed: () => _edit(r)),
                            IconButton(tooltip: s.t('scheduledSendNow'), icon: const Icon(Icons.send_outlined), onPressed: () => _sendNow(r)),
                            IconButton(
                              tooltip: s.t('cancelSchedule'),
                              icon: Icon(Icons.cancel_outlined, color: theme.colorScheme.error),
                              onPressed: () => _cancel(r),
                            ),
                          ])
                        : null,
                  ),
                  if (r != rows.last) const Divider(height: 1),
                ],
              ]),
            ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final bool accent;
  const _Stat({required this.label, required this.value, this.accent = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: theme.textTheme.labelMedium),
          Text(value,
              style: theme.textTheme.headlineSmall?.copyWith(color: accent ? theme.colorScheme.primary : null)),
        ]),
      ),
    );
  }
}
