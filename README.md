# meihua-yishu · 可成长的 AI 梅花易数

本地 Web 应用：多法起卦、九步解卦、对话追问、案例复盘与个人记忆。  
**仅供娱乐与学习，不构成医疗、法律或投资建议。**

## 环境

- **Node.js 22+**
- npm 10+

## 快速开始

```bash
npm install
npm run dev:all
```

或分两个终端：

```bash
npm run dev:api
```

```bash
npm run dev
```

浏览器打开 `http://localhost:5173`。

## 配置 LLM（DeepSeek / Kimi 等）

1. 复制 `.env.example` 为 `.env`，或在应用 **设置** 页填写  
2. 预设：DeepSeek、Kimi（OpenAI 兼容）  
3. 点「测试连接」验证  
4. **无 Key 也可用**：起卦、算式、排盘、部分规则步骤  

Key 仅存本机（`config.local.json` / `.env`），不入库、不上传。

## 功能

- 起卦：报数（一/二/三）、年月日时、物数、声音、字占、丈尺/尺寸、端法、为人占  
- 解卦：固定九步看板，可插话、背景提问、同卦追问  
- 案例：回填实际、准确率与偏差步、统计与导出  
- 记忆：个人档案级记忆，不影响算式本身  

## 目录

| 路径 | 说明 |
|---|---|
| `packages/shared` | 类型与结构真值 |
| `packages/back_end` | API、起卦、解卦、存储 |
| `packages/front_end` | 界面 |
| `knowledge/` | 知识构建产物 |
| `examples/` | 脱敏样例 |

## 故障排查

| 现象 | 处理 |
|---|---|
| 502 / 连接失败 | 先启动 `npm run dev:api`（8787） |
| 无 Key | 仍可起卦；解卦部分步骤提示配置 |
| 测试连接失败 | 检查 Base URL、Key、模型名 |
| 权限 | Node 22；目录可写 |

## 致谢与版权

- 农历：`lunar-javascript`  
- 知识整理自《梅花易数》《周易》相关文献  
- **古籍原文属公有领域；现代整理、编排与软件以 MIT 发布（Copyright 2026 jxl）**

## 免责声明

本软件按「现状」提供，作者不作任何明示或暗示保证。  
**仅供娱乐与学习，不构成医疗、法律或投资建议。**

## License

MIT © 2026 jxl
