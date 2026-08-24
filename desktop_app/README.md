# PerlerDrawing Desktop

跨平台拼豆图纸制作应用. 当前已经完成桌面基础壳, 编辑器核心模型, Canvas 编辑器, CSV 工作流, 高分辨率图片转换, 高级选区与对称编辑, 分板 PDF, 版本比较, 完整交付导出, 可选 Codex 分析和原生安装包流水线. 图片处理包含边界连通去背景, Haar 小波结构简化, Lab 聚类, 预乘 alpha 栅格化和真实 MARD 色卡量化.

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

Linux 启动时默认禁用 WebKitGTK 的 DMA-BUF 渲染器, 以避免部分 Wayland 和 NVIDIA 组合发生协议错误. 如需显式恢复该渲染器, 可在启动前设置 `WEBKIT_DISABLE_DMABUF_RENDERER=0`.

`v*` 标签会触发 `.github/workflows/desktop-release.yml`; 旧的 `app-v*` 格式继续兼容. 流水线等待 Windows NSIS 和 Arch pacman 包全部构建成功, 下载当前 workflow run 的产物, 生成 SHA-256 清单, 再创建或更新同名 GitHub Release. 更新日志按 `feat`, `fix`, `display`, `perf`, `security`, `refactor`, `build` 和 `docs` 分类, 比较范围是上一次正式发布至当前 tag.

tag 版本必须与 `package.json`, Tauri 配置和 PKGBUILD 的 `pkgver` 一致. 发布 `v0.1.0` 前应先把三处版本统一为 `0.1.0`; `pkgrel` 只作为 Arch 包修订号, 不写入 tag.

```bash
git tag v0.1.0
git push origin v0.1.0
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

## 当前状态

产品文档中的四个阶段均已完成. 画布保持紧凑 `Uint16Array` 文档模型, 使用静态网格, 脏矩形拼豆和交互叠层的多层 Canvas 渲染, 300 x 300 网格不会创建逐格 DOM 节点.
