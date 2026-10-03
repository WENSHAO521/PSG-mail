import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'api/models.dart';
import 'l10n/strings.dart';

/// Non-mail screens, mirroring the web app's routes (router/index.js and
/// perm/perm.js).
enum PageKind {
  drafts,
  scheduled,
  contactGroups,
  templates,
  rules,
  settings,
  accessManagement,
  systemSettings,
  allMail,
  analytics,
  download,
  vpn,
  about,
}

/// Where the shell is: a mail folder or one of the pages.
class Destination {
  final Folder? folder;
  final PageKind? page;
  const Destination.folder(Folder this.folder) : page = null;
  const Destination.page(PageKind this.page) : folder = null;

  static const inbox = Destination.folder(Folder.inbox);

  bool get isMail => folder != null;

  @override
  bool operator ==(Object other) => other is Destination && other.folder == folder && other.page == page;

  @override
  int get hashCode => Object.hash(folder, page);
}

class PageInfo {
  final String labelKey;
  final IconData icon;
  /// Any of these permission keys unlocks the page (web perm.js); null = everyone.
  final List<String>? perms;
  const PageInfo(this.labelKey, this.icon, [this.perms]);

  bool allowed(UserInfo? user) => perms == null || perms!.any((p) => user?.can(p) ?? false);
}

const pageInfo = <PageKind, PageInfo>{
  PageKind.drafts: PageInfo('drafts', Icons.drafts_outlined, ['email:send']),
  PageKind.scheduled: PageInfo('scheduled', Icons.schedule_send_outlined, ['email:send']),
  PageKind.contactGroups: PageInfo('contactGroups', Icons.group_outlined),
  PageKind.templates: PageInfo('templates', Icons.description_outlined),
  PageKind.rules: PageInfo('subjectKeywords', Icons.rule_outlined),
  PageKind.settings: PageInfo('settings', Icons.person_outline),
  PageKind.accessManagement:
      PageInfo('accessManagement', Icons.admin_panel_settings_outlined, ['user:query', 'role:query', 'reg-key:query']),
  PageKind.systemSettings: PageInfo('SystemSettings', Icons.tune, ['setting:query']),
  PageKind.allMail: PageInfo('allMail', Icons.all_inbox_outlined, ['all-email:query']),
  PageKind.analytics: PageInfo('analytics', Icons.insights_outlined, ['analysis:query']),
  PageKind.download: PageInfo('download', Icons.download_outlined),
  PageKind.vpn: PageInfo('vpn', Icons.vpn_lock_outlined),
  PageKind.about: PageInfo('aboutApp', Icons.info_outline),
};

String destinationTitle(S s, Destination d) {
  if (d.page != null) return s.t(pageInfo[d.page]!.labelKey);
  final f = d.folder!;
  return switch (f.kind) {
    FolderKind.inbox => s.t('inbox'),
    FolderKind.allInbox => s.t('allInbox'),
    FolderKind.starred => s.t('starred'),
    FolderKind.sent => s.t('sent'),
    FolderKind.archive => s.t('archiveFolder'),
    FolderKind.spam => s.t('spam'),
    FolderKind.trash => s.t('deletedMail'),
    FolderKind.label => f.labelName ?? s.t('labels'),
  };
}
