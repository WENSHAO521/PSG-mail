import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'state/session.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session(await SharedPreferences.getInstance());
  runApp(ChangeNotifierProvider.value(value: session, child: const PsgMailApp()));
}

class PsgMailApp extends StatelessWidget {
  const PsgMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PSG Mail',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      localizationsDelegates: const [...GlobalMaterialLocalizations.delegates, FlutterQuillLocalizations.delegate],
      supportedLocales: const [Locale('zh'), Locale('en')],
      home: const _Root(),
    );
  }
}

/// Signed out → login; signed in → load the account, then the mail shell.
class _Root extends StatefulWidget {
  const _Root();

  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> {
  Future<void>? _loading;
  bool _wasSignedIn = false;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    if (!session.signedIn) {
      _loading = null;
      _wasSignedIn = false;
      return const LoginScreen();
    }
    if (!_wasSignedIn) {
      _wasSignedIn = true;
      // Already loaded by signIn(); a cold start with a saved token loads here.
      _loading = session.user == null ? session.load() : Future.value();
    }
    return FutureBuilder<void>(
      future: _loading,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snap.hasError || session.current == null) {
          return _LoadError(
            error: '${snap.error ?? ''}',
            onRetry: () => setState(() => _loading = session.load()),
            onSignOut: session.signOut,
          );
        }
        return const HomeScreen();
      },
    );
  }
}

class _LoadError extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;
  final VoidCallback onSignOut;
  const _LoadError({required this.error, required this.onRetry, required this.onSignOut});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_outlined, size: 48),
            const SizedBox(height: 12),
            Text(error, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry / 重试')),
            TextButton(onPressed: onSignOut, child: const Text('Sign out / 退出登录')),
          ]),
        ),
      ),
    );
  }
}
