# AGENTS.md

## 项目概览

**麻将馆记账本** 是一个单文件静态网页应用（`index.html`）。无后端、无构建步骤、无包管理器、无测试套件。

数据通过浏览器 `localStorage` 存储，键名如下：
- `mj_accounting_records`
- `mj_last_backup_date`
- `mj_auto_backup_enabled`

## 开发

通过 HTTP 提供静态文件服务（浏览器自动化测试需要；无头环境下 `file://` 不可靠）：

```bash
python3 -m http.server 8080
```

在浏览器中打开 http://localhost:8080/index.html。

也可直接在浏览器中打开 `index.html` 进行快速手动测试。

## 代码检查 / 测试 / 构建

本仓库无 linter、自动化测试或构建命令。验证方式为在浏览器中手动操作，或通过 HTTP 检查（例如 `curl http://localhost:8080/index.html`）。

## Cursor Cloud 专用说明

- **无需安装依赖** — 更新脚本为无操作（`true`）。除非项目新增包管理配置，否则不要添加 `npm install` 等命令。
- **必需运行时服务**：在 8080 端口（或任意空闲端口）启动静态 HTTP 服务。在仓库根目录执行 `python3 -m http.server 8080`。
- **页面加载时自动备份**：开启自动备份后，若当日尚未备份，应用可能在页面加载约 1.5 秒后触发 JSON 文件下载。自动化浏览器测试需考虑此行为。
- **删除确认**：删除记录会弹出 `confirm()` 对话框。
- **核心冒烟测试**：打开仪表盘，点击 **记一笔收入**，输入金额并保存，确认今日/本月收入在仪表盘上已更新。
