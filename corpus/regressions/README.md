# Fuzz regressions

M1 变异 fuzz 失败时，测试会把 fast-check 缩减后的最小源码写为 `m1-<sha256>.c`，并把 seed 与变异参数写入同名 `.json`。失败样本必须保留并转成永久回归测试，不可为恢复绿灯而删除。

当前目录没有已知失败样本。
