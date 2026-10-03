import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/strings.dart';
import '../state/session.dart';
import 'folder_nav.dart';

enum MailAction { read, unread, star, unstar, archive, unarchive, spam, notSpam, delete, restore, exportEml, labels }

/// Batch mail actions shared by the list (selection, context menu, swipe)
/// and the reader. Mirrors the web app's email-scroll handlers, including
/// its confirmations and the archive undo.
class MailActions {
  MailActions(this.context, this.folder);

  final BuildContext context;
  final Folder folder;

  ApiClient get _api => context.read<Session>().api;
  S get _s => S.of(context);

  void toast(String msg, {SnackBarAction? action}) {
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), action: action, persist: false));
  }

  Future<bool> confirm(String message, {bool danger = true}) async {
    final s = _s;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(s.t('cancel'))),
          FilledButton(
            style: danger ? FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error) : null,
            onPressed: () => Navigator.pop(c, true),
            child: Text(s.t('confirm')),
          ),
        ],
      ),
    );
    return ok == true;
  }

  /// Runs [action] on [mail]. Returns the ids that left the current folder
  /// (the caller removes them from its list).
  Future<List<int>> run(MailAction action, List<Email> mail, {VoidCallback? onUndone}) async {
    if (mail.isEmpty) return const [];
    final s = _s;
    final ids = mail.map((e) => e.emailId).toList();
    try {
      switch (action) {
        case MailAction.read:
          await _api.markRead(ids);
          for (final e in mail) {
            e.unread = 1;
          }
          return const [];
        case MailAction.unread:
          await _api.markUnread(ids);
          for (final e in mail) {
            e.unread = 0;
          }
          return const [];
        case MailAction.star:
          for (final e in mail.where((e) => !e.isStar)) {
            await _api.star(e.emailId);
            e.isStar = true;
          }
          return const [];
        case MailAction.unstar:
          for (final e in mail.where((e) => e.isStar)) {
            await _api.unstar(e.emailId);
            e.isStar = false;
          }
          return folder.kind == FolderKind.starred ? ids : const [];
        case MailAction.archive:
          await _api.archive(ids);
          toast(s.t('archivedMsg'),
              action: SnackBarAction(
                label: s.t('undo'),
                onPressed: () => _api.unarchive(ids).then((_) => onUndone?.call()).catchError((_) {}),
              ));
          return ids;
        case MailAction.unarchive:
          await _api.unarchive(ids);
          return ids;
        case MailAction.spam:
          await _api.markSpam(ids);
          return ids;
        case MailAction.notSpam:
          await _api.notSpam(ids);
          return ids;
        case MailAction.restore:
          await _api.restore(ids);
          return ids;
        case MailAction.delete:
          final trash = folder.kind == FolderKind.trash;
          final text = trash
              ? s.t('permanentDeleteConfirm')
              : (ids.length == 1 ? s.t('delOneEmailConfirm') : s.t('delEmailsConfirm'));
          if (!await confirm(text)) return const [];
          await (trash ? _api.deleteForever(ids) : _api.moveToTrash(ids));
          toast(s.t('delSuccessMsg'));
          return ids;
        case MailAction.exportEml:
          for (final id in ids) {
            final (name, bytes) = await _api.exportEml(id);
            await FilePicker.saveFile(fileName: name, bytes: Uint8List.fromList(bytes), mimeType: 'message/rfc822');
          }
          return const [];
        case MailAction.labels:
          await editLabels(mail);
          return folder.kind == FolderKind.label && !mail.first.labels.any((l) => l.labelId == folder.labelId)
              ? ids
              : const [];
      }
    } catch (e) {
      toast('${s.t('operationFailMsg')}: ${s.error(e)}');
      return const [];
    }
  }

  /// Label picker: ticks the labels every selected mail has; toggling applies
  /// or removes that label for the whole selection.
  Future<void> editLabels(List<Email> mail) async {
    final session = context.read<Session>();
    final s = _s;
    final ids = mail.map((e) => e.emailId).toList();
    await showDialog<void>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, setState) {
        bool? state(MailLabel l) {
          final n = mail.where((e) => e.labels.any((x) => x.labelId == l.labelId)).length;
          return n == 0 ? false : (n == mail.length ? true : null);
        }

        return AlertDialog(
          title: Text(s.t('labels')),
          content: SizedBox(
            width: 320,
            child: session.labels.isEmpty
                ? Text(s.t('labelEmpty'))
                : ListView(shrinkWrap: true, children: [
                    for (final l in session.labels)
                      CheckboxListTile(
                        tristate: true,
                        value: state(l),
                        secondary: Icon(Icons.label, color: labelColor(l.color)),
                        title: Text(l.name),
                        onChanged: (_) async {
                          final apply = state(l) != true;
                          try {
                            await (apply ? session.api.applyLabel(l.labelId, ids) : session.api.removeLabel(l.labelId, ids));
                            setState(() {
                              for (final e in mail) {
                                e.labels = [
                                  ...e.labels.where((x) => x.labelId != l.labelId),
                                  if (apply) l,
                                ];
                              }
                            });
                          } catch (e) {
                            toast(s.error(e));
                          }
                        },
                      ),
                  ]),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: Text(s.t('close')))],
        );
      }),
    );
  }

  Future<void> copyCode(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    toast(_s.t('copySuccessMsg'));
  }
}
