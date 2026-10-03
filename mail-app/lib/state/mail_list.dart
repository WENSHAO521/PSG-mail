import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';

/// One folder (or search) of mail for one address, paged. Mirrors the web
/// app's email-scroll: sort order, an unread-only filter over the loaded
/// rows, and a multi-selection for batch actions.
class MailList extends ChangeNotifier {
  MailList(this.api, {required this.folder, required this.account, this.query = '', this.oldestFirst = false});

  final ApiClient api;
  final Folder folder;
  final Account account;
  final String query;
  final bool oldestFirst;

  final List<Email> _items = [];
  bool loading = false;
  bool hasMore = true;
  Object? error;
  bool unreadOnly = false;
  final Set<int> selected = {};
  bool _disposed = false;

  bool get isSearch => query.trim().isNotEmpty;

  /// Folders whose order the server can reverse (web: show-sort).
  bool get sortable => !isSearch &&
      const {FolderKind.inbox, FolderKind.allInbox, FolderKind.sent}.contains(folder.kind);

  /// Folders that show the unread filter and "mark all read" (web: show-unread).
  bool get hasUnread => isSearch ||
      const {FolderKind.inbox, FolderKind.allInbox, FolderKind.starred, FolderKind.label, FolderKind.archive}
          .contains(folder.kind);

  /// Rows on screen, after the unread filter.
  List<Email> get items => unreadOnly ? _items.where((e) => e.isUnread).toList() : List.unmodifiable(_items);

  /// Everything loaded, ignoring the filter.
  List<Email> get all => List.unmodifiable(_items);

  int get unreadCount => _items.where((e) => e.isUnread).length;

  bool get selecting => selected.isNotEmpty;

  List<Email> get selectedMail => _items.where((e) => selected.contains(e.emailId)).toList();

  Future<Page<Email>> _fetch(int? before) => isSearch
      ? api.search(query.trim(), account: account, before: before)
      : api.folder(folder, account: account, before: before, oldestFirst: oldestFirst);

  Future<void> refresh() async {
    loading = true;
    error = null;
    _notify();
    try {
      final page = await _fetch(null);
      _items
        ..clear()
        ..addAll(page.items);
      hasMore = page.hasMore;
      selected.removeWhere((id) => !_items.any((e) => e.emailId == id));
    } catch (e) {
      error = e;
    } finally {
      loading = false;
      _notify();
    }
  }

  Future<void> loadMore() async {
    if (loading || !hasMore || _items.isEmpty) return;
    loading = true;
    _notify();
    try {
      final page = await _fetch(_items.last.emailId);
      final seen = _items.map((e) => e.emailId).toSet();
      _items.addAll(page.items.where((e) => !seen.contains(e.emailId)));
      hasMore = page.hasMore;
    } catch (e) {
      error = e;
    } finally {
      loading = false;
      _notify();
    }
  }

  void setUnreadOnly(bool v) {
    unreadOnly = v;
    _notify();
  }

  void toggleSelect(int id) {
    selected.contains(id) ? selected.remove(id) : selected.add(id);
    _notify();
  }

  void selectAll() {
    selected.addAll(items.map((e) => e.emailId));
    _notify();
  }

  void clearSelection() {
    if (selected.isEmpty) return;
    selected.clear();
    _notify();
  }

  void remove(Iterable<int> ids) {
    final set = ids.toSet();
    _items.removeWhere((e) => set.contains(e.emailId));
    selected.removeAll(set);
    _notify();
    // Keep the page full after removals, like the web list.
    if (_items.length < 20 && hasMore) loadMore();
  }

  /// Re-render after an in-place change to an item (read / star / labels).
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
