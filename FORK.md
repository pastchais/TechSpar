# TechSpar Fork Notes

这个仓库当前按 **fork + upstream 同步 + custom 长期魔改** 的方式维护。

## Branch layout

- `upstream/main`：原始上游分支（远端 upstream）
- `upstream-main`：本仓库内保留的一份上游镜像基线
- `custom`：当前公开的魔改主线
- `feature/*`：后续功能开发分支

## Remote layout

- `origin` → 当前 fork 仓库
- `upstream` → 原始项目仓库

## Recommended workflow

### 同步上游

```bash
git fetch upstream

git checkout upstream-main
git merge --ff-only upstream/main
git push origin upstream-main
```

### 将上游更新并入魔改主线

```bash
git checkout custom
git merge upstream-main
git push origin custom
```

### 开发新功能

```bash
git checkout custom
git pull --ff-only origin custom
git checkout -b feature/your-feature
```

开发完成后：

```bash
git checkout custom
git merge --no-ff feature/your-feature
git push origin custom
```

## Public repo hygiene

以下内容建议只保留本地，不直接提交到公开仓库：

- `.env`
- `.runtime/`
- `.secrets/`
- `deploy/Caddyfile`
- `data/runtime_settings.json`
- 私有数据库、用户数据、简历与画像数据

仓库中保留的公开示例文件：

- `.env.production.example`
- `deploy/Caddyfile.example`
- `docker-compose.prod.yml`

## Notes

- 如果 Token / PAT 曾在聊天或终端中明文暴露，建议立刻吊销并重新生成。
- 长期主线优先使用 `merge`，尽量避免对已公开历史做 `rebase` 重写。
