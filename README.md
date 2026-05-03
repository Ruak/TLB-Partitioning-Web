# FPGA Console

当前只接入有防护模式的真实 SSH 链路。

## 启动

```powershell
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5177
```

默认目标在 `config/demo.config.json`：

```text
root@192.168.1.50
password: 174044
```

页面支持：

- 连接 / 断开 FPGA SSH
- 自由输入 SSH 命令
- 预设运行板上已有的 `./test_with`
- 清理 SSH ANSI 颜色控制码后显示终端输出
