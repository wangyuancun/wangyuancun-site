---
name: 公众号草稿搬运工
summary: 把写好的 Markdown 或带行内样式的 HTML 文章送进微信公众号草稿箱，正文图片和封面一起传；只创建草稿，不发布。
meta: WorkBuddy 技能 · 个人开发 · v0.1.0 已发布，v0.1.1 审核中
status: 已发布
order: 2
links:
  - label: GitHub 仓库
    href: https://github.com/wangyuancun/skills/tree/main/wechat-draft-porter
---

## 能做什么

- 一条链路走完：取 access_token → 上传正文图片 → 上传封面素材 → 新建或更新草稿。
- 只调草稿箱接口，不碰发布、群发和定时发表；最后一步始终由你在公众号后台点。

## 前置条件

- 自备公众号 AppID 与 AppSecret。
- 把本机出口 IP 加进公众号后台的 IP 白名单。

## 使用要点

- 凭证只从本地配置文件读取，不写在命令行或代码里。
- 改稿后可以按标题原地更新已有草稿，不会堆出多条。
