import 'package:intl/intl.dart';

/// Ports of the web app's utils/day.js, so times read the same in both.

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

String _two(int v) => v.toString().padLeft(2, '0');

/// web fromNow(): list times ("几秒前", "5分钟前", "12:03", "昨天 09:10", "10月3日").
String fromNow(DateTime? d, {required bool en, DateTime? now}) {
  if (d == null) return '';
  final n = now ?? DateTime.now();
  final diff = n.difference(d);
  final hm = '${_two(d.hour)}:${_two(d.minute)}';
  if (en) {
    if (_sameDay(n, d)) {
      if (diff.inSeconds < 60) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
      if (diff.inHours < 2) return '${diff.inHours} hour${diff.inHours > 1 ? 's' : ''} ago';
      return DateFormat('hh:mm a', 'en').format(d);
    }
    return d.year == n.year ? DateFormat('MMM d', 'en').format(d) : '${d.year}/${_two(d.month)}/${_two(d.day)}';
  }
  if (_sameDay(n, d)) {
    if (diff.inSeconds < 60) return '几秒前';
    if (diff.inMinutes < 60) return '${diff.inMinutes}分钟前';
    if (diff.inHours >= 1 && diff.inHours < 2) return '1小时前';
    return hm;
  }
  if (_sameDay(n.subtract(const Duration(days: 1)), d)) return '昨天 $hm';
  if (_sameDay(n.subtract(const Duration(days: 2)), d)) return '前天 $hm';
  return d.year == n.year ? '${d.month}月${d.day}日' : '${d.year}/${d.month}/${d.day}';
}

/// dayjs zh-cn meridiem.
String _zhMeridiem(DateTime d) {
  final hm = d.hour * 100 + d.minute;
  if (hm < 600) return '凌晨';
  if (hm < 900) return '早上';
  if (hm < 1100) return '上午';
  if (hm < 1300) return '中午';
  if (hm < 1800) return '下午';
  return '晚上';
}

const _zhWeek = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/// web formatDetailDate(): the reader's date ("2026年10月3日 周六 中午12:03").
String formatDetailDate(DateTime? d, {required bool en, DateTime? now}) {
  if (d == null) return '';
  final n = now ?? DateTime.now();
  if (en) {
    return DateFormat(d.year == n.year ? 'EEE, MMM d, h:mm a' : 'EEE, MMM d, y, h:mm a', 'en').format(d);
  }
  return '${d.year}年${d.month}月${d.day}日 ${_zhWeek[d.weekday - 1]} ${_zhMeridiem(d)}${d.hour}:${_two(d.minute)}';
}
