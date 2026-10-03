import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';

/// One folder (or search) of mail for one address, paged newest first.
class MailList extends ChangeNotifier {
  MailList(this.api, {required this.folder, required this.account, this.query = ''});

  final ApiClient api;
  final Folder folder;
  final Account account;
  final String query;

  final List<Email> items = [];
  bool loading = false;
  bool hasMore = true;
  Object? error;
  bool _disposed = false;

  bool get isSearch => query.trim().isNotEmpty;

  Future<Page<Email>> _fetch(int? before) => isSearch
      ? api.search(query.trim(), account: account, before: before)
      : api.folder(folder, account: account, before: before);

  Future<void> refresh() async {
    loading = true;
    error = null;
    _notify();
    try {
      final page = await _fetch(null);
      items
        ..clear()
        ..addAll(page.items);
      hasMore = page.hasMore;
    } catch (e) {
      error = e;
    } finally {
      loading = false;
      _notify();
    }
  }

  Future<void> loadMore() async {
    if (loading || !hasMore || items.isEmpty) return;
    loading = true;
    _notify();
    try {
      final page = await _fetch(items.last.emailId);
      final seen = items.map((e) => e.emailId).toSet();
      items.addAll(page.items.where((e) => !seen.contains(e.emailId)));
      hasMore = page.hasMore;
    } catch (e) {
      error = e;
    } finally {
      loading = false;
      _notify();
    }
  }

  void remove(Iterable<int> ids) {
    final set = ids.toSet();
    items.removeWhere((e) => set.contains(e.emailId));
    _notify();
  }

  /// Re-render after an in-place change to an item (read / star).
  void touch() => _notify();

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
