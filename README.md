# PinIG Media Downloader

原创的 MV3 WebExtension，用于在 Instagram 和 Pinterest 页面下载媒体。

## 功能

- 单张下载：鼠标悬停在图片或视频上，点击圆形下载按钮。
- 批量下载：页面右下角面板支持下载当前已加载页面里的全部媒体。
- 类型筛选：可选 `All photos + videos`、`Photos only`、`Videos only`。
- 自动加载：点击 `Load more` 会向下滚动页面并继续扫描，适合瀑布流和主页列表。
- 浏览器下载器：文件会进入浏览器默认下载列表，按平台和页面标题自动分文件夹。

## 安装

团队内部免费分发请看：

- `TEAM_INSTALL_GUIDE.md`：给同事看的安装教程，包含 macOS / Windows 截图步骤。
- `GIT_DISTRIBUTION_GUIDE.md`：给维护者看的 Git 同步和更新流程。

### Chrome / Edge / Brave / Arc

1. 打开 `chrome://extensions` 或对应浏览器的扩展管理页。
2. 开启 Developer mode。
3. 选择 Load unpacked。
4. 选择本目录：`social-media-downloader-extension`。

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击 Load Temporary Add-on。
3. 选择本目录里的 `manifest.json`。

## 团队分发

免费团队分发推荐走 Git 仓库 + 开发者模式加载：

1. 维护者把本目录作为 Git 仓库推送。
2. 成员 clone 或下载 ZIP。
3. 成员在 `chrome://extensions/` 中加载本目录。
4. 后续通过 `git pull` 或重新下载 ZIP 更新。

如果之后需要免开发者模式和自动更新，再考虑 Chrome Web Store 的 Unlisted 发布方式。上线材料见：

- `STORE_LISTING.md`
- `PRIVACY_POLICY.md`
- `RELEASE_CHECKLIST.md`

## 使用建议

Instagram 和 Pinterest 都会懒加载媒体。批量下载前，先在目标页面滚动到想保存的范围，或点击面板里的 `Load more`。

扩展只扫描当前浏览器已经加载到页面或网络资源列表里的图片、视频 URL。私密账号、登录态受限内容、站点反爬策略或临时签名 URL 可能导致部分媒体无法下载。
