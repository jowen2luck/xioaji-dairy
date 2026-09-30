# 幕布（Mubu）批量导出工具指南

本项目提供两种批量递归导出幕布文档的工具，支持将多级文件夹与文档完整下载并转为 Markdown 格式，同时完整保留文档元数据（创建日期、修改日期、大纲树层级、代办勾选与备注）。

---

## 方案一：Edge 浏览器控制台一键全自动打包（推荐首选 · 最简便）

无需配置 Python 环境，利用 Edge 当前已激活的登录态直接导出为 ZIP 压缩包。

### 操作步骤：
1. 用 Edge 浏览器打开目标页面：[https://mubu.com/app/folders/home/qr-kbvfkg0](https://mubu.com/app/folders/home/qr-kbvfkg0)
2. 按 `F12` 打开“开发人员工具”，切换到 **Console（控制台）** 选项卡。
3. 打开本地脚本文件 [export_mubu_console.js](export_mubu_console.js)，复制其全部内容。
4. 粘贴到控制台中，按 `Enter` 键执行。
5. 控制台将显示进度，扫描与抓取完成后，Edge 会自动弹出下载提示，下载 `美好生活_幕布全量备份_YYYYMMDD.zip`。

---

## 方案二：本地 Python 自动化导出脚本（直接写入硬盘）

如果您希望文档直接写入本地指定磁盘路径：

### 1. 获取登录凭据（Token）
- 在已登录幕布的 Edge 控制台中输入以下命令回车：
  ```javascript
  localStorage.getItem('token')
  ```
- 复制输出的一长串 Token 字符串（去掉首尾引号）。

### 2. 运行导出脚本
在终端中执行：
```bash
python scripts/mubu_export/export_mubu.py --token "你的Token"
```

可选参数：
- `--folder-id`：目标文件夹 ID（默认已预设为 `qr-kbvfkg0` 美好生活）
- `--folder-name`：目标文件夹名称（默认: `美好生活`）
- `--output`：输出目录路径（默认: `./mubu_export`）
- `--raw-json`：同时备份每个文档的原生大纲 JSON 定义文件
- `--delay`：请求防抖延时（默认: 0.12 秒，保护接口防限流）

---

## 导出文档格式效果

每个导出的 `.md` 文档顶部均包含 YAML 元数据头：

```markdown
---
title: "我的日记"
id: "7xK9sL2mP0"
created: "2023-05-10 14:20:00"
updated: "2023-08-22 09:30:15"
path: "美好生活/生活记录/我的日记"
mubu_url: "https://mubu.com/app/edit/home/7xK9sL2mP0"
---

# 我的日记

- 今日复盘与要点
  - [x] 完成重点工作
  - [ ] 晚间阅读
  > 备注：阅读《原则》第二章
```
