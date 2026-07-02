# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 经济模拟游戏项目说明

### 项目概述
这是一个帮助小朋友们理解市场运作方式的经济模拟游戏，支持 2-10 名玩家。

### 多终端模式架构
游戏支持两种模式：
- **单终端模式**：多人共用一台设备，轮流操作
- **多终端模式**：每人一部设备，通过 WebSocket 实时同步

### 核心文件结构
```
src/
├── app/
│   └── page.tsx           # 游戏主页面（支持模式切换）
├── components/
│   ├── game/              # 单终端游戏组件
│   │   ├── SetupPage.tsx
│   │   ├── GamePage.tsx
│   │   └── ...
│   └── room/              # 多终端房间组件
│       ├── HomePage.tsx   # 首页（创建/加入房间）
│       ├── LobbyPage.tsx  # 等待大厅
│       └── MultiplayerGamePage.tsx  # 多终端游戏界面
├── contexts/
│   ├── GameContext.tsx    # 单终端游戏状态管理
│   └── RoomContext.tsx   # 多终端房间状态管理
├── lib/
│   ├── room-manager.ts    # 房间管理模块（服务器端）
│   └── ws-client.ts      # WebSocket 客户端工具
├── ws-handlers/
│   └── game.ts           # WebSocket 游戏处理器
└── server.ts             # 自定义服务器（HTTP + WS 共用 5000 端口）
```

### 游戏参数系统

**社会全局参数**：
- 社会稳定度 (0-100)
- GDP 总量
- 通货膨胀率
- 就业率
- 基尼系数
- 股市指数

**个人参数**：
- 现金
- 幸福度 (0-100)
- 健康值 (0-100)
- 社会地位
- 疲劳度
- 资产（投资、房产、机器）

### 职业与身份系统

**职业（互斥，只能选一个）**：
- **员工**：每轮工作1次，过度工作有惩罚
- **企业家**：雇佣员工、购买机器、生产商品、定价销售
- **投资者**：专业投资能力，投资种类更丰富
- **政府官员**：制定税率、发放补贴、维护社会稳定

**身份属性（可叠加，所有人都默认有）**：
- **消费者**：购买生活必需品
- **投资者**：购买股票/债券后获得
- **房东**：购买房产后获得

### 核心游戏机制

**工作限制系统**：
- 每种职业有最大工作次数限制
- 过度工作会降低效率、增加疲劳度
- 疲劳度影响健康和幸福度
- 员工职业每轮最多工作1次

**必需品强制消耗**：
- 每轮自动消耗食品、日用品等必需品
- 必需品不足会扣健康和幸福度
- 无房产会影响幸福度

**投资系统**：
- 股票（高风险高收益，随股市波动）
- 债券（稳定收益）
- 黄金（抗通胀）
- 银行存款（最稳定）

**企业系统（企业家专属）**：
- 雇佣员工（需支付工资）
- 购买机器（提高产能，无需长期工资）
- 生产商品并在市场销售
- 权衡：人工 vs 机器

**政府调控**：
- 设定税率（影响所有玩家收入）
- 发放补贴（可针对特定群体）
- 高税率可能影响社会稳定

**交易系统**：
- 物品换物品
- 物品换现金
- 现金换物品
- 现金转账
- 所有交易需对方确认

**回合结算**：
- 必需品消耗
- 投资收益计算
- 租金收入发放
- 疲劳恢复
- 市场价格调整
- 股市波动

## 开发记录

### 2024-XX-XX 功能增强

**增强的投资面板**：
- 添加经济周期信息显示（增长期、稳定期、衰退期、过热期）
- 投资者专属经济形势详情（其他玩家只能看到基本信息）
- 投资者学习系统：技能等级、学习点数、培训费用
- 投资技能加成显示

**完善的企业家功能**：
- 企业信息概览（员工、机器、原材料、声誉、利润率）
- 生产线管理（雇佣/解雇员工、购买/升级机器）
- 原材料采购系统（小额/批量采购）
- 生产与销售（生产商品、查看库存、设置售价）
- 市场运营（小额/大幅广告提升声誉）
- 成本收益分析（员工成本、原材料成本、机器折旧、预计收益）

**增强的政府官员功能**：
- 政府信息概览（国库、社会稳定度、公共基金）
- 税收政策（税率调节、快速预设方案：低税10%/中税20%/高税30%）
- 补贴政策（全民/员工/企业定向补贴）
- 社会稳定措施（维稳活动、公共服务建设、基础设施建设）
- 政府能力展示（执政经验、决策能力）
- 税率建议提示（根据当前社会稳定度和税率给出建议）

**UI 优化**：
- 住房面板：退租/出售按钮、住房效果信息展示、布局优化
- 操作面板：添加溢出滚动处理 (`max-h-[calc(100vh-400px)] overflow-y-auto`)
- 所有职业面板：统一使用卡片布局，渐变背景色区分职业
- 市场购买面板：过滤掉住房商品（住房在专门面板处理）
- 我的物品面板：过滤掉住房商品
- 市场行情面板：过滤掉住房商品

**企业管理逻辑修复**：
- 雇佣员工现在正确增加产能（每人 +3 件/轮）
- 购买机器增加产能（每台 +5 件/轮）
- 升级机器增加产能（每台 +3 件/轮）
- 生产逻辑修复：正确计算实际产出（取 min(请求数量, 原材料, 产能)）
- **产能限制严格检查**：如果请求数量超过产能，返回错误而非偷偷限制
- 生产商品进入公司库存（inventory），而非玩家物品
- 添加 BUY_MATERIALS handler（¥50/单位）
- 添加 FIRE_EMPLOYEE handler
- 添加 UPGRADE_MACHINE handler（¥15,000）
- 添加 ADVERTISE handler（小额 +5 声誉，大额 +30 声誉）
- 添加产品销售功能：企业家可设置售价出售公司库存商品（¥40-120/件，10%市场税）
- 添加生产类型选择：日用品/食品/娱乐/奢侈品
- 添加 SET_PRODUCTION_TYPE handler
- 添加 SELL_COMPANY_PRODUCT handler
- 前端添加生产数量输入框和产能限制显示

**政府官员功能修复**：
- 政府官员国库余额初始化（¥100,000）
- 修改 ISSUE_SUBSIDY 支持定向补贴（all/worker/entrepreneur）
- 添加 STABILIZE_SOCIETY handler
- 添加 BUILD_PUBLIC_SERVICE handler
- 所有政府操作使用国库余额而非玩家现金