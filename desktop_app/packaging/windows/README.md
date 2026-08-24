# Windows NSIS package

在 Windows 10/11 或 `windows-latest` runner 上, 从 `desktop_app/` 运行:

```powershell
python -m pip install -r python/requirements.txt -r python/requirements-build.txt
pnpm install --frozen-lockfile
pnpm bundle:nsis
```

构建流程先生成 `perlerdrawing-sidecar-x86_64-pc-windows-msvc.exe`, 再通过 `src-tauri/tauri.bundle.conf.json` 把它作为 Tauri external binary 放入 NSIS 安装器. 安装界面支持英文和简体中文, 安装范围默认为当前用户. 正式公开发布前仍需配置 Windows 代码签名证书.
