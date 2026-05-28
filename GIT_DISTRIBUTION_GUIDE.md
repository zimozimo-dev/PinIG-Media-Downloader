# Git 团队分发指南

这份文档给维护者使用。目标是：不走 Chrome Web Store，不付费，通过 Git 仓库让团队成员同步安装和更新插件。

## 推荐仓库结构

把整个 `social-media-downloader-extension` 目录作为一个独立 Git 仓库：

```text
social-media-downloader-extension/
  manifest.json
  src/
  assets/
  docs/
  README.md
  TEAM_INSTALL_GUIDE.md
  GIT_DISTRIBUTION_GUIDE.md
```

## 第一次上传到 Git

在本目录执行：

```bash
git init
git add .
git commit -m "Initial team release"
```

然后去 GitHub、GitLab、Gitee 或公司内部 Git 平台创建一个空仓库，再执行平台给出的 remote 命令。示例：

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

## 发给同事

把仓库链接和这份安装教程发给同事：

- `TEAM_INSTALL_GUIDE.md`

同事只需要 clone 或下载仓库，然后在 Chrome 里选择这个目录进行加载。

## 后续更新插件

每次你修改插件后：

1. 更新代码。
2. 修改 `manifest.json` 里的 `version`，例如 `1.0.3` -> `1.0.4`。
3. 本机打开 `chrome://extensions/`，点插件卡片上的刷新按钮测试。
4. 提交并推送：

```bash
git add .
git commit -m "Update downloader"
git push
```

同事更新时：

```bash
git pull
```

然后打开 `chrome://extensions/`，点击插件卡片上的刷新按钮即可。

## 给不会 Git 的同事

如果同事不会 Git，可以让他们在仓库页面点击 Download ZIP。下载后解压，再在 Chrome 的 `加载已解压的扩展程序` 中选择解压后的插件目录。

注意：如果之后你更新了插件，不会 Git 的同事需要重新下载 ZIP 并替换本地目录。

## 常见问题

### 为什么不是双击安装？

Chrome 对本地 `.crx` 的限制比较严格。非商店安装在个人电脑上经常会被禁用或要求企业策略。团队内部最省事的免费方案就是开发者模式加载目录。

### 为什么更新后 Chrome 没变化？

确认三件事：

- 同事已经 `git pull` 或重新下载了最新 ZIP。
- Chrome 扩展管理页点击了插件卡片的刷新按钮。
- 页面本身刷新过，Instagram/Pinterest 已重新加载内容脚本。

### 可以用于 Edge / Brave / Arc 吗？

可以。它们都基于 Chromium，通常打开对应的扩展管理页后也支持加载已解压扩展。
