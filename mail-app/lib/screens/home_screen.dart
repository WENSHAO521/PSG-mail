import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../services/notifier.dart';
import '../services/updater.dart';
import '../state/mail_list.dart';
import '../state/mail_watcher.dart';
import '../state/session.dart';
import '../widgets/folder_nav.dart';
import '../widgets/mail_list_view.dart';
import '../widgets/reader_view.dart';
import 'compose_screen.dart';

/// The mail shell. Phones: drawer + list, a message opens as its own
/// screen. Wider windows: list and message side by side, and on desktop
/// widths the folders stay visible as a third column.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _twoPane = 720.0;
  static const _threePane = 1080.0;

  Folder _folder = Folder.inbox;
  String _query = '';
  bool _searching = false;
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _shellFocus = FocusNode(debugLabel: 'shell');
  MailList? _list;
  int? _listAccountId;
  Email? _open; // the message shown beside the list (wide layouts)
  bool _wide = false;
  MailWatcher? _watcher;

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
    _startWatcher();
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
        if (mounted && _folder.kind == FolderKind.inbox && _query.isEmpty) _list?.refresh();
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
    _list = MailList(session.api, folder: _folder, account: session.current!, query: _query)..refresh();
    _open = null;
    if (accountChanged) _startWatcher();
  }

  void _selectFolder(Folder f) {
    setState(() {
      _folder = f;
      _query = '';
      _searching = false;
      _search.clear();
      _reload();
    });
  }

  // The shell's shortcut Focus already holds focus, so the field's own
  // autofocus would be ignored; ask for it explicitly once it is built.
  void _openSearch() {
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

  Future<void> _compose({ReplyMode? mode, Email? original}) async {
    final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => ComposeScreen(mode: mode, original: original),
    ));
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(S.of(context).sentOk)));
      if (_folder.kind == FolderKind.sent) _list?.refresh();
    }
  }

  ReaderView _reader(Email e, {VoidCallback? onClose}) => ReaderView(
        key: ValueKey(e.emailId),
        email: e,
        folder: _folder,
        onReply: (mode, mail) => _compose(mode: mode, original: mail),
        onChanged: () => _list?.touch(),
        onRemoved: (mail) {
          _list?.remove([mail.emailId]);
          if (onClose != null) {
            onClose();
          } else {
            setState(() => _open = null);
          }
        },
        onClose: onClose,
      );

  void _openMail(Email e, bool wide) {
    if (wide) {
      setState(() => _open = e);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      builder: (ctx) => _reader(e, onClose: () => Navigator.of(ctx).maybePop()),
    ));
  }

  PreferredSizeWidget _appBar(S s, bool showMenu) {
    if (_searching) {
      return AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: _closeSearch),
        title: TextField(
          controller: _search,
          focusNode: _searchFocus,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(hintText: s.search, border: InputBorder.none),
          onSubmitted: _runSearch,
        ),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () => _runSearch(_search.text)),
        ],
      );
    }
    return AppBar(
      automaticallyImplyLeading: showMenu,
      title: Text(folderTitle(s, _folder)),
      actions: [
        IconButton(tooltip: s.search, icon: const Icon(Icons.search), onPressed: _openSearch),
      ],
    );
  }

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

      final listPane = Scaffold(
        appBar: _appBar(s, !railVisible),
        drawer: railVisible ? null : Drawer(child: FolderNav(selected: _folder, onSelect: _selectFolder, inDrawer: true)),
        floatingActionButton: canSend
            ? FloatingActionButton.extended(
                onPressed: () => _compose(),
                icon: const Icon(Icons.edit_outlined),
                label: Text(s.compose),
              )
            : null,
        body: MailListView(list: list, selectedId: selected?.emailId, onOpen: (e) => _openMail(e, wide)),
      );

      Widget content;
      if (!wide) {
        content = listPane;
      } else {
        final readerPane = selected == null
            ? Scaffold(
                body: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.mail_outline, size: 56, color: Theme.of(context).colorScheme.outlineVariant),
                    const SizedBox(height: 8),
                    Text(s.selectMail, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
                  ]),
                ),
              )
            : _reader(selected, onClose: () => setState(() => _open = null));
        // Each pane keeps its own messenger so a notice shows once, across
        // the window, from the outer Scaffold rather than in every pane.
        content = Scaffold(
          body: Row(children: [
            if (railVisible) ...[
              SizedBox(width: 260, child: Material(child: FolderNav(selected: _folder, onSelect: _selectFolder))),
              const VerticalDivider(width: 1),
            ],
            SizedBox(width: railVisible ? 400 : box.maxWidth * .42, child: ScaffoldMessenger(child: listPane)),
            const VerticalDivider(width: 1),
            Expanded(child: ScaffoldMessenger(child: readerPane)),
          ]),
        );
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
