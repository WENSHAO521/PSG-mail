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
import '../state/notifications.dart';
import '../state/session.dart';
import '../ui/psg.dart';
import '../widgets/folder_nav.dart';
import '../widgets/mail_list_view.dart';
import '../widgets/reader_view.dart';
import '../widgets/shell_chrome.dart';
import 'compose_screen.dart';

/// The app shell, laid out like the web app (layout/index.vue).
///
/// Wider than 1024px: the 72px top bar, then the folder column, the list
/// card and the reader card on the mist. Phones: the big-title header, one
/// white card, the ink tab bar and the orange compose button; a message
/// opens as its own screen.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  /// Web: the phone layout applies at ≤1024px.
  static const _phoneMax = 1024.0;

  Destination _dest = Destination.inbox;
  String _query = '';
  bool _oldestFirst = false;
  final _search = TextEditingController(); // top bar: all mailboxes
  final _listSearch = TextEditingController(); // the list's own search row
  final _searchFocus = FocusNode();
  final _listSearchFocus = FocusNode();
  final _shellFocus = FocusNode(debugLabel: 'shell');
  MailList? _list;
  int? _listAccountId;
  Email? _open; // the message shown beside the list (desktop)
  bool _wide = false;
  MailWatcher? _watcher;
  late final NotificationCenter _notices = NotificationCenter(context.read<Session>().api);

  Folder get _folder => _dest.folder ?? Folder.inbox;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _startServices());
  }

  Future<void> _startServices() async {
    final session = context.read<Session>();
    Notifier.instance.onOpen = _openById;
    _notices.load();
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
      onNewMail: (mail) {
        for (final e in mail.reversed) {
          _notices.push(e);
        }
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
      persist: false,
      content: Text(s.updateAvailable(update.version)),
      action: SnackBarAction(label: s.download, onPressed: () => openExternal(update.url)),
    ));
  }

  /// Opens a message by id (tapped notification).
  Future<void> _openById(int emailId) async {
    try {
      final mail = await context.read<Session>().api.detail(emailId);
      if (mail != null && mounted) {
        if (!_dest.isMail) _go(Destination.inbox);
        _openMail(mail, _wide);
      }
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
    _notices.dispose();
    _search.dispose();
    _listSearch.dispose();
    _searchFocus.dispose();
    _listSearchFocus.dispose();
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
      _oldestFirst = false;
      _search.clear();
      _listSearch.clear();
      if (d.isMail) _reload();
      _open = null;
    });
  }

  void _toggleSort() => setState(() {
        _oldestFirst = !_oldestFirst;
        _reload();
      });

  /// Ctrl+F / "/" / the phone's search tab: focus the search box. The
  /// shell's shortcut Focus holds focus, so ask explicitly once built.
  void _focusSearch() {
    if (!_dest.isMail) _go(Destination.inbox);
    WidgetsBinding.instance.addPostFrameCallback((_) => (_wide ? _searchFocus : _listSearchFocus).requestFocus());
  }

  void _runSearch(String q) {
    setState(() {
      if (!_dest.isMail) _dest = Destination.inbox;
      _query = q.trim();
      _search.text = q;
      _listSearch.text = q;
      _reload();
    });
    // Submitting drops focus; hand it back so window shortcuts keep working.
    _shellFocus.requestFocus();
  }

  void _clearSearch() {
    if (_query.isEmpty) {
      _listSearch.clear();
      return;
    }
    _runSearch('');
  }

  /// The compose window (web layout/write): one at a time, drawn over the
  /// shell; it can be minimized to a pill while the rest stays usable.
  Widget? _composer;
  final _composerKey = GlobalKey<ComposeScreenState>();

  Future<void> _compose(
      {ReplyMode? mode, Email? original, Draft? draft, Map<String, dynamic>? prefill, bool restored = false}) async {
    if (_composer != null) {
      _composerKey.currentState?.restore();
      return;
    }
    setState(() => _composer = ComposeScreen(
          key: _composerKey,
          mode: mode,
          original: original,
          draft: draft,
          prefill: prefill,
          restored: restored,
          onDone: _composeDone,
        ));
  }

  void _composeDone(ComposeResult? result) {
    setState(() => _composer = null);
    if (!mounted || result == null) return;
    final s = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    switch (result) {
      case ComposeSent():
        messenger.showSnackBar(SnackBar(content: Text(s.t('sendSuccessMsg'))));
        if (_dest.isMail && _folder.kind == FolderKind.sent) _list?.refresh();
      case ComposeScheduled():
        messenger.showSnackBar(SnackBar(content: Text(s.t('scheduleSuccessMsg'))));
      case ComposeUndoable(:final scheduleId, :final seconds, :final draft, :final subject):
        // Web undo-send notification: the send is a short server-side
        // schedule; Undo cancels it and reopens the message.
        var undone = false;
        messenger.showSnackBar(SnackBar(
          duration: Duration(seconds: seconds),
          persist: false,
          content: _UndoCountdown(seconds: seconds, label: s.t('messageSending'), subject: subject),
          action: SnackBarAction(
            label: s.t('undo'),
            onPressed: () async {
              if (undone) return;
              undone = true;
              try {
                await context.read<Session>().api.scheduleCancel(scheduleId);
                if (!mounted) return;
                messenger.showSnackBar(SnackBar(content: Text(s.t('undoRestoredMsg'))));
                _compose(draft: draft, restored: true);
              } catch (_) {
                // Already sent (the fast path won the race against the click).
                messenger.showSnackBar(SnackBar(content: Text(s.t('scheduledCancelFail'))));
              }
            },
          ),
        ));
        Future.delayed(Duration(seconds: seconds + 2), () {
          if (mounted && _dest.isMail && _folder.kind == FolderKind.sent) _list?.refresh();
        });
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

  Widget _page(PageKind p) => switch (p) {
        PageKind.drafts => DraftsPage(onOpen: (d) => _compose(draft: d)),
        PageKind.scheduled => ScheduledPage(onEdit: (payload) => _compose(prefill: payload)),
        _ => _ComingPage(kind: p),
      };

  String get _title {
    final s = S.of(context);
    if (_query.isNotEmpty) return s.t('search');
    return destinationTitle(s, _dest);
  }

  /// Web .explorer-head: folder title (desktop), mailbox chips, search row.
  Widget _explorerHead({required bool phone}) {
    final s = S.of(context);
    final t = context.psg;
    final k = _folder.kind;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      if (!phone)
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: Text(_title,
              maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text)),
        ),
      if (const {FolderKind.inbox, FolderKind.allInbox}.contains(k) && _query.isEmpty)
        MailboxChips(
          allActive: k == FolderKind.allInbox,
          onAll: () => _go(const Destination.folder(Folder(FolderKind.allInbox))),
          onAccount: (a) {
            context.read<Session>().selectAccount(a);
            if (k != FolderKind.inbox) _go(Destination.inbox);
          },
        ),
      Padding(
        padding: EdgeInsets.fromLTRB(phone ? 14 : 20, phone ? 8 : 12, phone ? 14 : 20, 0),
        child: ListenableBuilder(
          listenable: _listSearch,
          builder: (context, _) => PsgSearchField(
            controller: _listSearch,
            focusNode: _listSearchFocus,
            hint: s.t('searchPlaceholder'),
            onSubmitted: _runSearch,
            trailing: _listSearch.text.isEmpty && _query.isEmpty
                ? null
                : PsgIconButton('psg:close-circle', size: 24, iconSize: 14, tooltip: s.t('clear'), onPressed: _clearSearch),
          ),
        ),
      ),
    ]);
  }

  Widget _listPane(MailList list, {required bool phone, required bool wide, Email? selected}) {
    final canSend = context.read<Session>().user?.can('email:send') ?? true;
    return SortToggle(
      onToggle: _toggleSort,
      child: MailListView(
        key: ObjectKey(list),
        list: list,
        head: _explorerHead(phone: phone),
        selectedId: selected?.emailId,
        onOpen: (e) => _openMail(e, wide),
        onReply: canSend ? (mode, e) => _compose(mode: mode, original: e) : null,
      ),
    );
  }

  bool get _workspace => !_dest.isMail && sectionOf(_dest) != Section.mail;

  Widget _desktop(BoxConstraints box, MailList list) {
    final s = S.of(context);
    final t = context.psg;
    final narrow = box.maxWidth <= 1280;
    final pad = narrow ? 16.0 : 24.0;
    final canSend = context.read<Session>().user?.can('email:send') ?? true;
    final selected = _open;

    Widget body;
    if (_workspace) {
      body = PsgCard(child: ScaffoldMessenger(child: Scaffold(backgroundColor: t.surface, body: _page(_dest.page!))));
    } else {
      final Widget main;
      if (!_dest.isMail) {
        main = PsgCard(child: ScaffoldMessenger(child: Scaffold(backgroundColor: t.surface, body: _page(_dest.page!))));
      } else {
        final reader = selected == null
            ? PsgCard(
                child: Center(
                  child: PsgEmpty(icon: 'psg:mail', title: s.t('selectEmailHint')),
                ),
              )
            : PsgCard(child: _reader(selected, onClose: () => setState(() => _open = null), open: (m) => setState(() => _open = m)));
        // Each pane keeps its own messenger so a notice shows once.
        main = Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SizedBox(
            width: narrow ? 360 : 420,
            child: PsgCard(child: ScaffoldMessenger(child: Scaffold(backgroundColor: t.surface, body: _listPane(list, phone: false, wide: true, selected: selected)))),
          ),
          SizedBox(width: narrow ? 12 : 16),
          Expanded(child: ScaffoldMessenger(child: Scaffold(backgroundColor: Colors.transparent, body: reader))),
        ]);
      }
      body = Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: narrow ? 184 : 200,
          child: Padding(
            padding: const EdgeInsets.only(right: 16),
            child: ListenableBuilder(
              listenable: list,
              builder: (context, _) => FolderNav(
                selected: _dest,
                onSelect: _go,
                inboxUnread: _folder.kind == FolderKind.inbox && _query.isEmpty ? list.unreadCount : 0,
              ),
            ),
          ),
        ),
        Expanded(child: main),
      ]);
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(pad, 0, pad, pad),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        PsgTopBar(
          dest: _dest,
          onNavigate: _go,
          search: _search,
          searchFocus: _searchFocus,
          onSearch: _runSearch,
          onCompose: canSend ? () => _compose() : null,
          onOpenMail: _openById,
          compact: narrow,
        ),
        Expanded(child: body),
      ]),
    );
  }

  PhoneTab? get _phoneTab {
    if (_dest.page == PageKind.settings) return PhoneTab.settings;
    if (_query.isNotEmpty) return PhoneTab.search;
    if (_dest.folder?.kind == FolderKind.starred) return PhoneTab.starred;
    if (sectionOf(_dest) == Section.mail) return PhoneTab.mail;
    return null;
  }

  void _onTab(PhoneTab tab) {
    switch (tab) {
      case PhoneTab.mail:
        if (!(_dest == Destination.inbox && _query.isEmpty)) _go(Destination.inbox);
      case PhoneTab.search:
        _focusSearch();
      case PhoneTab.starred:
        _go(const Destination.folder(Folder(FolderKind.starred)));
      case PhoneTab.settings:
        _go(const Destination.page(PageKind.settings));
    }
  }

  Widget _phone(MailList list) {
    final t = context.psg;
    final canSend = context.read<Session>().user?.can('email:send') ?? true;
    final mailScreen = sectionOf(_dest) == Section.mail;
    // Web COMPOSE_ROUTES: compose floats over the everyday lists only.
    final showFab = canSend &&
        (_dest.page == PageKind.drafts ||
            (_dest.isMail && !const {FolderKind.archive, FolderKind.spam, FolderKind.trash}.contains(_folder.kind)));
    final content = _dest.isMail ? _listPane(list, phone: true, wide: false) : _page(_dest.page!);
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Stack(children: [
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SafeArea(
          bottom: false,
          child: ListenableBuilder(
            listenable: list,
            builder: (context, _) => PhoneHeader(
              title: _title,
              onTitle: mailScreen
                  ? () => showFolderSheet(context,
                      selected: _dest,
                      onSelect: _go,
                      inboxUnread: _folder.kind == FolderKind.inbox && _query.isEmpty ? list.unreadCount : 0)
                  : null,
              onNavigate: _go,
              onOpenMail: _openById,
            ),
          ),
        ),
        Expanded(
          child: PsgCard(child: ScaffoldMessenger(child: Scaffold(backgroundColor: t.surface, body: content))),
        ),
        const SizedBox(height: 6),
        PhoneTabBar(current: _phoneTab, onTab: _onTab),
      ]),
      if (showFab)
        Positioned(right: 18, bottom: 92 + bottom, child: PhoneFab(onPressed: () => _compose())),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final canSend = session.user?.can('email:send') ?? true;
    final list = _list;
    if (list == null) return const SizedBox.shrink();

    return ChangeNotifierProvider.value(
      value: _notices,
      child: LayoutBuilder(builder: (context, box) {
        final wide = box.maxWidth > _phoneMax;
        _wide = wide;
        final content = Scaffold(
          backgroundColor: context.psg.canvas,
          body: wide ? SafeArea(child: _desktop(box, list)) : _phone(list),
        );
        return CallbackShortcuts(
          bindings: {
            if (canSend) const SingleActivator(LogicalKeyboardKey.keyN, control: true): () => _compose(),
            if (canSend) const SingleActivator(LogicalKeyboardKey.keyN, meta: true): () => _compose(),
            const SingleActivator(LogicalKeyboardKey.keyF, control: true): _focusSearch,
            const SingleActivator(LogicalKeyboardKey.keyF, meta: true): _focusSearch,
            // Only when no text field has focus (web: the "/" key).
            const SingleActivator(LogicalKeyboardKey.slash): () {
              if (_shellFocus.hasPrimaryFocus) _focusSearch();
            },
            const SingleActivator(LogicalKeyboardKey.f5): () => list.refresh(),
          },
          child: Focus(
            focusNode: _shellFocus,
            autofocus: true,
            child: Stack(children: [
              Positioned.fill(child: content),
              if (_composer != null) Positioned.fill(child: _composer!),
            ]),
          ),
        );
      }),
    );
  }
}

/// Placeholder for a web page that has no native screen yet.
class _ComingPage extends StatelessWidget {
  final PageKind kind;
  const _ComingPage({required this.kind});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final info = pageInfo[kind]!;
    return Center(
      child: PsgEmpty(
        icon: info.icon,
        title: s.t(info.labelKey),
        action: PsgButton(s.webApp, kind: PsgButtonKind.secondary, height: 36, icon: 'psg:globe', onPressed: () {
          final session = context.read<Session>();
          openExternal(Session.apiBase(session.server).replaceFirst(RegExp(r'/api$'), ''));
        }),
      ),
    );
  }
}

/// "Sending…" with the seconds left to undo.
class _UndoCountdown extends StatefulWidget {
  final int seconds;
  final String label;
  final String subject;
  const _UndoCountdown({required this.seconds, required this.label, required this.subject});

  @override
  State<_UndoCountdown> createState() => _UndoCountdownState();
}

class _UndoCountdownState extends State<_UndoCountdown> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: Duration(seconds: widget.seconds))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final left = (widget.seconds * (1 - _c.value)).ceil();
        return Row(children: [
          SizedBox(
            width: 22,
            height: 22,
            child: Stack(alignment: Alignment.center, children: [
              CircularProgressIndicator(value: 1 - _c.value, strokeWidth: 2.5),
              Text('$left', style: const TextStyle(fontSize: 10)),
            ]),
          ),
          const SizedBox(width: 12),
          Text(widget.label),
          const SizedBox(width: 8),
          Expanded(child: Text(widget.subject, maxLines: 1, overflow: TextOverflow.ellipsis)),
        ]);
      },
    );
  }
}
