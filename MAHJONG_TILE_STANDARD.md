# 麻将牌图案标准

本项目长期使用 `majiang.world` 的 42 张唯一牌面作为标准图案来源。

## 来源

- 网站：`https://majiang.world`
- 字符串规则：`https://majiang.world/article/麻将牌的字符串表示方法`
- Markdown 图片规则：`https://majiang.world/article/麻将Markdown表示方法`
- 图片资源基址：`https://el.eeurl.com`
- 机器可读映射：`mahjong_tiles.json`

## 42 张唯一牌面

`majiang.world` 的标准编码如下：

| 类别 | 编码 | 牌面 |
| --- | --- | --- |
| 万子 | `a1`-`a9` | 一万、二万、三万、四万、五万、六万、七万、八万、九万 |
| 索子 | `b1`-`b9` | 一索、二索、三索、四索、五索、六索、七索、八索、九索 |
| 筒子 | `c1`-`c9` | 一筒、二筒、三筒、四筒、五筒、六筒、七筒、八筒、九筒 |
| 风牌 | `d1`-`d4` | 东风、南风、西风、北风 |
| 三元牌 | `e1`-`e3` | 红中、发财、白板 |
| 花牌 | `f1`-`f8` | 春、夏、秋、冬、梅、兰、竹、菊 |

合计：`9 + 9 + 9 + 4 + 3 + 8 = 42`。

## 和 Botzone 编码的对应

Botzone 的国标麻将编码和 `majiang.world` 编码不同，以后 UI 展示或牌图渲染时按下表转换：

| Botzone | majiang.world | 说明 |
| --- | --- | --- |
| `W1`-`W9` | `a1`-`a9` | 万子 |
| `T1`-`T9` | `b1`-`b9` | 索子/条子 |
| `B1`-`B9` | `c1`-`c9` | 筒子/饼子 |
| `F1`-`F4` | `d1`-`d4` | 东、南、西、北 |
| `J1`-`J3` | `e1`-`e3` | 中、发、白 |
| `H1`-`H8` | `f1`-`f8` | 春、夏、秋、冬、梅、兰、竹、菊 |

## 图片 URL 模板

已在 `majiang.world` 文章中验证的模板：

- 默认 jpg：`https://el.eeurl.com/jpg/mj/s2/{code}.jpg`
- 立体 gif：`https://el.eeurl.com/gif/mj/s1/stand/{code}.gif`
- SVG：`https://el.eeurl.com/svg/mj/s3/{code}.svg`

示例：

- `a1` 一万：`https://el.eeurl.com/jpg/mj/s2/a1.jpg`
- `e3` 白板：`https://el.eeurl.com/jpg/mj/s2/e3.jpg`
- `f8` 菊：`https://el.eeurl.com/jpg/mj/s2/f8.jpg`

## 使用约定

1. 以后项目内的麻将牌展示只使用这 42 张唯一牌面。
2. 业务逻辑可以继续使用 Botzone 编码，但展示层必须转换为 `majiang.world` 编码。
3. 不再混用 `/riichi/img/*.gif` 的日麻资源作为标准牌图。
4. 未确认授权前，不把远程图片批量下载进仓库；先记录 URL 模板和编码映射。
