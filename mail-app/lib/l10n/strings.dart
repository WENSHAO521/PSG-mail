import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import 'native_strings.dart';
import 'web_strings.g.dart';

/// Chinese / English UI strings. Chinese is used for any zh locale,
/// English otherwise.
class S {
  final bool zh;
  const S._(this.zh);

  static S of(BuildContext context) {
    final locale = Localizations.maybeLocaleOf(context);
    return S._(locale?.languageCode == 'zh');
  }

  String _t(String zhText, String enText) => zh ? zhText : enText;

  /// A string shared with the web app (mail-vue/src/i18n), by its key.
  /// `{name}` placeholders are filled from [args]. Unknown keys fall back
  /// to English, then to the key itself.
  String t(String key, [Map<String, Object?> args = const {}]) {
    var text = (zh ? webStringsZh[key] ?? nativeStringsZh[key] : null) ??
        webStringsEn[key] ??
        nativeStringsEn[key] ??
        key;
    if (args.isNotEmpty) {
      text = text.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => args.containsKey(m[1]) ? '${args[m[1]]}' : m[0]!);
    }
    return text;
  }

  /// User-facing text for an error, matching the web app's axios messages.
  String error(Object e) {
    if (e is ApiException) {
      if (e.message == 'timeout') return t('timeoutErrorMsg');
      if (e.code == -1) return t('networkErrorMsg');
      if (e.code >= 500 && e.message.startsWith('HTTP ')) return t('serverBusyErrorMsg');
      return e.message;
    }
    return '$e';
  }

  String get appName => 'PSG Mail';
  String get server => _t('服务器地址', 'Server');
  String get serverHint => 'https://mail.example.com';
  String get email => _t('邮箱', 'Email');
  String get password => _t('密码', 'Password');
  String get signIn => _t('登录', 'Sign in');
  String get signOut => _t('退出登录', 'Sign out');
  String get required => _t('必填', 'Required');
  String get inbox => _t('收件箱', 'Inbox');
  String get starred => _t('星标邮件', 'Starred');
  String get sent => _t('已发送', 'Sent');
  String get archive => _t('归档', 'Archive');
  String get spam => _t('垃圾邮件', 'Spam');
  String get trash => _t('已删除', 'Deleted');
  String get labels => _t('标签', 'Labels');
  String get accounts => _t('邮箱账号', 'Addresses');
  String get compose => _t('写邮件', 'Compose');
  String get search => _t('搜索邮件', 'Search mail');
  String get noMail => _t('没有邮件', 'No mail');
  String get noSubject => _t('（无主题）', '(no subject)');
  String get loadFailed => _t('加载失败', 'Failed to load');
  String get retry => _t('重试', 'Retry');
  String get reply => _t('回复', 'Reply');
  String get replyAll => _t('回复全部', 'Reply all');
  String get forward => _t('转发', 'Forward');
  String get delete => _t('删除', 'Delete');
  String get deleteForever => _t('彻底删除', 'Delete forever');
  String get restore => _t('恢复', 'Restore');
  String get moveToArchive => _t('归档', 'Archive');
  String get unarchive => _t('移回收件箱', 'Move to inbox');
  String get markSpam => _t('标为垃圾邮件', 'Report spam');
  String get notSpam => _t('不是垃圾邮件', 'Not spam');
  String get star => _t('加星标', 'Star');
  String get unstar => _t('取消星标', 'Unstar');
  String get markUnread => _t('标为未读', 'Mark as unread');
  String get from => _t('发件人', 'From');
  String get to => _t('收件人', 'To');
  String get cc => _t('抄送', 'Cc');
  String get bcc => _t('密送', 'Bcc');
  String get subject => _t('主题', 'Subject');
  String get body => _t('正文', 'Message');
  String get send => _t('发送', 'Send');
  String get sending => _t('正在发送…', 'Sending…');
  String get sentOk => _t('已发送', 'Sent');
  String get attach => _t('添加附件', 'Attach');
  String get attachments => _t('附件', 'Attachments');
  String get discardTitle => _t('放弃这封邮件？', 'Discard this message?');
  String get discard => _t('放弃', 'Discard');
  String get keepEditing => _t('继续编辑', 'Keep editing');
  String get invalidAddress => _t('收件人地址无效', 'Invalid recipient address');
  String get needRecipient => _t('请填写收件人', 'Add a recipient');
  String get done => _t('已完成', 'Done');
  String get selectMail => _t('选择一封邮件阅读', 'Select a message to read');
  String get sessionExpired => _t('登录已过期，请重新登录', 'Session expired, please sign in again');
  String get wrote => _t('写道', 'wrote');
  String get forwardedHeader => _t('---------- 转发的邮件 ----------', '---------- Forwarded message ----------');
  String get date => _t('日期', 'Date');
  String get recipientsHint => _t('多个地址用逗号分隔', 'Separate addresses with commas');
  String get showImages => _t('显示图片', 'Show images');
  String get webOnlyHint => _t('管理与系统设置请在网页版中使用', 'Admin and system settings are in the web app');
  String get openWeb => _t('打开网页版', 'Open web app');
  String get webApp => _t('网页版（设置与管理）', 'Web app (settings & admin)');
  String updateAvailable(String v) => _t('PSG Mail $v 已发布', 'PSG Mail $v is available');
  String get download => _t('下载', 'Download');
  String get later => _t('稍后', 'Later');
  String newMailCount(int n) => _t('$n 封新邮件', n == 1 ? '1 new message' : '$n new messages');
  String attachmentCount(int n) => _t('$n 个附件', n == 1 ? '1 attachment' : '$n attachments');
}
