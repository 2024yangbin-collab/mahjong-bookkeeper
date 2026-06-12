# Botzone 比赛数据抓取器

`botzone-fetch.js` 用于抓取 Botzone 的公开比赛数据：

- 从 `globalmatchlist` 页面解析每场比赛的 `match_id`。
- 按需请求 `/match/<match_id>?lite=true` 获取单场 JSON。
- 输出完整 JSON，便于后续分析或归档。

## 快速使用

抓取默认游戏 `Chinese-Standard-Mahjong` 最近 5 场，并写入文件：

```bash
node botzone-fetch.js --limit 5 --out botzone-matches.json
```

只抓列表，不拉取单场日志：

```bash
node botzone-fetch.js --pages 2 --no-details --out botzone-list.json
```

指定游戏 ID：

```bash
node botzone-fetch.js --game 5e37dcf74019f43051e53201 --pages 2 --limit 20 --out botzone-matches.json
```

从某个旧比赛继续向过去翻页：

```bash
node botzone-fetch.js --startid <match_id> --pages 3 --out older-matches.json
```

## 输出结构

输出 JSON 的主要字段：

- `fetchedAt`：抓取时间。
- `game`：Botzone 游戏 ID。
- `pagesFetched`：实际抓取的列表页数量。
- `matches`：比赛数组。
  - `id`：比赛 ID。
  - `createTime`：创建时间。
  - `gameName`：游戏名。
  - `status`：比赛状态。
  - `playersText`：列表页里的玩家摘要文本。
  - `likeCount`：点赞数。
  - `viewUrl`：回放页面。
  - `detail`：单场 `lite=true` JSON 摘要，包含 `players`、`logs`、`initdata` 等。

## 注意

- 该工具只读取 Botzone 公开页面和公开 JSON，不登录、不绕过权限。
- 月度批量包入口是 `https://extra.botzone.org.cn/matchpacks/<GameName>-YYYY-M.zip`，但该域名在部分环境会遇到证书或 `502` 问题；逐场 `lite=true` 接口更稳定。
- 为避免请求过快，默认每场详情之间延迟 `250ms`，可用 `--delay-ms` 调整。
