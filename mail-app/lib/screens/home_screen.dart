import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../navigation.dart';
import '../pages/drafts_page.dart';
import '../pages/scheduled_page.dart';
import '../services/notifier.dart';
import '../services/updater.dart';
import '../state/drafts.dart';
import '../state/mail_list.dart';
import '../state/mail_watcher.dart';
import '../state/session.dart';
import '../widgets/folder_nav.dart';
import '../widgets/mail_list_view.dart';
import '../widgets/reader_view.dart';
import 'compose_screen.dart';

/// The app shell. Phones: drawer + one screen at a time, a message opens as
/// its own screen. Wider windows: list and message side by side, and on
/// desktop widths the navigation stays visible as a third column.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _twoPane = 720.0;
  static const _threePane = 1080.0;

  Destination _dest = Destination.inbox;
  String _query = '';
  bool _searching = false;
  bool _oldestFirst = false;
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _shellFocus = FocusNode(debugLabel: 'shell');
  MailList? _list;
  int? _listAccountId;
  Email? _open; // the message shown beside the list (wide layouts)
  bool _wide = false;
  MailWatcher? _watcher;

  Folder get _folder => _dest.folder ?? Folder.inbox;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _startServices());
  }

  Future<void> _startServices() async {
    final session = context.read<Session>();
    Notifier.instance.onOpen = _openById;
    await Notifier.instance.init();
    await session.registerPush();
    if (mounted) _startWatcher();
    Future.delayed(const Duration(seconds: 8), _checkForUpdate);
  }

  void _startWatcher() {
    final session = context.read<Session>();
    _watcher?.stop();
    _watcher = MailWatcher(
      session.api,
      account: session.current!,
      pushEnabled: session.pushEnabled,
      onNewMail: (_) {
        final inboxLike = const {FolderKind.inbox, FolderKind.allInbox}.contains(_folder.kind);
        if (mounted && _dest.isMail && inboxLike && _query.isEmpty) _list?.refresh();
      },
    )..start();
  }

  Future<void> _checkForUpdate() async {
    final update = await Updater.check();
    if (update == null || !mounted) return;
    final s = S.of(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      duration: const Duration(seconds: 20),
      content: Text(s.updateAvailable(update.version)),
      action: SnackBarAction(label: s.download, onPressed: () => openExternal(update.url)),
    ));
  }

  /// Opens a message by id (tapped notification).
  Future<void> _openById(int emailId) async {
    try {
      final mail = await context.read<Session>().api.detail(emailId);
      if (mail != null && mounted) _openMail(mail, _wide);
    } catch (_) {}
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final account = context.read<Session>().current;
    if (account != null && account.accountId != _listAccountId) _reload();
  }

  @override
  void dispose() {
    _watcher?.stop();
    Notifier.instance.onOpen = null;
    _list?.dispose();
    _search.dispose();
    _searchFocus.dispose();
    _shellFocus.dispose();
    super.dispose();
  }

  void _reload() {
    final session = context.read<Session>();
    _list?.dispose();
    final accountChanged = _listAccountId != null && _listAccountId != session.current!.accountId;
    _listAccountId = session.current!.accountId;
    _list = MailList(session.api, folder: _folder, account: session.current!, query: _query, oldestFirst: _oldestFirst)
      ..refresh();
    _open = null;
    if (accountChanged) _startWatcher();
  }

  void _go(Destination d) {
    setState(() {
      _dest = d;
      _query = '';
      _searching = false;
      _oldestFirst = false;
      _search.clear();
      if (d.isMail) _reload();
      _open = null;
    });
  }

  void _toggleSort() => setState(() {
        _oldestFirst = !_oldestFirst;
        _reload();
      });

  // The shell's shortcut Focus already holds focus, so the field's own
  // autofocus would be ignored; ask for it explicitly once it is built.
  void _openSearch() {
    if (!_dest.isMail) _go(Destination.inbox);
    setState(() => _searching = true);
    WidgetsBinding.instance.addPostFrameCallback((_) => _searchFocus.requestFocus());
  }

  void _runSearch(String q) {
    setState(() {
      _query = q;
      _reload();
    });
    // Submitting drops focus; hand it back so window shortcuts keep working.
    _shellFocus.requestFocus();
  }

  void _closeSearch() {
    setState(() {
      _searching = false;
      _search.clear();
      if (_query.isNotEmpty) {
        _query = '';
        _reload();
      }
    });
  }

  Future<void> _compose({ReplyMode? mode, Email? original, Draft? draft, Map<String, dynamic>? prefill}) async {
    final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => ComposeScreen(mode: mode, original: original, draft: draft, prefill: prefill),
    ));
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(S.of(context).sentOk)));
      if (_dest.isMail && _folder.kind == FolderKind.sent) _list?.refresh();
    }
  }

  /// Previous / next within the current list (web: J/K and the reader's
  /// position counter).
  ReaderPosition? _position(Email e, void Function(Email) open) {
    final list = _list;
    if (list == null) return null;
    final items = list.items;
    final i = items.indexWhere((x) => x.emailId == e.emailId);
    if (i < 0) return null;
    return ReaderPosition(
      i + 1,
      items.length,
      onPrevious: i > 0 ? () => open(items[i - 1]) : null,
      onNext: i < items.length - 1 ? () => open(items[i + 1]) : null,
    );
  }

  ReaderView _reader(Email e, {VoidCallback? onClose, required void Function(Email) open}) => ReaderView(
        key: ValueKey(e.emailId),
        email: e,
        folder: _folder,
        position: _position(e, open),
        onReply: (mode, mail) => _compose(mode: mode, original: mail),
        onChanged: () => _list?.touch(),
        onRemoved: (mail) {
          // Like the web reader, move on to the next message when there is one.
          final next = _position(mail, (_) {})?.onNext != null
              ? _list!.items[_list!.items.indexWhere((x) => x.emailId == mail.emailId) + 1]
              : null;
          _list?.remove([mail.emailId]);
          if (next != null) {
            open(next);
          } else if (onClose != null) {
            onClose();
          } else {
            setState(() => _open = null);
          }
        },
        onClose: onClose,
      );

  void _openMail(Email e, bool wide) {
    if (wide && _dest.isMail) {
      setState(() => _open = e);
      return;
    }
    Navigator.of(context).push(_readerRoute(e));
  }

  Route<void> _readerRoute(Email e, {bool animate = true}) {
    Widget build(BuildContext ctx) => _reader(
          e,
          onClose: () => Navigator.of(ctx).maybePop(),
          open: (next) => Navigator.of(ctx).pushReplacement(_readerRoute(next, animate: false)),
        );
    return animate
        ? MaterialPageRoute(builder: build)
        : PageRouteBuilder(pageBuilder: (ctx, _, _) => build(ctx), transitionDuration: Duration.zero);
  }

  PreferredSizeWidget _appBar(S s, bool showMenu) {
    if (_searching) {
      return AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: _closeSearch),
        title: TextField(
          controller: _search,
          focusNode: _searchFocus,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(hintText: s.t('searchPlaceholder'), border: InputBorder.none),
          onSubmitted: _runSearch,
        ),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () => _runSearch(_search.text)),
        ],
      );
    }
    return AppBar(
      automaticallyImplyLeading: showMenu,
      title: Text(destinationTitle(s, _dest)),
      actions: [
        IconButton(tooltip: s.t('search'), icon: const Icon(Icons.search), onPressed: _openSearch),
      ],
    );
  }

  Widget _page(PageKind p) => switch (p) {
        PageKind.drafts => DraftsPage(onOpen: (d) => _compose(draft: d)),
        PageKind.scheduled => ScheduledPage(onEdit: (payload) => _compose(prefill: payload)),
        _ => Center(child: Text(S.of(context).t(pageInfo[p]!.labelKey))),
      };

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final session = context.watch<Session>();
    final canSend = session.user?.can('email:send') ?? true;
    final list = _list;
    if (list == null) return const SizedBox.shrink();

    return LayoutBuilder(builder: (context, box) {
      final wide = box.maxWidth >= _twoPane;
      _wide = wide;
      final railVisible = box.maxWidth >= _threePane;
      final selected = wide ? _open : null;
      final nav = FolderNav(selected: _dest, onSelect: _go);
      final drawer = railVisible ? null : Drawer(child: FolderNav(selected: _dest, onSelect: _go, inDrawer: true));
      final fab = canSend
          ? FloatingActionButton.extended(
              onPressed: () => _compose(),
              icon: const Icon(Icons.edit_outlined),
              label: Text(s.t('compose')),
            )
          : null;

      Widget content;
      if (!_dest.isMail) {
        // A page fills everything right of the navigation.
        final pageScaffold = Scaffold(
          appBar: AppBar(automaticallyImplyLeading: !railVisible, title: Text(destinationTitle(s, _dest))),
          drawer: drawer,
          floatingActionButton: _dest.page == PageKind.drafts ? fab : null,
          body: _page(_dest.page!),
        );
        content = railVisible
            ? Scaffold(
                body: Row(children: [
                  SizedBox(width: 260, child: Material(child: nav)),
                  const VerticalDivider(width: 1),
                  Expanded(child: ScaffoldMessenger(child: pageScaffold)),
                ]),
              )
            : pageScaffold;
      } else {
        final listPane = Scaffold(
          appBar: _appBar(s, !railVisible),
          drawer: drawer,
          floatingActionButton: fab,
          body: SortToggle(
            onToggle: _toggleSort,
            child: MailListView(
              key: ObjectKey(list),
              list: list,
              selectedId: selected?.emailId,
              onOpen: (e) => _openMail(e, wide),
              onReply: canSend ? (mode, e) => _compose(mode: mode, original: e) : null,
            ),
          ),
        );
        if (!wide) {
          content = listPane;
        } else {
          final readerPane = selected == null
              ? Scaffold(
                  body: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.mail_outline, size: 56, color: Theme.of(context).colorScheme.outlineVariant),
                      const SizedBox(height: 8),
                      Text(s.t('selectEmailHint'), style: TextStyle(color: Theme.of(context).colorScheme.outline)),
                    ]),
                  ),
                )
              : _reader(selected, onClose: () => setState(() => _open = null), open: (m) => setState(() => _open = m));
          // Each pane keeps its own messenger so a notice shows once, across
          // the window, from the outer Scaffold rather than in every pane.
          content = Scaffold(
            body: Row(children: [
              if (railVisible) ...[
                SizedBox(width: 260, child: Material(child: nav)),
                const VerticalDivider(width: 1),
              ],
              SizedBox(width: railVisible ? 420 : box.maxWidth * .45, child: ScaffoldMessenger(child: listPane)),
              const VerticalDivider(width: 1),
              Expanded(child: ScaffoldMessenger(child: readerPane)),
            ]),
          );
        }
      }

      return CallbackShortcuts(
        bindings: {
          if (canSend) const SingleActivator(LogicalKeyboardKey.keyN, control: true): () => _compose(),
          if (canSend) const SingleActivator(LogicalKeyboardKey.keyN, meta: true): () => _compose(),
          const SingleActivator(LogicalKeyboardKey.keyF, control: true): _openSearch,
          const SingleActivator(LogicalKeyboardKey.keyF, meta: true): _openSearch,
          const SingleActivator(LogicalKeyboardKey.f5): () => list.refresh(),
        },
        child: Focus(focusNode: _shellFocus, autofocus: true, child: content),
      );
    });
  }
}
