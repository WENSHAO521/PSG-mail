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
  /// Web icon name (web_icons.g.dart).
  final String icon;
  /// Any of these permission keys unlocks the page (web perm.js); null = everyone.
  final List<String>? perms;
  const PageInfo(this.labelKey, this.icon, [this.perms]);

  bool allowed(UserInfo? user) => perms == null || perms!.any((p) => user?.can(p) ?? false);
}

const pageInfo = <PageKind, PageInfo>{
  PageKind.drafts: PageInfo('drafts', 'psg:draft', ['email:send']),
  PageKind.scheduled: PageInfo('scheduled', 'psg:clock', ['email:send']),
  PageKind.contactGroups: PageInfo('contactGroups', 'psg:group'),
  PageKind.templates: PageInfo('templates', 'psg:template'),
  PageKind.rules: PageInfo('subjectKeywords', 'psg:filter'),
  PageKind.settings: PageInfo('settings', 'psg:settings'),
  PageKind.accessManagement:
      PageInfo('accessManagement', 'psg:group', ['user:query', 'role:query', 'reg-key:query']),
  PageKind.systemSettings: PageInfo('SystemSettings', 'psg:system', ['setting:query']),
  PageKind.allMail: PageInfo('allMail', 'psg:all-mail', ['all-email:query']),
  PageKind.analytics: PageInfo('analytics', 'psg:analytics', ['analysis:query']),
  PageKind.download: PageInfo('download', 'psg:download'),
  PageKind.vpn: PageInfo('vpn', 'psg:shield'),
  PageKind.about: PageInfo('aboutApp', 'solar:info-circle-linear'),
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
