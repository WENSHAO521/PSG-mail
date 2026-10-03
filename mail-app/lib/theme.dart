import 'package:flutter/material.dart';

import 'ui/psg.dart';

/// Typeface stack of the web app (--psg-font-sans): DM Sans for Latin,
/// the system's CJK face for Chinese.
const psgFontFallback = [
  'PingFang SC',
  'Microsoft YaHei UI',
  'Microsoft YaHei',
  'Noto Sans CJK SC',
  'Noto Sans SC',
  'Source Han Sans SC',
  'sans-serif',
];

/// Material theme built from the web's Mist tokens, so stock widgets
/// (dialogs, menus, inputs, snack bars) look like their web counterparts.
ThemeData buildTheme(Brightness brightness) {
  final t = brightness == Brightness.dark ? PsgTokens.dark : PsgTokens.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: t.primary,
    onPrimary: t.onPrimary,
    primaryContainer: t.primaryMuted,
    onPrimaryContainer: t.primary,
    secondary: t.text,
    onSecondary: t.surface,
    secondaryContainer: t.surfaceMuted,
    onSecondaryContainer: t.text,
    tertiary: t.warning,
    onTertiary: Colors.white,
    tertiaryContainer: t.warningLight9,
    onTertiaryContainer: t.warning,
    error: t.danger,
    onError: Colors.white,
    surface: t.surface,
    onSurface: t.text,
    onSurfaceVariant: t.textSecondary,
    surfaceContainerLowest: t.surface,
    surfaceContainerLow: t.surfaceMuted,
    surfaceContainer: t.surfaceMuted,
    surfaceContainerHigh: t.surfaceMuted,
    surfaceContainerHighest: t.surfaceActive,
    outline: t.textMuted,
    outlineVariant: t.border,
    shadow: Colors.black,
    inverseSurface: brightness == Brightness.dark ? t.surfaceActive : const Color(0xFF1C1C1E),
    onInverseSurface: brightness == Brightness.dark ? t.text : Colors.white,
    inversePrimary: t.primaryLight5,
  );
  final radiusMd = BorderRadius.circular(PsgRadius.md);
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: 'DM Sans',
    fontFamilyFallback: psgFontFallback,
    scaffoldBackgroundColor: t.canvas,
    canvasColor: t.surface,
    dividerColor: t.border,
    hoverColor: t.surfaceMuted,
    splashFactory: InkSparkle.splashFactory,
    visualDensity: VisualDensity.standard,
    extensions: [PsgTheme(t)],
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: t.text, displayColor: t.text),
    appBarTheme: AppBarTheme(
      backgroundColor: t.surface,
      foregroundColor: t.text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: TextStyle(fontFamily: 'DM Sans', fontFamilyFallback: psgFontFallback, fontSize: 20, fontWeight: FontWeight.w700, color: t.text),
    ),
    dividerTheme: DividerThemeData(color: t.border, space: 1, thickness: 1),
    iconTheme: IconThemeData(color: t.textSecondary, size: 20),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.surfaceMuted,
      hintStyle: TextStyle(color: t.textMuted),
      labelStyle: TextStyle(color: t.textSecondary),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: t.primary, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: t.danger)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: t.danger, width: 2)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: t.primary,
        foregroundColor: t.onPrimary,
        minimumSize: const Size(64, 44),
        shape: RoundedRectangleBorder(borderRadius: radiusMd),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: t.text,
        backgroundColor: t.surface,
        side: BorderSide(color: t.border),
        minimumSize: const Size(64, 40),
        shape: RoundedRectangleBorder(borderRadius: radiusMd),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: t.text,
        shape: RoundedRectangleBorder(borderRadius: radiusMd),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.xl)),
      titleTextStyle: TextStyle(fontFamily: 'DM Sans', fontFamilyFallback: psgFontFallback, fontSize: 18, fontWeight: FontWeight.w700, color: t.text),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: t.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.md), side: BorderSide(color: t.border)),
      textStyle: TextStyle(fontSize: 14, color: t.text),
    ),
    menuTheme: MenuThemeData(
      style: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(t.surface),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.md))),
      ),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: const Color(0xFF1C1C1E), borderRadius: BorderRadius.circular(PsgRadius.xs)),
      textStyle: const TextStyle(color: Colors.white, fontSize: 12),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: brightness == Brightness.dark ? t.surfaceActive : const Color(0xFF1C1C1E),
      contentTextStyle: TextStyle(color: brightness == Brightness.dark ? t.text : Colors.white, fontSize: 14),
      actionTextColor: t.primaryLight5,
      shape: RoundedRectangleBorder(borderRadius: radiusMd),
      width: 420,
    ),
    checkboxTheme: CheckboxThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      side: BorderSide(color: t.border, width: 1.5),
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? t.primary : Colors.transparent),
    ),
    switchTheme: SwitchThemeData(
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? t.primary : t.surfaceActive),
      thumbColor: const WidgetStatePropertyAll(Colors.white),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: t.primary),
    tabBarTheme: TabBarThemeData(
      labelColor: t.text,
      unselectedLabelColor: t.textMuted,
      indicatorColor: t.primary,
      dividerColor: t.border,
      labelStyle: const TextStyle(fontWeight: FontWeight.w700),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: t.surfaceMuted,
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PsgRadius.sm)),
      labelStyle: TextStyle(color: t.text, fontSize: 13),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: t.textSecondary,
      textColor: t.text,
      shape: RoundedRectangleBorder(borderRadius: radiusMd),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(PsgRadius.xl))),
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: t.canvas,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(right: Radius.circular(PsgRadius.xl))),
    ),
  );
}
