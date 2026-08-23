# Tempus emblem v2 - 对称无包边版

这个版本直接在拼豆网格上进行确定性修正, 不重新生成图案. 左右形状与颜色关于第 50 列严格镜像, 火焰去除深棕和橄榄棕包边, 剑身中线压缩为单格.

## 规格

- 图纸网格: 100 x 100.
- 拼板: 1 块 100 x 100.
- 实际主体范围: 27 x 96 格.
- 主体位置: 第 3-98 行, 第 37-63 列.
- 对称轴: 第 50 列.
- MARD 色数: 8.
- 拼豆总数: 1478.
- 背景: 留空.

## 结构调整

- 左右所有对应格使用相同 MARD 色号.
- 火焰不再使用 B26, G8 和 G14 作为外围包边.
- 火焰仅保留 A20, A26, G5 和 G6 四个金色层级.
- 剑身和剑柄的深灰 M15 中线固定为 1 格宽.
- 中线位于第 50 列, 红色三角镶嵌处按原设计中断.
- 上方火焰头, 上方剑尖和下方尖端均以单格收束.

## MARD 用量

| 色号 | 屏幕参考 HEX | 数量 |
| --- | --- | ---: |
| A20 | #F9D666 | 213 |
| A26 | #FFC734 | 250 |
| F15 | #D50527 | 5 |
| G5 | #E7B34E | 538 |
| G6 | #E3A014 | 124 |
| H4 | #878787 | 125 |
| H15 | #9AA6A6 | 150 |
| M15 | #747D7A | 73 |

## 文件

- `tempus_emblem_27x96_v2_chart.png`: 带坐标和 MARD 色号的完整图纸.
- `tempus_emblem_27x96_v2_preview_white.png`: 白底拼豆效果预览.
- `tempus_emblem_27x96_v2_preview.png`: 透明背景拼豆预览.
- `tempus_emblem_27x96_v2.csv`: 逐格 MARD 色号.
- `tempus_emblem_27x96_v2_inventory.csv`: MARD 色号, HEX 和用量.
- `tiles/tempus_emblem_27x96_v2_board_r1_c1.png`: 单块 100 x 100 拼板图.
- `tempus_emblem_27x96_v2_master.png`: 简化后的透明高分辨率母图.
- `tempus_emblem_27x96_v2_metadata.json`: 对称轴, 中线和去包边记录.
- `tempus_emblem_27x96_v2_palette_mard_221_v1.json`: 完整 MARD 221 v1 参考色卡.
- `tempus_emblem_27x96_v2_imagegen_prompt.txt`: 母图重绘使用的提示词.
