# 国标麻将 AI baseline

这个目录提供一个可运行的 Botzone `Chinese-Standard-Mahjong` baseline：

- 入口：`mahjong_ai/main.py`
- Botzone zip 入口：`mahjong_ai/__main__.py`
- 测试：`mahjong_ai/test_main.py`

## 当前策略

第一版目标是“合法、稳定、可迭代”：

1. 读取 Botzone JSON 输入。
2. 根据历史 `requests` / `responses` 重建自己的手牌。
3. 前两轮初始化返回 `PASS`。
4. 摸牌请求 `2 <tile>` 时，选择一张牌输出 `PLAY <tile>`。
5. 其他请求全部 `PASS`，暂不主动 `HU` / `CHI` / `PENG` / `GANG`，避免没有番型计算器时误判。

出牌启发式：

- 先枚举每张可弃牌，计算弃牌后的标准型向听数。
- 向听数相同时，计算下一巡能降低向听数的进张种类数。
- 仍然相同时，保留对子/刻子潜力和同花搭子，优先丢孤立牌、单张字牌和低连接价值牌。

## 本地运行

```bash
echo '{"requests":["0 0 2","1 0 0 0 0 W1 W2 W3 W7 W8 W9 B1 B2 B3 T1 T5 F1 J1","2 T6"],"responses":["PASS","PASS"]}' \
  | python3 -m mahjong_ai.main
```

输出示例：

```json
{"response": "PLAY F1"}
```

## 测试

```bash
python3 -m unittest mahjong_ai.test_main
```

## 打包提交到 Botzone

Botzone 多文件 Python 包需要 zip 根目录有 `__main__.py`：

```bash
cd mahjong_ai
zip -r ../mahjong_ai_botzone.zip __main__.py main.py
cd ..
```

然后在 Botzone 的 My Bots 中上传 `mahjong_ai_botzone.zip`。

## 下一步增强

1. 接入国标麻将番型计算器，允许安全 `HU`。
2. 用 `botzone-fetch.js` 抓取公开对局，统计高手 bot 在相似局面下的出牌。
3. 增加防守模块：根据弃牌和明刻判断危险牌。
4. 加入 `PENG` / `CHI` / `GANG` 合法动作评估。
5. 增加七对、十三幺、组合龙等特殊型向听数。
