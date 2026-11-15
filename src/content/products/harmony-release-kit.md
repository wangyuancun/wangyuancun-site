---
name: 鸿蒙上架与签名流程模板
summary: 把鸿蒙应用从工程骨架、签名到上架华为应用市场的整条链路整理成可复用的模板仓，附一份按真实踩坑顺序写成的流程文档。
meta: 开源模板 · 个人维护
status: 开源
order: 3
links:
  - label: GitHub 仓库
    href: https://github.com/wangyuancun/harmony-release-kit
---

## 仓库里有什么

- 工程骨架：只有一个可编译的最小页面，业务页面自己替换。
- 签名脚本：`signing/` 下只有脚本，没有任何证书、私钥和口令。
- 截图文案工具。
- 一份按真实踩坑顺序写成的流程文档。

## 从 clone 到跑通

1. 装 Release 版 DevEco Studio，不要 Beta。
2. 改包名、应用名、图标（全部是 `【】` 占位符，没有真实信息）。
3. 编译出未签名 HAP：`hvigorw --mode module -p product=default assembleHap`。
4. 在 AGC 申请发布证书与 Profile，这一步人工，需要实名账号。
5. 签名出 `.app` 再上传：`signing/sign-release.sh` 加 `assembleApp`。

只跑模拟器的话，第 4、5 步可以跳过，未签名 HAP 直接 `hdc install`。
