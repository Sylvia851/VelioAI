# Velio AI — 知识库对话前端

基于 Vue 3 + TypeScript + Vite 构建的 RAG 知识库 AI 对话界面，搭配 [VelioAI-server](https://github.com/Sylvia851/VelioAI-server) 后端使用。

用户可上传文档（PDF / Word / Excel / Markdown / TXT），通过自然语言对话向 AI 提问，AI 基于文档内容进行检索增强生成（RAG），并以流式打字机效果实时返回 Markdown 格式的回答。

![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

## 功能特性

- **AI 对话窗口** — 标准聊天气泡布局，暗色科幻风格 UI
- **SSE 实时流式输出** — 基于 Server-Sent Events 的打字机效果，逐字渲染
- **Markdown 渲染** — 支持标题、列表、表格、代码高亮（highlight.js）、引用等
- **文件附加发送** — 选择 / 拖放文件后附加到消息，点击发送时一并上传并限定 AI 仅基于该文件回答
- **对话历史管理** — 后端持久化存储，侧边栏浏览 / 切换 / 删除历史对话
- **多轮上下文** — 自动携带最近 10 条消息作为 LLM 历史上下文
- **拖放上传** — 拖入文件到对话区域即可附加，覆盖层动画提示
- **来源引用** — AI 回答末尾展示检索到的文档片段来源
- **主题适配滚动条** — 消息区与侧边栏均使用与暗色主题匹配的自定义滚动条
- **路由守卫** — 基于 Token 的登录鉴权，未登录自动跳转

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | Vue 3 (`<script setup>` + Composition API) |
| 语言 | TypeScript 6 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| UI 组件 | Element Plus（按需自动导入） |
| 状态管理 | Pinia |
| HTTP | Axios（REST）+ 原生 Fetch（SSE 流式） |
| Markdown | marked + marked-highlight + highlight.js + DOMPurify |
| 路由 | Vue Router 5 |

## 项目结构

```
src/
├── views/
│   ├── FilesView.vue        # AI 对话主页面（聊天 + 文件上传 + 侧边栏）
│   ├── HomeView.vue         # 首页
│   └── LoginView.vue        # 登录页
├── composables/
│   ├── useChat.ts           # SSE 流式对话（fetch + ReadableStream）
│   ├── useConversations.ts  # 对话 CRUD（后端 API）
│   └── useFileUpload.ts     # 文件上传 + 索引
├── stores/
│   └── auth.ts              # 认证状态（Pinia）
├── utils/
│   ├── request.ts           # Axios 实例 + 拦截器
│   └── markdown.ts          # Markdown 渲染管线（marked → hljs → DOMPurify）
├── router/
│   └── index.ts             # 路由配置 + 鉴权守卫
└── main.ts                  # 应用入口
```

## 快速开始

### 环境要求

- Node.js >= 18
- 后端服务 [VelioAI-server](https://github.com/Sylvia851/VelioAI-server) 运行在 `localhost:8000`

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/Sylvia851/VelioAI.git
cd VelioAI

# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev
```

开发模式下 Vite 会自动将 `/api` 请求代理到 `http://localhost:8000`。

### 构建生产版本

```bash
npm run build
npm run preview   # 预览构建产物
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 后端 API 基础路径 | `/api/v1` |

## 核心交互流程

```
用户选择/拖放文件 → 附加为 pendingFile（不立即上传）
       ↓
用户输入消息 → 点击发送
       ↓
上传文件 → 后端索引 → 返回 doc_id
       ↓
发起 SSE 流式请求（携带 metadata_filter: {doc_id}）
       ↓
后端向量检索（限定该文件）→ LLM 流式生成
       ↓
前端逐 chunk 渲染 Markdown → 打字机效果
       ↓
流结束 → 展示来源引用
```

## 许可证

MIT
