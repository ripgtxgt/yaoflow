# YaoFlow · 一事一卦

以六爻为引擎的决策反思系统。Monorepo（npm workspaces）：

- `packages/engine` — 确定性六爻引擎：起卦、64 卦、纳甲、八宫世应、六亲六神、历法层（日月年柱/节气/旬空/旺衰）、卦爻辞三语数据（繁/简/英）。零运行时依赖，45+ 单元测试（含古籍书证）。
- `apps/web` — Next.js 15 + Tailwind v4 双语站（/zh /en）：落地页 + 起卦交互 + 完整排盘展示。

## 开发

```bash
npm install          # 首次
npm test             # 引擎测试
npm run dev -w web   # http://localhost:3000
npm run build -w web # 生产构建
```

## 规则数据来源

- 卦爻辞原文：维基文库《周易》（公版），繁体照录，简体为 OpenCC 转换（乾字保护）。
- 纳甲/世应/六神：《卜筮正宗》（books/ 内 PDF 为主判据）、《京氏易传》。
- 英文今译：本项目原创编辑内容（参考公版 Legge 1882，未使用 Wilhelm/Baynes）。

## 文档

- `竞品调研报告-AI易经赛道.md` — 市场与竞品
- `MVP功能清单与排期.md` — 14 周排期、Gate 门槛、技术架构（§6 含 Stripe 合规姿势）
