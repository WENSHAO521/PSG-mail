import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/session.dart';
import '../ui/dialogs.dart';
import '../ui/psg.dart';
import '../ui/workspace.dart';

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

  Future<bool> _confirm(String text) => psgConfirm(context, text, danger: false);

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

  static String _statusIcon(String status) => switch (status) {
        'processing' => 'psg:refresh',
        'sent' => 'psg:check-circle',
        'failed' => 'psg:warning',
        'cancelled' => 'psg:close-circle',
        _ => 'psg:clock',
      };

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final rows = _rows ?? const <ScheduledMail>[];
    final pending = rows.where((r) => r.status == 'pending').length;
    final issues = rows.where((r) => r.status == 'failed' || r.status == 'processing').length;
    final fmt = DateFormat('yyyy-MM-dd HH:mm');

    (Color, Color) tone(String status) => switch (status) {
          'sent' => (t.surfaceActive, t.text),
          'failed' => (t.dangerMuted, t.danger),
          'processing' => (t.surfaceMuted, t.primary),
          _ => (t.surfaceMuted, t.textSecondary),
        };

    return WorkspacePage(
      onRefresh: _load,
      children: [
        WorkspaceHero(title: s.t('scheduled'), description: s.t('scheduledDesc')),
        WorkspaceNote(s.t('scheduledScopeNote')),
        WorkspaceStats([
          WorkspaceStat(s.t('scheduledTotalCount'), '${rows.length}'),
          WorkspaceStat(s.t('scheduledPendingCount'), '$pending', accent: true),
          WorkspaceStat(s.t('scheduledIssueCount'), '$issues', wide: true),
        ]),
        WorkspaceSection(
          title: s.t('scheduled'),
          description: s.t('scheduledListDesc'),
          actions: [WorkspaceIconButton('psg:refresh', tooltip: s.t('refresh'), onPressed: _load)],
        ),
        if (_rows == null && _error == null)
          Padding(
            padding: const EdgeInsets.all(40),
            child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: t.textMuted))),
          )
        else if (_rows == null)
          WorkspaceEmpty(
            icon: 'psg:warning',
            title: s.loadFailed,
            description: s.error(_error!),
            action: PsgButton(s.retry, kind: PsgButtonKind.secondary, onPressed: _load),
          )
        else if (rows.isEmpty)
          WorkspaceEmpty(icon: 'psg:clock', title: s.t('scheduledEmpty'), description: s.t('scheduledEmptyDesc'))
        else
          for (final r in rows)
            WorkspaceRow(
              divider: r != rows.last,
              leading: Container(
                width: 32,
                height: 32,
                margin: const EdgeInsets.only(top: 2),
                decoration: BoxDecoration(color: tone(r.status).$1, borderRadius: BorderRadius.circular(PsgRadius.sm)),
                alignment: Alignment.center,
                child: PsgIcon(_statusIcon(r.status), size: 16, color: r.status == 'sent' ? t.text : tone(r.status).$2),
              ),
              body: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r.subject.isEmpty ? s.t('noSubject') : r.subject,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: t.text)),
                const SizedBox(height: 3),
                Text(r.receiveEmail.join(', '), style: TextStyle(fontSize: 12, color: t.textSecondary)),
                const SizedBox(height: 3),
                Wrap(spacing: 8, runSpacing: 3, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                    color: tone(r.status).$1,
                    child: Text(s.t('scheduledStatus${_statusKey(r.status)}'),
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: tone(r.status).$2)),
                  ),
                  if (r.when != null)
                    Text('${s.t('scheduledSendAt')}: ${fmt.format(r.when!)}', style: TextStyle(fontSize: 12, color: t.textSecondary)),
                  if (r.attachmentCount > 0)
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      PsgIcon('psg:paperclip', size: 12, color: t.textSecondary),
                      const SizedBox(width: 3),
                      Text('${r.attachmentCount}', style: TextStyle(fontSize: 12, color: t.textSecondary)),
                    ]),
                ]),
                if (r.status == 'failed' && r.lastError.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text('${s.t('scheduledLastError')}: ${r.lastError} (${r.attemptCount} ${s.t('scheduledAttemptCount')})',
                      style: TextStyle(fontSize: 12, color: t.danger)),
                ],
              ]),
              actions: r.status == 'pending'
                  ? [
                      ActButton('psg:edit', tooltip: s.t('scheduledEdit'), onPressed: () => _edit(r)),
                      ActButton('psg:send', tooltip: s.t('scheduledSendNow'), onPressed: () => _sendNow(r)),
                      ActButton('psg:close-circle', tooltip: s.t('cancelSchedule'), danger: true, onPressed: () => _cancel(r)),
                    ]
                  : const [],
            ),
      ],
    );
  }
}
