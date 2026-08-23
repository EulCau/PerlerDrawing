# PerlerBeads

图片转拼豆图纸工作区. 默认色号标准为 MARD 221 v1. 新任务和修改任务都必须遵循 [AGENTS.md](AGENTS.md).

## 目录

```text
PerlerBeads/
├── AGENTS.md
├── palettes/
│   └── mard_221_v1.json
├── scripts/
│   ├── make_perler_pattern.py
│   └── refine_tempus_pattern.py
└── projects/
    ├── ciri_portrait/
    ├── couple_portrait/
    ├── tiamat_emblem/
    └── tempus_emblem/
```

每个项目中的 `masters/` 保存高分辨率母图, `patterns/` 保存各次图纸, `archives/` 保存交付压缩包. 旧版本均保留用于追溯.

图纸使用 `<name>_<size>_<version>` 命名. `size` 是最终拼豆占用位置的最小外接矩形, 按横向格数 x 纵向格数记录, 不是画布或拼板尺寸.

## 当前推荐版本

- Ciri 肖像: `projects/ciri_portrait/patterns/ciri_portrait_72x87_v6`.
- 合照: `projects/couple_portrait/patterns/couple_portrait_87x85_v4`, 更高细节版本为 `projects/couple_portrait/patterns/couple_portrait_116x108_v5`.
- 提亚马特徽章: `projects/tiamat_emblem/patterns/tiamat_emblem_26x45_v2`.
- 坦帕斯徽章: `projects/tempus_emblem/patterns/tempus_emblem_27x96_v2`.

## 通用转换示例

```bash
conda run -n perler-beads python scripts/make_perler_pattern.py --input projects/<name>/masters/<master>.png --output-root projects/<name>/patterns --name <name> --version v1 --title <title> --grid 100 --board-size 100 --colors 16 --palette-json palettes/mard_221_v1.json
```

该脚本在最终网格生成后测量拼豆外接矩形, 并自动创建规范名称的图纸目录. 去背景, 去外包边, 对称校正和结构简化仍应先在母图阶段完成, 并在量化后再次校验.
