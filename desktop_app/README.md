# PerlerDrawing Desktop

跨平台拼豆图纸制作应用. 当前已经完成桌面基础壳, 编辑器核心模型, Canvas 编辑器, CSV 工作流, 高分辨率图片转换和完整交付导出. 图片处理包含边界连通去背景, Haar 小波结构简化, Lab 聚类, 预乘 alpha 栅格化和真实 MARD 色卡量化.

详细方案见 [docs/product-requirements-and-technical-plan.md](docs/product-requirements-and-technical-plan.md).
逐步实施状态见 [docs/implementation-plan.md](docs/implementation-plan.md).

## 本地运行

前端开发服务器:

```bash
pnpm install
pnpm dev
```

桌面窗口:

```bash
pnpm tauri dev
```

验证当前实现:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 目录

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

实现可选 Codex CLI 隔离任务, Windows NSIS, Arch Linux 软件包和 GitHub Actions 发布流水线. 安装包阶段会把 Python sidecar 构建为平台原生可执行文件, 不要求最终用户安装 Python.
