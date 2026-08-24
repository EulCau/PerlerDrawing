# PerlerDrawing Desktop

跨平台拼豆图纸制作应用. 当前已经完成桌面基础壳, 编辑器核心模型, Canvas 编辑器, CSV 工作流, 高分辨率图片转换, 完整交付导出, 可选 Codex 分析和原生安装包流水线. 图片处理包含边界连通去背景, Haar 小波结构简化, Lab 聚类, 预乘 alpha 栅格化和真实 MARD 色卡量化.

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
conda run -n perler-beads python -m pip install -r python/requirements.txt
conda run -n perler-beads pnpm tauri dev
```

验证当前实现:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package:check
```

开发构建继续通过 `perler-beads` 环境运行仓库内的 Python sidecar. 正式安装包使用 PyInstaller 单文件 sidecar, 最终用户不需要安装 Python.

## 安装包

Windows runner 上构建 NSIS:

```bash
python -m pip install -r python/requirements.txt -r python/requirements-build.txt
pnpm bundle:nsis
```

Arch Linux 上构建 pacman 包:

```bash
python -m pip install -r python/requirements.txt -r python/requirements-build.txt
pnpm bundle:arch
cd packaging/arch
makepkg --cleanbuild --noconfirm
```

`app-v*` 标签会触发 `.github/workflows/desktop-release.yml`, 分别在 Windows 和 Arch 环境构建 sidecar 与安装包, 生成 SHA-256 清单后创建 GitHub Release.

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

实现选区, 变换, 对称绘制, 分板打印, PDF 和大画布性能优化.
