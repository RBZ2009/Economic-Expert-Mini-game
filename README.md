# Economic Expert Mini Game

一个面向经济启蒙和多人课堂互动的经济模拟小游戏。项目使用 Next.js、React、TypeScript、shadcn/ui 和自定义 WebSocket 服务构建，支持单人模式和多人房间模式。

## 功能概览

- 简单模式和专业模式
- 工人、企业家、投资者、政府官员等角色
- 回合制经济新闻、随机事件和政策影响
- 企业生产、库存、销售、定价和利润计算
- 工人就业、薪资、健康、必需品和职业成长
- 多人房间、实时同步和 WebSocket 互动
- 工作台式前端布局，适配桌面、平板和手机

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- WebSocket `ws`
- pnpm

## 本地开发

安装依赖：

```bash
pnpm install
```

启动开发服务：

```bash
pnpm dev
```

默认端口是 `5000`。也可以指定端口：

```bash
DEPLOY_RUN_PORT=5011 pnpm dev
```

## 生产构建

```bash
pnpm build
```

构建内容包括：

- Next.js 生产构建
- 自定义 Node/WebSocket 服务打包到 `dist/server.js`

## 生产启动

```bash
DEPLOY_RUN_PORT=5011 pnpm start
```

服务入口：

- HTTP: `/`
- WebSocket: `/ws/game`

## 常用检查

```bash
pnpm ts-check
pnpm lint
pnpm build
```

也可以直接使用本地二进制：

```bash
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/eslint src
./node_modules/.bin/next build
```

## 项目结构

```text
src/
├── app/                 Next.js App Router
├── components/game/     单人游戏和共享工作台组件
├── components/room/     多人房间和多人游戏界面
├── components/ui/       shadcn/ui 基础组件
├── contexts/            单人和多人状态上下文
├── game/                游戏规则、新闻、初始状态和教学内容
├── lib/                 WebSocket、房间和通用工具
├── types/               游戏类型定义
├── ws-handlers/         WebSocket 服务端处理
└── server.ts            自定义 Next.js + WebSocket 服务入口
```

## 部署说明

推荐使用 Node 20 运行生产服务：

```bash
NODE_ENV=production DEPLOY_RUN_PORT=5011 node dist/server.js
```

线上可以使用 systemd 守护进程，并通过 Caddy 或 Nginx 反向代理到 `127.0.0.1:5011`。当前生产域名为：

```text
https://game.joeren.fun
```
