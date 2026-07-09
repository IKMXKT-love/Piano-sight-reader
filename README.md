# 🎹 Piano Sight Reader

> 移动端二次元单机琴房 — 让音乐学习变得有趣而优雅。

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-FFC131?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri 2.0" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-1.77-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Android-SDK-green?style=for-the-badge&logo=android&logoColor=white" alt="Android" />
</p>

---

## ✨ 功能特点

- **🎯 实时音高识别** — 通过手机麦克风实时捕捉钢琴物理按键频率，利用 [pitchfinder](https://github.com/peterkhayes/pitchfinder) 进行精准音高判定，无需任何外部设备。
- **🎼 React 渲染谱面** — 基于 [VexFlow](https://www.vexflow.com/) 引擎在前端动态绘制标准五线谱，所见即所弹。
- **📱 Tauri 2.0 移动端容器** — 使用 Rust 编写的轻量级原生容器，相比 Electron 体积更小、性能更优，支持 Android / iOS 双端部署。
- **🎙️ WebRTC + AudioSettings 麦克风权限打通** — 结合 Capacitor 原生桥接，优雅处理移动端音频采集权限，实现低延迟音频输入。
- **🎨 二次元风格 UI** — TailwindCSS 构建的精致视觉界面，沉浸式练琴体验。
- **📴 完全离线可用** — 单机运行，不需要网络连接，保护你的隐私。

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│              React 前端                  │
│   Vite · TypeScript · VexFlow · Tailwind │
├─────────────────────────────────────────┤
│              Capacitor                   │
│        (WebRTC / 麦克风桥接)             │
├─────────────────────────────────────────┤
│           Tauri 2.0 (Rust)              │
│    原生容器 · 插件系统 · 系统API          │
├─────────────────────────────────────────┤
│         Android / iOS 系统层             │
│    AudioSettings · 文件系统 · 渲染       │
└─────────────────────────────────────────┘
```

## 🚀 快速开始

### 环境要求

在开始之前，请确保你的开发环境满足以下要求：

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| [Node.js](https://nodejs.org/) | ≥ 18.x | JavaScript 运行时 |
| [Rust](https://www.rust-lang.org/) | ≥ 1.77.2 | Tauri 后端编译链 |
| [Android SDK](https://developer.android.com/studio) | Build-tools 35 / 36 | Android 构建工具 |
| [Android NDK](https://developer.android.com/ndk) | ≥ 27.x | Rust 交叉编译到 Android 所需 |

### 安装 Node.js

前往 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本安装，或使用包管理器：

```powershell
# Windows (winget)
winget install OpenJS.NodeJS.LTS
```

```bash
# macOS (Homebrew)
brew install node
```

### 安装 Rust 编译链

```bash
# 安装 Rustup（Rust 官方工具链管理器）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装完成后，添加 Android 交叉编译目标
rustup target add aarch64-linux-android armv7-linux-androideabi
```

### 安装 Android SDK & NDK

**方式一：通过 Android Studio（推荐）**

1. 下载并安装 [Android Studio](https://developer.android.com/studio)
2. 打开 Android Studio → **Settings** → **Languages & Frameworks** → **Android SDK**
3. 在 **SDK Platforms** 中勾选所需的 Android 版本
4. 在 **SDK Tools** 中勾选：
   - **Android SDK Build-Tools 35** / **36**
   - **NDK (Side by side)** — 选择最新 27.x 版本
   - **Android SDK Command-line Tools**
   - **CMake**（可选但推荐）

**方式二：通过命令行（sdkmanager）**

```bash
# 安装 Build-tools
sdkmanager "build-tools;35.0.0" "build-tools;36.0.0"

# 安装 NDK
sdkmanager "ndk;27.0.12077973"
```

### 配置环境变量

请确保以下环境变量已正确设置：

```powershell
# Windows PowerShell - 示例（请根据实际安装路径调整）
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\27.0.12077973"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

```bash
# macOS / Linux - 添加到 ~/.bashrc 或 ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973
export JAVA_HOME=$(/usr/libexec/java_home)
```

### 验证环境

```bash
node --version      # ≥ 18.x
rustc --version     # ≥ 1.77.2
cargo --version     # 应与 rustc 匹配
echo $ANDROID_HOME  # 应指向 Android SDK 目录
```

---

### 克隆并运行项目

```bash
# 1. 克隆仓库
git clone <your-repo-url> PianoSightReader
cd PianoSightReader/Piano

# 2. 安装前端依赖
npm install

# 3. 开发模式（Web 端预览）
npm run dev

# 4. Tauri 开发模式（桌面端）
npm run tauri:dev

# 5. Android 初始化（首次运行）
npm run tauri:android:init

# 6. Android 开发 / 构建
npm run tauri:android:dev     # 连接真机调试
npm run tauri:android:build   # 构建 APK
```

## 📁 项目结构

```
Piano/
├── public/                   # 静态资源 & 示范曲目视频
├── src-tauri/               # Tauri (Rust) 后端
│   ├── src/
│   │   ├── lib.rs           # 插件注册 & 核心逻辑
│   │   └── main.rs          # 移动端入口
│   ├── gen/android/         # Android 原生工程
│   ├── icons/               # 应用图标
│   └── Cargo.toml           # Rust 依赖配置
├── capacitor.config.ts      # Capacitor 原生桥接配置
├── index.html               # SPA 入口 HTML
├── package.json             # Node.js 项目配置
└── vite.config.ts           # Vite 构建配置
```

## 🛠️ 核心依赖

| 分类 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React 18 + TypeScript 5.6 | UI 构建 |
| 构建工具 | Vite 6 | 前端打包 |
| 谱面渲染 | VexFlow 4 | 五线谱绘制 |
| 音高检测 | pitchfinder 2 | 麦克风音频频率分析 |
| 原生容器 | Tauri 2.0 (Rust) | 跨平台原生打包 |
| 原生桥接 | Capacitor 7 | 移动端权限 & 系统 API |
| 样式 | TailwindCSS 3 | 原子化 CSS |

## 📝 开发命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建前端产物 |
| `npm run tauri:dev` | Tauri 桌面开发模式 |
| `npm run tauri:android:dev` | Tauri Android 开发（需连接设备） |
| `npm run tauri:android:build` | 构建 Android APK |
| `npm run cap:sync` | 同步 Capacitor 配置到原生工程 |

---

<p align="center">
  Made with ❤️ by Piano Sight Reader Team
</p>
