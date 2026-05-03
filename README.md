# TLB Partitioning Web App

有防护模式的 FPGA SSH 链路

## 启动

```bash
npm run dev
```

默认服务地址：

```text
http://127.0.0.1:5177
```

## 配置

`config/demo.config.json`，按实际 FPGA 地址和命令修改。

后端使用本机 `ssh` 命令连接 FPGA。建议使用本机 SSH agent 或私钥路径，不在前端保存密码。

## 当前范围

- FPGA 目标 allowlist
- SSH connect/disconnect
- 终端输出 SSE 推送
- 终端输入转发
