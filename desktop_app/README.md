# PerlerDrawing Desktop

跨平台拼豆图纸制作应用的代码目录. 当前阶段只完成产品需求和技术方案, 尚未创建可运行的应用脚手架.

详细方案见 [docs/product-requirements-and-technical-plan.md](docs/product-requirements-and-technical-plan.md).

## 计划中的目录

```text
desktop_app/
├── docs/                 # 产品, 架构和发布文档
├── src/                  # React + TypeScript 前端
├── src-tauri/            # Tauri 2 / Rust 桌面外壳
├── python/               # 图片处理 sidecar 和现有算法适配层
├── packaging/
│   ├── arch/             # PKGBUILD 和 Arch Linux 打包文件
│   └── windows/          # Windows 安装器资源
└── tests/                # 单元, 集成和导出物验证测试
```

## 技术栈摘要

- 桌面外壳: Tauri 2 + Rust.
- 界面: React + TypeScript + Vite.
- 图纸编辑器: Canvas 2D, 不以大量 DOM 节点表示格子.
- 图片处理: Python 3.12 sidecar, 复用仓库现有拼豆转换逻辑.
- 默认色卡: `MARD 221 v1`.
- 目标平台: Windows 10/11 和 Arch Linux.

## 下一步

确认文档中的 MVP 边界后, 再创建应用脚手架和可执行的 GitHub Actions. 这样可以避免仓库中出现无法构建的占位 workflow.
