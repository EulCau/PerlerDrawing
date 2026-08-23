# Couple portrait v4 - 87 x 85 占用范围

这个版本专门提高脸部可读性. 它不是放大旧拼豆图, 而是先重新绘制高分辨率卡通母图中的五官, 再裁成近景并重新量化.

## 规格

- 网格: 87 x 87
- 实际主体范围: 87 x 85
- 拼板: 3 x 3, 每块 29 x 29
- 颜色数: 24
- 拼豆总数: 6181
- 前景阈值: 0.60

## 脸部调整

- 眼睛使用连续深色眼线, 浅色眼白和紧凑瞳孔.
- 眼镜使用完整且较粗的连续镜圈, 鼻梁和镜腿不再依赖细线.
- 鼻梁, 鼻翼和鼻底改为少量连续中深色块.
- 嘴部使用清楚的嘴缝和两级唇色.
- 减少下方衣服占比, 让脸部在相同 87 x 87 网格内占用更多格子.

## 文件

- `couple_portrait_87x85_v4_chart.png`: 完整坐标图纸.
- `couple_portrait_87x85_v4_preview_white.png`: 白底拼豆效果预览.
- `couple_portrait_87x85_v4_preview.png`: 透明背景预览.
- `couple_portrait_87x85_v4.csv`: 逐格颜色编号.
- `couple_portrait_87x85_v4_inventory.csv`: 颜色和数量表.
- `tiles/`: 9 张 29 x 29 分板图.
- `couple_portrait_87x85_v4_imagegen_prompt.txt`: 高分辨率母图的完整编辑提示词.
