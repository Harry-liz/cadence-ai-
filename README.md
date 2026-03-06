# Cadence AI

中洲湾 C Future City 的 AI 导购助手，提供美食推荐、活动一览、穿搭建议、会员中心等功能。

**技术栈**：React 19 + TypeScript + Vite / Python + FastAPI / OpenRouter API

---

## 本地运行

### 前置要求

- Node.js 18+
- Python 3.10+

---

### 1. 启动后端（FastAPI）

```bash
cd backend

# 创建并激活虚拟环境
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS / Linux

# 安装依赖
pip install -r requirements.txt

# 配置 API Key
cp .env.example .env
# 用编辑器打开 backend/.env，填入你的 OpenRouter API Key：
# OPENROUTER_API_KEY=sk-or-...

# 启动服务（默认端口 8000）
uvicorn main:app --reload
```

### 2. 启动前端（Vite）

```bash
# 在项目根目录，新开一个终端
npm install
npm run dev
```

### 3. 打开浏览器

- 前端地址：`http://localhost:5173`
- 后端 API 文档：`http://localhost:8000/docs`

> Vite 会自动把 `/api/*` 请求代理到后端，无需额外配置。

---

## 移动端预览（推荐）

1. 按住 `Ctrl` 点击终端里的网址打开浏览器
2. 按 `F12` 打开开发者工具
3. 点击左上角 **Toggle Device Emulation**（手机图标）
4. 在 Dimensions 选择 **iPhone 12 Pro**
5. 按 `F11` 全屏，沉浸式体验

---

## 项目结构

```
cadence-ai/
├── backend/                # FastAPI 后端
│   ├── routers/            # 各功能路由（chat / dining / style / events / member）
│   ├── services/           # OpenRouter API 封装
│   ├── data/               # 商场静态数据
│   ├── main.py             # 应用入口
│   └── requirements.txt
├── public/                 # 静态图片资源
├── src/
│   ├── App.tsx             # 主界面与所有模块 UI
│   └── services/
│       └── geminiService.ts  # 前端 API 客户端
└── vite.config.ts
```
