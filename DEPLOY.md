# DEPLOY.md

TechSpar 当前生产环境的正式域名是：

- `https://stu.6bits.de/`

不要把 `aari.top` 当作正式验收入口。

---

## 1. 生产部署结构

生产环境主要由 3 个服务组成：

- `techspar-backend`
- `techspar-frontend`
- `techspar-caddy`

对应文件：

- `docker-compose.prod.yml`
- `scripts/deploy.sh`
- `scripts/compose.sh`
- `deploy/Caddyfile`
- `.env`

其中 `.env` 中会指定生产镜像标签，例如：

```env
TECHSPAR_BACKEND_IMAGE=techspar_techspar-backend:manual-deploy-knowledge-split
TECHSPAR_FRONTEND_IMAGE=techspar_techspar-frontend:latest
```

---

## 2. 现在推荐的部署方式

统一使用仓库内脚本：

```bash
./scripts/deploy.sh deploy frontend
./scripts/deploy.sh deploy backend
./scripts/deploy.sh deploy all
```

### 关键说明

`deploy.sh` 已经修复：

- `deploy frontend` 会先根据 `.env` 中的 `TECHSPAR_FRONTEND_IMAGE` **重新 build 前端镜像**，再重启前端容器。
- `deploy backend` 会先根据 `.env` 中的 `TECHSPAR_BACKEND_IMAGE` **重新 build 后端镜像**，再重启后端容器。
- `deploy all` 会同时重建前后端镜像，再整体更新服务。

也就是说，**现在不需要再手工执行 `docker build` 才能让线上更新代码**。

---

## 3. 常用命令

### 更新前端

```bash
cd /opt/TechSpar
./scripts/deploy.sh deploy frontend
```

### 更新后端

```bash
cd /opt/TechSpar
./scripts/deploy.sh deploy backend
```

### 整体更新

```bash
cd /opt/TechSpar
./scripts/deploy.sh deploy all
```

### 拉最新代码并更新

```bash
cd /opt/TechSpar
./scripts/deploy.sh update frontend
./scripts/deploy.sh update backend
./scripts/deploy.sh update all
```

### 查看状态

```bash
cd /opt/TechSpar
./scripts/deploy.sh status
```

### 查看日志

```bash
cd /opt/TechSpar
./scripts/deploy.sh logs frontend
./scripts/deploy.sh logs backend
./scripts/deploy.sh logs caddy
./scripts/deploy.sh logs all 200
```

### 重启服务

```bash
cd /opt/TechSpar
./scripts/deploy.sh restart frontend
./scripts/deploy.sh restart backend
./scripts/deploy.sh restart caddy
```

---

## 4. 前端发布检查清单

每次改前端后，建议至少检查这几项：

### 部署

```bash
cd /opt/TechSpar
./scripts/deploy.sh deploy frontend
./scripts/deploy.sh status
```

确认：

- `techspar-frontend` 是 `Up`
- `techspar-caddy` 是 `Up`
- `techspar-backend` 是 `Up`

### 线上页面

重点检查：

- `https://stu.6bits.de/`
- `https://stu.6bits.de/login`

如果需要完整验收，再登录后检查：

- Home
- Profile
- Review
- Knowledge
- Interview

---

## 5. 当前正式域名路由

当前 `deploy/Caddyfile` 只应该服务正式域名：

- `stu.6bits.de`

如果未来要切换正式域名，请先确认：

1. DNS 已正确指向当前机器
2. 80/443 确实打到当前 Caddy
3. 再修改 `deploy/Caddyfile`
4. 然后执行：

```bash
cd /opt/TechSpar
./scripts/deploy.sh deploy caddy
```

不要在未确认 DNS/证书链路时，把临时域名直接写进正式 Caddy 配置里。

---

## 6. 常见问题

### Q1: 为什么我改了前端代码，deploy 之后线上还是旧页面？

旧问题的根因是：

- 生产 compose 使用的是固定镜像标签
- 之前的部署流程只是在重启容器，没有真的重建镜像

现在 `scripts/deploy.sh` 已经修复了这个问题。

如果你仍然怀疑没更新上，可以检查：

```bash
cd /opt/TechSpar
./scripts/deploy.sh deploy frontend
curl -I https://stu.6bits.de/
```

必要时可进入容器或重新看静态资源 hash。

### Q2: 页面正常，但 HTTPS / 域名异常怎么办？

先检查：

- 正式访问的是否是 `stu.6bits.de`
- `deploy/Caddyfile` 是否只包含正式域名
- `./scripts/deploy.sh logs caddy 200`

### Q3: 想快速确认是不是新前端已经上线？

最直接的方法：

1. 打开 `https://stu.6bits.de/`
2. 看首页 Hero 是否是新版文案
3. 打开 `/login` 看是否是新版登录页

---

## 7. 建议的最小发布流程

### 前端改动后

```bash
cd /opt/TechSpar
git pull --ff-only
./scripts/deploy.sh deploy frontend
./scripts/deploy.sh status
```

然后人工验：

- 首页
- 登录页
- 一个登录后核心页面

### 后端改动后

```bash
cd /opt/TechSpar
git pull --ff-only
./scripts/deploy.sh deploy backend
./scripts/deploy.sh status
```

然后人工验：

- 登录
- API 是否正常
- 一个核心工作流是否正常

---

## 8. 备注

如果你修改了：

- `deploy/Caddyfile`
- `.env`
- 镜像标签策略
- `docker-compose.prod.yml`

记得把这份文档一起更新，不然未来一定会再次踩坑。
