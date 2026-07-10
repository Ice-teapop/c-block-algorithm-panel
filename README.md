# C 积木算法面板

面向墨尔本大学 `COMP10002` 与后续算法课程的本地学习软件。用户可以导入 C17 单文件源码，将其无损投影为语法积木，在代码与积木之间同步定位，并逐步扩展到确定性程序分析、算法识别和 AI 导师。

## 当前状态

**M0：工程骨架与受限运行器已完成。** 2026-07-10 从 `npm ci` 的干净依赖状态执行 `npm run accept:m0`，全部门禁通过。下一阶段是 M1：任意 C17 单文件的无损源码投影；当前版本尚未实现 C → 积木转换。

已建立：

- Electron + Vite + TypeScript 本地应用骨架
- 精确锁定的工具链与 lockfile 验证
- 20 个正常 C 金样本与 5 个资源/故障压力样本
- 逐字节 I/O、ASan + UBSan 与独立 `leaks` 双闸验证器
- macOS Seatbelt 最佳努力隔离、资源限制、进程组清理与原生信任确认
- 52 个单元测试、架构边界检查与 5 个真实 Electron IPC E2E

## 开发命令

```sh
npm ci
npm run verify:toolchain
npm run dev
npm test
npm run build
npm run verify:samples
npm run accept:m0
```

Electron 43 不再在 `npm ci` 的 `postinstall` 阶段下载原生二进制；首次执行 Electron 命令时会按需下载并校验。离线开发前应先在有网络或已有 Electron 缓存的环境启动一次。

## 安全边界

Electron renderer 不拥有 Node 或文件系统权限，只能经 preload 调用具名 IPC。C 编译与运行必须经过能力探测、输入校验、临时目录、进程组回收及资源限制。

macOS `sandbox-exec`/Seatbelt 是已弃用的最佳努力隔离机制，不等于 hostile-code 级沙箱。关键隔离能力不可用时，runner 必须 fail closed；只有 Electron main 针对当前请求显示原生确认框并获得用户确认后，才会为这一请求签发不可复用的内部授权。renderer 不能自行声明“已确认”。

## 不可协商原则

> 宁可显示“无法确定，保留原始 C”，也不丢字符、不静默改语义、不误贴算法标签。

完整工程契约、里程碑与验收条件见 [CLAUDE.md](./CLAUDE.md)。
