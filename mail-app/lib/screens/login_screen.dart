import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../l10n/strings.dart';
import '../state/app_settings.dart';
import '../state/session.dart';
import '../ui/dialogs.dart';
import '../ui/psg.dart';
import '../widgets/recipient_field.dart' show emailPattern;
import '../widgets/reader_view.dart' show openExternal;

/// Web views/login: the brand card with sample rows on the left (wide
/// windows), the sign-in / register card on the right, language at the
/// top right. Native extra: which server to talk to, under the card.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _server;
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _regEmail = TextEditingController();
  final _regName = TextEditingController();
  final _regPassword = TextEditingController();
  final _regConfirm = TextEditingController();
  final _regCode = TextEditingController();

  bool _register = false;
  bool _busy = false;
  bool _remember = false;
  bool _editServer = false;
  String? _error;

  /// websiteConfig of the server being signed in to.
  Map<String, dynamic> _config = const {};
  List<String> _domains = const [];
  String _suffix = '';
  Timer? _configDebounce;

  bool get _hideDomain => _config['loginDomain'] == 1;
  int get _regKey => (_config['regKey'] as num?)?.toInt() ?? 1;
  bool get _registerOpen => _config['register'] == 0;

  @override
  void initState() {
    super.initState();
    final session = context.read<Session>();
    _server = TextEditingController(text: session.server);
    final r = session.rememberedLogin;
    if (r != null) {
      _remember = true;
      _email.text = r.email;
      _suffix = r.suffix;
    }
    _loadConfig();
  }

  @override
  void dispose() {
    _configDebounce?.cancel();
    for (final c in [_server, _email, _password, _regEmail, _regName, _regPassword, _regConfirm, _regCode]) {
      c.dispose();
    }
    super.dispose();
  }

  ApiClient get _api => ApiClient(baseUrl: Session.apiBase(_server.text));

  Future<void> _loadConfig({bool forRegister = false}) async {
    final server = _server.text;
    try {
      final c = await _api.websiteConfig(forRegister: forRegister);
      if (!mounted || server != _server.text) return;
      setState(() {
        _config = c;
        _domains = [for (final d in (c['domainList'] as List? ?? const [])) '$d'];
        if (!_domains.contains(_suffix)) _suffix = _domains.firstOrNull ?? '';
      });
    } catch (_) {
      if (mounted && server == _server.text) setState(() => _domains = const []);
    }
  }

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  /// Web getFullEmail(): the typed name plus the chosen domain, unless the
  /// server hides domains on the sign-in page (then the full address).
  String _full(String typed, {bool always = false}) {
    final v = typed.trim();
    if (v.contains('@') || _suffix.isEmpty || (!always && _hideDomain)) return v;
    return v + _suffix;
  }

  Future<void> _submit() async {
    final s = S.of(context);
    if (_email.text.trim().isEmpty) return _toast(s.t('emptyEmailMsg'));
    final email = _full(_email.text);
    if (!emailPattern.hasMatch(email)) return _toast(s.t('notEmailMsg'));
    if (_password.text.isEmpty) return _toast(s.t('emptyPwdMsg'));
    final session = context.read<Session>();
    await session.rememberLogin(_remember ? _email.text.trim() : null, _suffix);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await session.signIn(_server.text, email, _password.text);
    } catch (e) {
      if (mounted) setState(() => _error = S.of(context).error(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitRegister() async {
    final s = S.of(context);
    final name = _regEmail.text.trim();
    if (name.isEmpty) return _toast(s.t('emptyEmailMsg'));
    final min = (_config['minEmailPrefix'] as num?)?.toInt() ?? 0;
    if (name.split('@').first.length < min) return _toast(s.t('minEmailPrefix', {'msg': min}));
    final email = _full(name, always: true);
    if (!emailPattern.hasMatch(email)) return _toast(s.t('notEmailMsg'));
    if (_regPassword.text.isEmpty) return _toast(s.t('emptyPwdMsg'));
    if (_regPassword.text.length < 6) return _toast(s.t('pwdLengthMsg'));
    if (_regPassword.text != _regConfirm.text) return _toast(s.t('confirmPwdFailMsg'));
    if (_regKey == 0 && _regCode.text.trim().isEmpty) return _toast(s.t('emptyRegKeyMsg'));
    // The human check (Cloudflare Turnstile) only runs in a browser.
    final verify = (_config['registerVerify'] as num?)?.toInt();
    if (verify == 0 || (verify == 2 && _config['regVerifyOpen'] == true)) {
      _toast(s.t('botVerifyMsg'));
      openExternal(Session.apiBase(_server.text).replaceFirst(RegExp(r'/api$'), ''));
      return;
    }
    setState(() => _busy = true);
    try {
      await _api.register(
        email: email,
        name: _regName.text.trim(),
        password: _regPassword.text,
        code: _regCode.text.trim().isEmpty ? null : _regCode.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _register = false;
        _email.text = name;
        for (final c in [_regEmail, _regName, _regPassword, _regConfirm, _regCode]) {
          c.clear();
        }
      });
      _toast(s.t('regSuccessMsg'));
    } catch (e) {
      if (mounted) _toast(s.error(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openRegister() {
    setState(() => _register = true);
    if (_domains.isEmpty) _loadConfig(forRegister: true);
  }

  Future<void> _changePassword() async {
    final s = S.of(context);
    final typed = _full(_email.text);
    final email = TextEditingController(text: emailPattern.hasMatch(typed) ? typed : '');
    final current = TextEditingController();
    final next = TextEditingController();
    final confirm = TextEditingController();
    var busy = false;
    await showDialog<void>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, setState) {
        final t = c.psg;
        Future<void> submit() async {
          void err(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
          final e = email.text.trim();
          if (!emailPattern.hasMatch(e)) return err(s.t('notEmailMsg'));
          if (current.text.isEmpty) return err(s.t('emptyCurrentPwdMsg'));
          if (next.text.isEmpty) return err(s.t('emptyPwdMsg'));
          if (next.text.length < 6) return err(s.t('pwdLengthMsg'));
          if (next.text.length > 30) return err(s.t('passwordMaxLengthMsg'));
          if (next.text == current.text) return err(s.t('passwordSameMsg'));
          if (next.text != confirm.text) return err(s.t('confirmPwdFailMsg'));
          setState(() => busy = true);
          try {
            await _api.changePasswordAtLogin(e, current.text, next.text);
            if (c.mounted) Navigator.pop(c);
            err(s.t('passwordChangeSuccess'));
          } catch (x) {
            err(s.error(x));
          } finally {
            if (c.mounted) setState(() => busy = false);
          }
        }

        return Dialog(
          insetPadding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                Row(children: [
                  Expanded(child: Text(s.t('changePassword'), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: t.text))),
                  PsgIconButton('psg:close', iconSize: 16, onPressed: busy ? null : () => Navigator.pop(c)),
                ]),
                const SizedBox(height: 8),
                Text(s.t('changePasswordLoginHint'), style: TextStyle(fontSize: 13, height: 1.6, color: t.textSecondary)),
                const SizedBox(height: 16),
                _Field(label: s.t('emailAccount'), controller: email, onSubmit: submit),
                _Field(label: s.t('currentPassword'), controller: current, password: true, onSubmit: submit),
                _Field(label: s.t('newPassword'), controller: next, password: true, onSubmit: submit),
                _Field(label: s.t('confirmPassword'), controller: confirm, password: true, onSubmit: submit),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.sm)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    PsgIcon('psg:info-circle', size: 17, color: t.textMuted),
                    const SizedBox(width: 8),
                    Expanded(child: Text(s.t('forgotPasswordMsg'), style: TextStyle(fontSize: 12.5, height: 1.55, color: t.textSecondary))),
                  ]),
                ),
                const SizedBox(height: 18),
                PsgButton(s.t('changePwdBtn'), height: 46, expand: true, busy: busy, onPressed: submit),
              ]),
            ),
          ),
        );
      }),
    );
    for (final c in [email, current, next, confirm]) {
      c.dispose();
    }
  }

  Future<void> _twoFactor() {
    final s = S.of(context);
    return psgBox<void>(context,
        title: s.t('twoFactorEntry'), body: Text(s.t('twoFactorMsg')), actions: [(s.t('confirm'), null, PsgButtonKind.primary)]);
  }

  Future<void> _language(BuildContext anchor) async {
    final settings = context.read<AppSettings?>();
    final box = anchor.findRenderObject() as RenderBox;
    final overlay = Overlay.of(anchor).context.findRenderObject() as RenderBox;
    final pos = box.localToGlobal(Offset(box.size.width, box.size.height + 6), ancestor: overlay);
    final zh = S.of(context).zh;
    final v = await showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx - 160, pos.dy, overlay.size.width - pos.dx, 0),
      items: [
        psgMenuItem(context, 'zh', '中文', checked: zh),
        psgMenuItem(context, 'en', 'English', checked: !zh),
      ],
    );
    if (v != null) settings?.setLang(v);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    return Scaffold(
      backgroundColor: t.canvas,
      body: SafeArea(
        child: LayoutBuilder(builder: (context, box) {
          final wide = box.maxWidth > 980;
          final small = box.maxWidth <= 420;
          final form = Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(small ? 12 : (box.maxWidth <= 767 ? 20 : 32)),
              child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: _card(wide: wide, small: small)),
            ),
          );
          return Stack(children: [
            Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (wide)
                const Expanded(child: Padding(padding: EdgeInsets.fromLTRB(24, 24, 0, 24), child: _BrandCard())),
              wide ? SizedBox(width: 520, child: form) : Expanded(child: form),
            ]),
            Positioned(
              top: 16,
              right: 16,
              child: Builder(
                builder: (b) => PsgIconButton('psg:globe',
                    style: PsgIconButtonStyle.surface, size: 38, iconSize: 18, color: t.text, onPressed: () => _language(b)),
              ),
            ),
          ]);
        }),
      ),
    );
  }

  Widget _card({required bool wide, required bool small}) {
    final s = S.of(context);
    final t = context.psg;
    final session = context.watch<Session>();
    final reg = _register;
    return Container(
      padding: small ? const EdgeInsets.fromLTRB(18, 28, 18, 20) : const EdgeInsets.fromLTRB(36, 40, 36, 28),
      decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(small ? PsgRadius.md : 28)),
      child: AutofillGroup(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (!wide) ...[
            Row(children: [
              const BrandLogo(height: 34),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('PSG Mail', style: TextStyle(fontSize: small ? 16 : 17, fontWeight: FontWeight.w700, color: t.text)),
                const SizedBox(height: 2),
                Text('Panorama Scholarly Group', style: TextStyle(fontSize: 12, color: t.textMuted)),
              ]),
            ]),
            const SizedBox(height: 26),
          ],
          Text(reg ? s.t('regBtn') : s.t('loginHeading'),
              style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -.6, height: 1.2, color: t.text)),
          const SizedBox(height: 10),
          Text(reg ? s.t('regTitle') : s.t('loginSubtitle'), style: TextStyle(fontSize: 13, height: 1.6, color: t.textSecondary)),
          const SizedBox(height: 28),
          if (session.expired && !reg) ...[
            Text(s.sessionExpired, style: TextStyle(fontSize: 13, color: t.danger)),
            const SizedBox(height: 12),
          ],
          if (!reg) ..._loginFields(s, t) else ..._registerFields(s, t),
          if (_registerOpen) ...[
            const SizedBox(height: 18),
            Center(
              child: GestureDetector(
                onTap: _busy ? null : (reg ? () => setState(() => _register = false) : _openRegister),
                child: MouseRegion(
                  cursor: SystemMouseCursors.click,
                  child: Text.rich(TextSpan(children: [
                    TextSpan(text: '${reg ? s.t('hasAccount') : s.t('noAccount')} '),
                    TextSpan(
                      text: reg ? s.t('loginSwitch') : s.t('regSwitch'),
                      style: TextStyle(fontWeight: FontWeight.w700, color: t.text, decoration: TextDecoration.underline),
                    ),
                  ]), style: TextStyle(fontSize: 13, color: t.textSecondary)),
                ),
              ),
            ),
          ],
          const SizedBox(height: 22),
          Divider(height: 1, color: t.border),
          const SizedBox(height: 18),
          Text(s.t('authorizedNote'), textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: t.textMuted)),
          const SizedBox(height: 10),
          _serverRow(s, t),
        ]),
      ),
    );
  }

  /// Native only: the server this app signs in to.
  Widget _serverRow(S s, PsgTokens t) {
    if (_editServer) {
      return _Field(
        label: s.server,
        controller: _server,
        hint: s.serverHint,
        autofocus: true,
        onSubmit: () {
          setState(() => _editServer = false);
          context.read<Session>().setServer(_server.text);
          _loadConfig();
        },
        onChanged: (_) {
          _configDebounce?.cancel();
          _configDebounce = Timer(const Duration(milliseconds: 600), _loadConfig);
        },
      );
    }
    return Center(
      child: InkWell(
        borderRadius: BorderRadius.circular(PsgRadius.xs),
        onTap: () => setState(() => _editServer = true),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            PsgIcon('psg:globe', size: 12, color: t.textMuted),
            const SizedBox(width: 5),
            Flexible(
              child: Text(_server.text.replaceFirst(RegExp(r'^https?://'), ''),
                  overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: t.textMuted)),
            ),
            const SizedBox(width: 4),
            PsgIcon('psg:edit', size: 11, color: t.textMuted),
          ]),
        ),
      ),
    );
  }

  List<Widget> _loginFields(S s, PsgTokens t) => [
        _Field(
          label: s.t('emailAccount'),
          controller: _email,
          suffix: _hideDomain ? null : _suffixPicker(t),
          autofill: const [AutofillHints.email, AutofillHints.username],
          keyboard: TextInputType.emailAddress,
        ),
        _Field(
          label: s.t('password'),
          controller: _password,
          password: true,
          autofill: const [AutofillHints.password],
          onSubmit: _submit,
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 20),
          child: Row(children: [
            GestureDetector(
              onTap: () => setState(() => _remember = !_remember),
              child: Row(children: [
                PsgCheckbox(value: _remember, onChanged: (v) => setState(() => _remember = v)),
                const SizedBox(width: 1),
                Text(s.t('rememberMe'), style: TextStyle(fontSize: 13, color: t.textSecondary)),
              ]),
            ),
            const Spacer(),
            InkWell(
              onTap: _changePassword,
              child: Text(s.t('changePassword'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: t.text)),
            ),
          ]),
        ),
        if (_error != null) ...[
          Text(_error!, style: TextStyle(fontSize: 13, color: t.danger)),
          const SizedBox(height: 12),
        ],
        Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(PsgRadius.md), boxShadow: PsgShadow.sm(context)),
          child: PsgButton(s.t('loginBtn'), height: 46, expand: true, busy: _busy, onPressed: _busy ? null : _submit),
        ),
        const SizedBox(height: 14),
        Material(
          color: t.surfaceMuted,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.md), side: BorderSide(color: t.border)),
          child: InkWell(
            borderRadius: BorderRadius.circular(PsgRadius.md),
            onTap: _twoFactor,
            child: SizedBox(
              height: 44,
              child: Center(
                child: Text(s.t('twoFactorEntry'), style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: t.text)),
              ),
            ),
          ),
        ),
      ];

  List<Widget> _registerFields(S s, PsgTokens t) => [
        _Field(controller: _regEmail, hint: s.t('emailAccount'), suffix: _suffixPicker(t), keyboard: TextInputType.emailAddress),
        _Field(controller: _regName, hint: s.t('namePlaceholder')),
        _Field(controller: _regPassword, hint: s.t('password'), password: true),
        _Field(controller: _regConfirm, hint: s.t('confirmPwd'), password: true),
        if (_regKey == 0 || _regKey == 2)
          _Field(controller: _regCode, hint: _regKey == 0 ? s.t('regKey') : s.t('regKeyOptional'), onSubmit: _submitRegister),
        const SizedBox(height: 4),
        PsgButton(s.t('regBtn'), height: 46, expand: true, busy: _busy, onPressed: _busy ? null : _submitRegister),
      ];

  /// Web .email-input append: the domain list as a grey suffix box.
  Widget? _suffixPicker(PsgTokens t) {
    if (_domains.isEmpty) return null;
    return Builder(
      builder: (b) => InkWell(
        onTap: _domains.length < 2
            ? null
            : () async {
                final box = b.findRenderObject() as RenderBox;
                final overlay = Overlay.of(b).context.findRenderObject() as RenderBox;
                final pos = box.localToGlobal(Offset(0, box.size.height + 4), ancestor: overlay);
                final v = await showMenu<String>(
                  context: b,
                  position: RelativeRect.fromLTRB(pos.dx, pos.dy, overlay.size.width - pos.dx - box.size.width, 0),
                  items: [for (final d in _domains) psgMenuItem(b, d, d, checked: d == _suffix)],
                );
                if (v != null) setState(() => _suffix = v);
              },
        child: Container(
          height: 46,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: t.surfaceActive,
            border: Border(left: BorderSide(color: t.border)),
            borderRadius: const BorderRadius.horizontal(right: Radius.circular(PsgRadius.md)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(_suffix, style: TextStyle(fontSize: 14, color: t.text)),
            if (_domains.length > 1) ...[const SizedBox(width: 6), PsgIcon('psg:chevron-down', size: 18, color: t.text)],
          ]),
        ),
      ),
    );
  }
}

/// Web login input: label above, 46px grey well that turns white with an
/// accent ring when focused; optional suffix box on the right.
class _Field extends StatefulWidget {
  final String? label;
  final String? hint;
  final TextEditingController controller;
  final bool password;
  final Widget? suffix;
  final VoidCallback? onSubmit;
  final ValueChanged<String>? onChanged;
  final List<String>? autofill;
  final TextInputType? keyboard;
  final bool autofocus;
  const _Field({
    this.label,
    this.hint,
    required this.controller,
    this.password = false,
    this.suffix,
    this.onSubmit,
    this.onChanged,
    this.autofill,
    this.keyboard,
    this.autofocus = false,
  });

  @override
  State<_Field> createState() => _FieldState();
}

class _FieldState extends State<_Field> {
  final _focus = FocusNode();
  bool _hover = false;
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.psg;
    final focused = _focus.hasFocus;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (widget.label != null)
          Padding(
            padding: const EdgeInsets.only(top: 2, bottom: 7),
            child: Text(widget.label!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: t.text)),
          ),
        MouseRegion(
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            height: 46,
            decoration: BoxDecoration(
              color: focused ? t.surface : (_hover ? t.surfaceActive : t.surfaceMuted),
              borderRadius: BorderRadius.circular(PsgRadius.md),
              boxShadow: focused ? [BoxShadow(color: t.focus, spreadRadius: 2)] : null,
            ),
            clipBehavior: Clip.antiAlias,
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  focusNode: _focus,
                  autofocus: widget.autofocus,
                  obscureText: widget.password && _obscure,
                  autofillHints: widget.autofill,
                  keyboardType: widget.keyboard,
                  onChanged: widget.onChanged,
                  onSubmitted: (_) => widget.onSubmit?.call(),
                  style: TextStyle(fontSize: 14, color: t.text),
                  decoration: InputDecoration(
                    hintText: widget.hint ?? widget.label,
                    hintStyle: TextStyle(fontSize: 14, color: t.textMuted),
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    isDense: true,
                  ),
                ),
              ),
              if (widget.password)
                PsgIconButton(_obscure ? 'psg:eye' : 'psg:eye',
                    size: 34, iconSize: 16, color: _obscure ? t.textMuted : t.text, onPressed: () => setState(() => _obscure = !_obscure)),
              if (widget.password) const SizedBox(width: 6),
              ?widget.suffix,
            ]),
          ),
        ),
      ]),
    );
  }
}

/// Web .brand-card: logo, the hero line, sample inbox rows, footnote.
class _BrandCard extends StatelessWidget {
  const _BrandCard();

  static const _rows = [
    ('Editorial Office', '09:41', 'Manuscript PSG-2026-118 accepted', true),
    ('Peer Review', '08:15', 'Reviewer report received', true),
    ('Author Services', 'Mon', 'Proofs ready for your approval', false),
  ];

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = context.psg;
    final width = MediaQuery.sizeOf(context).width;
    final hero = (width * .036).clamp(34.0, 52.0);
    return Container(
      padding: const EdgeInsets.fromLTRB(48, 40, 48, 40),
      decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(28)),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const BrandLogo(height: 34),
          const SizedBox(width: 12),
          Text('PSG Mail', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, letterSpacing: -.19, color: t.text)),
        ]),
        const Spacer(),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Text(s.t('loginHeroTitle'),
              style: TextStyle(fontSize: hero, fontWeight: FontWeight.w700, height: 1.08, letterSpacing: -hero * .03, color: t.text)),
        ),
        const SizedBox(height: 18),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Text(s.t('brandPanelLine'), style: TextStyle(fontSize: 16, height: 1.6, color: t.textSecondary)),
        ),
        const SizedBox(height: 32),
        Container(
          constraints: const BoxConstraints(maxWidth: 460),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(PsgRadius.lg)),
          child: Column(children: [
            for (var i = 0; i < _rows.length; i++)
              Container(
                margin: EdgeInsets.only(bottom: i < _rows.length - 1 ? 4 : 0),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: i == 0 ? t.surface : null,
                  borderRadius: BorderRadius.circular(PsgRadius.md),
                  boxShadow: i == 0 ? PsgShadow.xs(context) : null,
                ),
                child: Row(children: [
                  Builder(builder: (context) {
                    final tint = avatarTint(context, _rows[i].$1);
                    return Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: tint.bg, borderRadius: BorderRadius.circular(PsgRadius.md)),
                      alignment: Alignment.center,
                      child: Text(_rows[i].$1[0], style: TextStyle(fontWeight: FontWeight.w700, color: tint.fg)),
                    );
                  }),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(
                          child: Text(_rows[i].$1,
                              style: TextStyle(fontSize: 14, fontWeight: _rows[i].$4 ? FontWeight.w700 : FontWeight.w500, color: t.text)),
                        ),
                        Text(_rows[i].$2,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: _rows[i].$4 ? FontWeight.w700 : FontWeight.w400,
                                color: _rows[i].$4 ? t.primary : t.textMuted)),
                      ]),
                      const SizedBox(height: 2),
                      Text(_rows[i].$3,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: _rows[i].$4 ? FontWeight.w600 : FontWeight.w400,
                              color: _rows[i].$4 ? t.text : t.textSecondary)),
                    ]),
                  ),
                ]),
              ),
          ]),
        ),
        const SizedBox(height: 32),
        Text('Panorama Scholarly Group', style: TextStyle(fontSize: 13, color: t.textMuted)),
      ]),
    );
  }
}
