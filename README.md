# 房间声学核算服务（Room Acoustics Service）

面向音响与建声团队的常驻房间声学核算后端。接收房间几何与材料的倍频程吸声数据，回算各频带的混响时间、临界距离与 Schroeder 频率，并可叠加亥姆霍兹共振吸声器的效果。仅提供 HTTP 接口，无网页界面、无用户体系。

## 技术栈与模块划分

- **Node.js 20 + TypeScript + Fastify**，持久化用 **PostgreSQL 16**（`pg` 连接池）。
- 模块彼此独立，单向依赖：

| 模块 | 职责 |
| --- | --- |
| `src/constants.ts` | 全服务唯一的一套物理常数（Sabine 系数、倍频程中心频率、空气衰减 m 表、端部修正 δ、洛伦兹半宽、声速公式）。Sabine 与 Eyring 共用，绝不复制。 |
| `src/validation.ts` | 材料与几何校验：体积/面积必须为正，α ∈ [0,1]，频带键固定为 125–4000 Hz，共振器几何必须为正。所有违规以 `{field, reason}` 列表返回。 |
| `src/acoustics/reverberation.ts` | Sabine 与 Eyring 混响模型 + 临界距离 + Schroeder 频率。 |
| `src/acoustics/resonator.ts` | 亥姆霍兹共振器：有效颈长、共振频率、洛伦兹型附加吸声量。 |
| `src/acoustics/engine.ts` | 核算编排：把共振器吸声量折入各频带后重新过两套模型。 |
| `src/persistence/` | 持久化端口（`repository.ts`）+ PostgreSQL 实现（`postgres.ts`）+ 测试/开发用内存实现。 |
| `src/app.ts` / `src/index.ts` | Fastify 路由与进程入口。 |
| `src/presets/classroom.ts` | 预置的教室尺度示例。 |

## 物理约定（全部写死在 `src/constants.ts`）

- 倍频程中心频率：**125 / 250 / 500 / 1000 / 2000 / 4000 Hz**（钉死，不收别的键）。
- Sabine：**A = Σ Si·αi + 4·m·V**，**T60,S = 0.161·V / A**。系数 0.161 s/m 与 20 °C 声速（≈343 m/s）自洽。
- Eyring：**ᾱ = A_surface / S**，**T60,E = 0.161·V / (−S·ln(1 − ᾱ))**。分母是 **−S·ln(1−ᾱ)**——ln(1−ᾱ) 为负，若误写成正号，高吸声时两套模型会反向分叉且 T60 变负，测试已锁死该行为。
- 空气衰减系数 m（1/m，20 °C / 70% RH 代表值，固定取法）：125–500 Hz 为 0，1 kHz 0.002，2 kHz 0.004，4 kHz 0.009。
- 临界距离：**dc = √(A_eff / 16π) ≈ 0.057·√(V / T60)**（扩散场、无指向性声源）。
- Schroeder 频率：**f_s = 2000·√(T60 / V)**，T60 一律取本次核算结果（Sabine、Eyring 各自一份），不另设常数。
- 亥姆霍兹共振器：**L_eff = L + δ·√(S_n/π)**（δ = 1.7），**f0 = (c/2π)·√(S_n / (V_c·L_eff))**；声速 **c = 331.3·√(1 + T/273.15)**（20 °C ≈ 343.2 m/s），声速、波长、f0 三者同一温度。
- 共振器附加吸声量（洛伦兹型，半宽 γ = 0.1·f0，固定）：**A_r(f) = count · A_peak · γ² / ((f − f0)² + γ²)**，A_peak 默认 λ0²/2π，可用 `peakAbsorptionArea` 覆盖。附加量折入该频带 A_surface 后**重新**过 Sabine/Eyring，绝不在旧结果上手工减秒数。

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/presets/classroom` | 教室尺度示例请求体（可直接 POST 回 `/calculations`） |
| POST | `/calculations` | 校验 → 核算 → 持久化，返回 `201` 完整记录；非法输入返回 `400` 带原因的错误结构 |
| GET | `/calculations` | 核算记录列表（留痕） |
| GET | `/calculations/:id` | 单条记录；不存在返回 `404` |

### 请求体示例

```json
{
  "name": "classroom-a",
  "room": {
    "volume": 201.6,
    "surfaces": [
      { "name": "ceiling", "area": 63,
        "absorption": { "125": 0.30, "250": 0.55, "500": 0.75, "1000": 0.85, "2000": 0.80, "4000": 0.75 } }
    ]
  },
  "air": { "temperatureCelsius": 20 },
  "resonators": [
    { "name": "helmholtz-500hz", "neckArea": 0.007854, "neckLength": 0.05,
      "cavityVolume": 0.000694, "count": 100 }
  ]
}
```

### 错误结构（400）

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "request rejected: 1 validation problem(s) found",
    "details": [ { "field": "room.surfaces[0].absorption.500", "reason": "absorption coefficient must be within [0, 1], got 1.4" } ]
  }
}
```

### 响应要点

每个频带返回：`absorption{surface, air, resonators, total}`、`meanAlpha`，以及 `sabine` / `eyring` 各自的 `{t60, criticalDistance, schroederFrequency}`。完全无吸声的退化情形（所有 α = 0 且该频带 m = 0）下 `t60` 等为 `null`（物理上即无限大），任何情形都不会出现负的混响时间。

## 运行

### Docker（服务 + PostgreSQL 16 一键启动）

```bash
docker compose up --build
```

应用启动时自动建表（幂等），`db` 健康检查通过后 `app` 才启动。记录持久化在命名卷 `pgdata` 中。

### 本地开发

```bash
npm install
npm run dev                 # tsx watch，无 DATABASE_URL 时用内存存储并打印警告
DATABASE_URL=postgres://acoustics:acoustics@localhost:5432/acoustics npm run dev
```

### 测试

```bash
npm test                    # 单元 + API 测试（内存存储，无需数据库）
docker compose --profile test run --rm tests   # 含 PostgreSQL 集成测试的完整套件
```

测试覆盖的硬标准：教室示例各频带 T60 为正且中频在 0.x–2 s 量级；只增大吸声系数时各频带 T60 单调下降、临界距离上升；500 Hz 共振器显著压低 500 Hz 频带而相邻频带受影响小一个数量级以上；低 ᾱ 时 Sabine≈Eyring、高 ᾱ 时 Eyring 明显更短且永不为负；非法几何与越界系数一律以带原因的结构拒收；并发提交的多房间方案各自结果互不渗透。

## 快速验证

```bash
curl -s localhost:3000/presets/classroom | curl -s -X POST localhost:3000/calculations \
  -H 'content-type: application/json' -d @- | jq '.result.bands[] | {frequency, sabine: .sabine.t60, eyring: .eyring.t60}'
```
