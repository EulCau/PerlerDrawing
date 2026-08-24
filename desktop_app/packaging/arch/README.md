# Arch Linux package

从 `desktop_app/` 运行:

```bash
python -m pip install -r python/requirements.txt -r python/requirements-build.txt
pnpm install --frozen-lockfile
pnpm bundle:arch
cd packaging/arch
makepkg --cleanbuild --syncdeps
```

`bundle:arch` 会在本机的 `x86_64-unknown-linux-gnu` 环境中构建 PyInstaller sidecar 和 Tauri release binary, 然后把安装所需的两个可执行文件和图标复制到被忽略的打包输入文件. `makepkg` 不会访问 Codex 配置或用户图片.
