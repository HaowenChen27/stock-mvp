# Stock Strength MVP

一个最小可用的盯盘工具原型，专注于：

- 股票 / ETF 强弱打分
- 走势标签（强势上攻 / 强势震荡 / 冲高回落 / 横盘整理 / 走弱下行）
- 板块强弱面板
- 成对比较（中国电建 vs 中国西电、半导体 ETF vs 光伏 ETF）
- AkShare 实时行情同步（通过雪球单票实时接口）
- 自动定时同步、页面自动刷新、分数变化高亮

## 技术栈

- Node.js 原生 HTTP 服务
- 前端原生 HTML / CSS / JS
- Python + AkShare 拉实时行情

## 启动

### 1. 创建 Python 虚拟环境并安装依赖

```bash
cd stock-mvp
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

### 2. 启动服务

```bash
node server.mjs
```

或者在项目根目录：

```bash
npm run dev:stock-mvp
```

### 3. 打开页面

<http://localhost:3088>

## 当前功能

- `POST /api/sync`：通过 AkShare 同步实时行情
- 页面按钮：手动同步 / 自动同步
- 页面底部表单：手动覆盖行情，验证评分模型
- `POST /api/market`：手工喂数据

## 评分逻辑

当前版本已弱化对以下字段的依赖：

- 量比
- 竞价额
- 成交额

当前评分更依赖：

- 涨跌幅
- 高开幅度
- 日内价格位置
- 分时轨迹
- 板块联动

## 当前默认标的

- 中国电建（601669）
- 中国西电（601179）
- 半导体ETF（512480）
- 光伏ETF（515790）

## 后续建议

1. 增加自定义自选池
2. 增加飞书提醒
3. 增加“为什么判强/弱”的解释面板
4. 把评分模型拆成独立模块
