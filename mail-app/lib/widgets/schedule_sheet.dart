import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/strings.dart';

/// Web schedulePresetDate().
DateTime schedulePreset(String value, [DateTime? from]) {
  final now = from ?? DateTime.now();
  DateTime nineAm(DateTime d) => DateTime(d.year, d.month, d.day, 9);
  switch (value) {
    case 'tomorrowMorning':
      return nineAm(now.add(const Duration(days: 1)));
    case 'nextWorkday':
      var d = nineAm(now.add(const Duration(days: 1)));
      while (d.weekday == DateTime.saturday || d.weekday == DateTime.sunday) {
        d = d.add(const Duration(days: 1));
      }
      return d;
    default: // nextHour
      final next = now.add(const Duration(hours: 1));
      return DateTime(next.year, next.month, next.day, next.hour);
  }
}

/// "Send later" (web schedule panel): presets or a chosen date and time.
/// Returns the local time to send at, or null.
Future<DateTime?> showScheduleSheet(BuildContext context) {
  return showModalBottomSheet<DateTime>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => const _ScheduleSheet(),
  );
}

class _ScheduleSheet extends StatefulWidget {
  const _ScheduleSheet();

  @override
  State<_ScheduleSheet> createState() => _ScheduleSheetState();
}

class _ScheduleSheetState extends State<_ScheduleSheet> {
  DateTime _at = schedulePreset('nextHour');

  static const _presets = {
    'nextHour': 'scheduleNextHour',
    'tomorrowMorning': 'scheduleTomorrowMorning',
    'nextWorkday': 'scheduleNextWorkday',
  };

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _at,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (d != null) setState(() => _at = DateTime(d.year, d.month, d.day, _at.hour, _at.minute));
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_at));
    if (t != null) setState(() => _at = DateTime(_at.year, _at.month, _at.day, t.hour, t.minute));
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final past = !_at.isAfter(DateTime.now());
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.t('sendLater'), style: theme.textTheme.titleLarge),
          Text(s.t('schedulePanelHint'), style: theme.textTheme.bodySmall),
          const SizedBox(height: 16),
          Text(s.t('scheduleQuick'), style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final p in _presets.entries)
              ChoiceChip(
                label: Text(s.t(p.value)),
                selected: _at == schedulePreset(p.key),
                onSelected: (_) => setState(() => _at = schedulePreset(p.key)),
              ),
          ]),
          const SizedBox(height: 16),
          Text(s.t('scheduleFor'), style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          Row(children: [
            OutlinedButton.icon(
              icon: const Icon(Icons.event),
              label: Text(DateFormat.yMMMEd(locale).format(_at)),
              onPressed: _pickDate,
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              icon: const Icon(Icons.schedule),
              label: Text(DateFormat.Hm(locale).format(_at)),
              onPressed: _pickTime,
            ),
          ]),
          if (past) ...[
            const SizedBox(height: 8),
            Text(s.t('schedulePastMsg'), style: TextStyle(color: theme.colorScheme.error)),
          ],
          const SizedBox(height: 24),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: () => Navigator.pop(context), child: Text(s.t('cancel'))),
            const SizedBox(width: 8),
            FilledButton.icon(
              icon: const Icon(Icons.schedule_send),
              onPressed: past ? null : () => Navigator.pop(context, _at),
              label: Text(s.t('scheduleConfirmBtn')),
            ),
          ]),
        ]),
      ),
    );
  }
}
