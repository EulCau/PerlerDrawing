# Couple portrait v2 - 87 x 81 占用范围

这个版本针对外轮廓不够锐利的问题重新处理, 原始卡通母图保持不变.

## 图纸参数

- 网格: 87 x 87
- 实际主体范围: 87 x 81
- 拼豆总数: 5616
- 颜色数: 24
- 拼板: 3 x 3, 每块 29 x 29
- 前景阈值: 0.60
- 外轮廓: 8 邻域内描边
- 轮廓颜色: P01, 当前调色板中最深的颜色
- 轮廓格数: 446

## 文件说明

- `couple_portrait_87x81_v2_chart.png`: 带坐标和颜色编号的完整图纸
- `couple_portrait_87x81_v2_preview_white.png`: 白底效果预览, 便于检查近黑色轮廓
- `couple_portrait_87x81_v2_preview.png`: 透明背景效果预览
- `couple_portrait_87x81_v2.csv`: 逐格颜色编号
- `couple_portrait_87x81_v2_inventory.csv`: 颜色表及每种颜色所需数量
- `tiles/`: 9 张 29 x 29 分板图
- `couple_portrait_87x81_v2_metadata.json`: 生成参数和结构化修改记录
- `couple_portrait_87x81_v2_imagegen_prompt.txt`: 卡通母图使用的完整生成提示词

## 锐化调整

前景阈值由 0.50 提高至 0.60, 减少边缘的半覆盖格. 外轮廓由 4 邻域改为 8 邻域, 让斜线和转角也获得连续的硬边. 轮廓统一改用 P01 近黑色, 避免棕灰色边界与肤色或衣服颜色混合.
