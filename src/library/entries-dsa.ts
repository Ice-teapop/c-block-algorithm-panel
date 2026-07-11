import type { LibraryEntryInput } from "./contracts.js";

export const DSA_LIBRARY_ENTRIES: readonly LibraryEntryInput[] = [
  e(
    "data.dynamic-array",
    "data-structure-dictionary",
    "数组与动态数组",
    "连续存储支持 O(1) 随机访问和良好缓存局部性；动态数组通过容量扩张支持尾部追加。",
    [
      "固定数组长度在创建时确定。动态数组维护 data、length 和 capacity，length 不能超过 capacity。",
      "扩容通常按常数倍增长，使连续 append 获得摊还 O(1)；中间插入和删除仍需移动 O(n) 元素。",
    ],
    {
      aliases: ["array", "vector", "dynamic array"],
      related: ["c.arrays", "algorithms.amortized"],
    },
  ),
  e(
    "data.linked-list",
    "data-structure-dictionary",
    "链表",
    "链表用节点指针连接元素，已知位置旁插入可为 O(1)，但按索引访问需要 O(n) 遍历。",
    [
      "单链表节点保存 next，双链表还保存 prev。头指针、尾指针和空表状态必须维持一致不变量。",
      "每个动态节点需要明确释放；删除节点时先保存后继，再断链和 free，避免丢失剩余列表。",
    ],
    {
      aliases: ["linked list", "singly linked", "doubly linked"],
      example: c(
        "单链表节点",
        "typedef struct Node {\n  int value;\n  struct Node *next;\n} Node;",
      ),
      related: ["c.structs", "c.dynamic-memory"],
    },
  ),
  e(
    "data.stack",
    "data-structure-dictionary",
    "栈",
    "栈遵循后进先出，核心操作 push、pop 和 peek 通常为 O(1)。",
    [
      "可用动态数组的尾部或链表头实现。数组实现局部性更好，链表实现按节点增长但有分配开销。",
      "函数调用栈、括号匹配、深度优先搜索和表达式求值都体现栈语义。pop 前必须检查空栈。",
    ],
    {
      aliases: ["stack", "LIFO"],
      related: ["c.recursion", "examples.parentheses", "algorithms.graph-traversal"],
    },
  ),
  e(
    "data.queue",
    "data-structure-dictionary",
    "队列与环形缓冲区",
    "队列遵循先进先出；环形数组通过 head、tail 和 size 避免每次出队移动所有元素。",
    [
      "enqueue 在尾部加入，dequeue 从头部取出。必须定义 head/tail 指向元素还是空槽，并始终使用同一约定。",
      "广度优先搜索依赖队列。固定容量实现要区分空与满，常用 size 字段或保留一个空槽。",
    ],
    {
      aliases: ["queue", "FIFO", "circular buffer"],
      related: ["algorithms.graph-traversal", "data.deque"],
    },
  ),
  e(
    "data.deque",
    "data-structure-dictionary",
    "双端队列",
    "双端队列在两端执行插入和删除，可用环形数组或分块结构实现。",
    [
      "它能同时模拟栈和队列，也是滑动窗口单调队列的基础。两端索引更新要正确处理模运算和空结构。",
      "随机访问能力取决于实现；不要因为名字含 queue 就假设只能从一端读取。",
    ],
    { aliases: ["deque", "double-ended queue"], related: ["data.queue", "algorithms.amortized"] },
  ),
  e(
    "data.hash-table",
    "data-structure-dictionary",
    "哈希表",
    "哈希表把键映射到桶，平均查找、插入和删除可为 O(1)，最坏情况仍可能是 O(n)。",
    [
      "冲突可用链地址法或开放寻址解决。负载因子升高会增加冲突，因此需要扩容和重新散列。",
      "正确性要求相等键具有相同哈希。开放寻址删除通常需要 tombstone，不能直接把槽恢复为空。",
    ],
    {
      aliases: ["hash table", "hash map", "load factor", "collision"],
      related: ["algorithms.amortized", "data.set"],
    },
  ),
  e(
    "data.set",
    "data-structure-dictionary",
    "集合与映射",
    "集合保存唯一键，映射保存键值对；底层可选哈希表或平衡搜索树。",
    [
      "哈希实现偏向平均常数时间但无自然顺序；树实现通常 O(log n) 并支持有序遍历和范围查询。",
      "选择结构前明确是否需要顺序、最坏界、重复计数和自定义键相等规则。",
    ],
    { aliases: ["set", "map", "dictionary"], related: ["data.hash-table", "data.bst"] },
  ),
  e(
    "data.binary-tree",
    "data-structure-dictionary",
    "二叉树",
    "二叉树节点最多有左右两个子节点，可递归定义高度、大小和遍历。",
    [
      "前序适合复制结构，中序在 BST 中产生有序键，后序适合释放子树。层序遍历使用队列。",
      "树高决定递归深度。退化链的高度为 O(n)，不能把所有二叉树操作都写成 O(log n)。",
    ],
    {
      aliases: ["binary tree", "preorder", "inorder", "postorder"],
      related: ["data.bst", "algorithms.graph-traversal"],
    },
  ),
  e(
    "data.bst",
    "data-structure-dictionary",
    "二叉搜索树",
    "BST 维持左子树键较小、右子树键较大的顺序不变量，操作复杂度取决于高度。",
    [
      "普通 BST 在有序输入下可能退化为链。AVL 或红黑树通过旋转保持 O(log n) 高度。",
      "删除有两个孩子的节点时可用中序后继或前驱替换，但必须维持父子指针和所有权。",
    ],
    {
      aliases: ["BST", "binary search tree", "AVL", "red-black tree"],
      related: ["data.binary-tree", "algorithms.binary-search"],
    },
  ),
  e(
    "data.heap",
    "data-structure-dictionary",
    "堆与优先队列",
    "二叉堆用完全二叉树和堆序性质支持 O(1) 查看极值、O(log n) 插入和删除极值。",
    [
      "数组下标 i 的孩子常为 2i+1 和 2i+2。上浮和下沉只沿一条根到叶路径。",
      "建堆可自底向上 O(n)，不是对每个元素逐次插入的 O(n log n)。堆不保证整体有序。",
    ],
    {
      aliases: ["heap", "priority queue", "heapify"],
      related: ["algorithms.sorting", "algorithms.shortest-path"],
    },
  ),
  e(
    "data.graph",
    "data-structure-dictionary",
    "图与表示",
    "图由顶点和边组成，可有向或无向、加权或无权；邻接表和邻接矩阵适合不同密度。",
    [
      "邻接表空间 O(V+E)，适合稀疏图；邻接矩阵空间 O(V²)，边查询 O(1) 且适合稠密图。",
      "实现必须明确顶点编号、平行边、自环和无向边是否存两次。算法前先确认权重和方向假设。",
    ],
    {
      aliases: ["graph", "adjacency list", "adjacency matrix", "vertex", "edge"],
      related: ["algorithms.graph-traversal", "algorithms.shortest-path"],
    },
  ),
  e(
    "data.union-find",
    "data-structure-dictionary",
    "并查集",
    "并查集维护不相交集合，find 查询代表元，union 合并集合。",
    [
      "路径压缩和按秩或大小合并使一系列操作接近常数时间，严格界为反 Ackermann 量级。",
      "并查集擅长动态连通性和 Kruskal，但不直接提供两点路径或支持任意删除边。",
    ],
    {
      aliases: ["union find", "disjoint set", "DSU"],
      related: ["algorithms.mst", "algorithms.amortized"],
    },
  ),
  e(
    "data.trie",
    "data-structure-dictionary",
    "Trie 前缀树",
    "Trie 按字符沿边存储键，查询和插入时间与键长度相关，而不是键数量的对数。",
    [
      "节点需要终止标记区分完整单词和前缀。固定字母表数组查询快但占空间，映射孩子更节省稀疏节点。",
      "适合前缀检索和字典匹配；若只需精确查找，哈希表通常更简单。",
    ],
    { aliases: ["trie", "prefix tree"], related: ["data.hash-table", "c.strings"] },
  ),

  e(
    "algorithms.big-o",
    "algorithms-complexity",
    "Big-O、Theta 与 Omega",
    "渐近记号描述输入规模增长时的上界、紧确界和下界，忽略常数但不替代实际测量。",
    [
      "先定义规模变量 n，再数主导操作。O(n²+n) 可简化为 O(n²)，但不同变量如 V 和 E 不能随意合并。",
      "最坏、平均和最好情况必须明确。实测毫秒受硬件和输入分布影响，应与渐近分析分开。",
    ],
    {
      aliases: ["Big O", "Theta", "Omega", "asymptotic complexity"],
      related: ["execution.metrics", "algorithms.amortized"],
    },
  ),
  e(
    "algorithms.amortized",
    "algorithms-complexity",
    "摊还分析",
    "摊还复杂度给出一串操作的平均成本上界，不依赖输入概率分布。",
    [
      "动态数组偶尔扩容 O(n)，但倍增策略让 n 次 append 总成本 O(n)，所以单次摊还 O(1)。",
      "聚合法、记账法和势能法是常见证明工具。摊还 O(1) 不代表每一次操作都常数时间。",
    ],
    {
      aliases: ["amortized analysis", "potential method"],
      related: ["data.dynamic-array", "data.union-find"],
    },
  ),
  e(
    "algorithms.correctness",
    "algorithms-complexity",
    "正确性、循环不变量与终止",
    "算法证明需要说明前置条件、后置条件、循环不变量的初始化、保持和退出含义。",
    [
      "循环不变量在每轮开始或结束时保持，根据选定位置一致证明。退出条件与不变量共同推出后置条件。",
      "递归证明使用基本情况和归纳步骤，并指出子问题严格变小，从而保证终止。",
    ],
    {
      aliases: ["correctness proof", "loop invariant", "termination"],
      related: ["c.loops", "c.recursion"],
    },
  ),
  e(
    "algorithms.linear-search",
    "algorithms-complexity",
    "线性搜索",
    "线性搜索逐个检查元素，适用于无序数据，最坏时间 O(n)，额外空间 O(1)。",
    [
      "循环不变量可表述为目标不在已检查前缀中。找到后立即返回位置，否则遍历结束返回未找到标记。",
      "小数组或一次性搜索时，排序成本可能不值得；不要为了使用二分查找先无条件排序。",
    ],
    {
      aliases: ["linear search", "sequential search"],
      example: c(
        "返回索引或 -1",
        "for (size_t i = 0; i < length; i++) {\n  if (values[i] == target) return (long)i;\n}\nreturn -1;",
      ),
      related: ["algorithms.binary-search", "examples.binary-search"],
    },
  ),
  e(
    "algorithms.binary-search",
    "algorithms-complexity",
    "二分查找",
    "二分查找在已排序区间中每次排除一半候选，时间 O(log n)，但边界约定必须一致。",
    [
      "推荐维护半开区间 [low, high)。中点用 low + (high-low)/2，避免 low+high 溢出。",
      "查找第一个满足条件的位置比只找等值更通用。证明不变量时说明答案始终位于候选区间。",
    ],
    {
      aliases: ["binary search", "lower bound"],
      example: c("半开区间中点", "size_t mid = low + (high - low) / 2;"),
      related: ["data.dynamic-array", "examples.binary-search"],
    },
  ),
  e(
    "algorithms.sorting",
    "algorithms-complexity",
    "排序算法总览",
    "选择排序、插入排序、归并排序、快速排序和堆排序在时间、空间、稳定性和输入敏感性上不同。",
    [
      "插入排序对小型或近乎有序数据有效；归并排序稳定且最坏 O(n log n) 但需额外空间；堆排序原地且最坏 O(n log n)。",
      "快速排序平均 O(n log n)，不良枢轴会退化 O(n²)。库实现的比较器必须一致且无溢出。",
    ],
    {
      aliases: ["sorting", "merge sort", "quick sort", "heap sort", "insertion sort"],
      related: ["algorithms.stability", "std.qsort-bsearch", "examples.sort-benchmark"],
    },
  ),
  e(
    "algorithms.stability",
    "algorithms-complexity",
    "排序稳定性",
    "稳定排序保持相等键元素的原相对顺序，在多关键字分阶段排序中非常重要。",
    [
      "算法名称不能单独保证具体实现稳定，例如快速排序通常不稳定。比较器返回相等时，稳定性才有意义。",
      "若记录含原始序号，可把序号作为第二关键字显式获得确定顺序，但这改变比较规则和数据需求。",
    ],
    {
      aliases: ["stable sort", "sorting stability"],
      related: ["algorithms.sorting", "std.qsort-bsearch"],
    },
  ),
  e(
    "algorithms.divide-conquer",
    "algorithms-complexity",
    "分治",
    "分治把问题拆成独立子问题，递归求解后合并；复杂度常用递推式分析。",
    [
      "归并排序的子问题各为一半，合并线性，因此 T(n)=2T(n/2)+O(n)=O(n log n)。",
      "子问题重叠严重时，纯分治会重复计算，应考虑动态规划或记忆化。",
    ],
    {
      aliases: ["divide and conquer", "recurrence"],
      related: ["c.recursion", "algorithms.dynamic-programming"],
    },
  ),
  e(
    "algorithms.greedy",
    "algorithms-complexity",
    "贪心算法",
    "贪心每一步选择当前看来最优的决策，只有在可证明贪心选择性质时才保证全局最优。",
    [
      "常用证明包括交换论证、割性质和保持可扩展解。不应只因为样例通过就断言贪心正确。",
      "活动选择、Huffman 编码、Kruskal 和 Prim 是典型场景；0/1 背包通常不能按价值密度贪心。",
    ],
    {
      aliases: ["greedy algorithm", "exchange argument"],
      related: ["algorithms.mst", "algorithms.dynamic-programming"],
    },
  ),
  e(
    "algorithms.dynamic-programming",
    "algorithms-complexity",
    "动态规划",
    "动态规划利用重叠子问题和最优子结构，保存状态结果以避免指数级重复计算。",
    [
      "先定义状态含义，再写转移、基本状态和计算顺序。状态维度和每个状态转移成本共同决定复杂度。",
      "自顶向下记忆化只访问需要状态；自底向上更容易控制顺序和压缩空间。",
    ],
    {
      aliases: ["dynamic programming", "DP", "memoization", "tabulation"],
      example: c(
        "一维状态转移",
        "dp[0] = 0;\nfor (size_t i = 1; i <= n; i++) {\n  dp[i] = dp[i - 1] + cost[i];\n}",
      ),
      related: ["algorithms.divide-conquer", "examples.knapsack"],
    },
  ),
  e(
    "algorithms.backtracking",
    "algorithms-complexity",
    "回溯与剪枝",
    "回溯逐步构造候选，违反约束时撤销选择；最坏搜索空间通常是指数级。",
    [
      "递归帧应明确选择、递归和撤销三个阶段。忘记撤销共享状态会污染兄弟分支。",
      "剪枝必须保证被移除分支不可能含有效解。启发式只改变搜索顺序，通常不改变最坏复杂度。",
    ],
    { aliases: ["backtracking", "pruning"], related: ["c.recursion", "algorithms.correctness"] },
  ),
  e(
    "algorithms.graph-traversal",
    "algorithms-complexity",
    "BFS 与 DFS",
    "邻接表上的 BFS 和 DFS 都是 O(V+E)；BFS 用队列求无权最短边数，DFS 用递归或显式栈深入探索。",
    [
      "必须维护 visited，通常在入队或首次发现时标记，避免同一顶点重复加入。非连通图需要从每个未访问顶点重新启动。",
      "DFS 适合连通分量、拓扑和环检测；深图递归可能栈溢出，可改用显式栈。",
    ],
    {
      aliases: [
        "BFS",
        "DFS",
        "breadth first search",
        "depth first search",
        "graph traversal",
        "queue",
        "stack",
      ],
      related: ["data.graph", "data.queue", "data.stack"],
    },
  ),
  e(
    "algorithms.shortest-path",
    "algorithms-complexity",
    "最短路径",
    "无权图用 BFS；非负权图用 Dijkstra；存在负权时需要 Bellman-Ford 等允许负边的算法。",
    [
      "Dijkstra 在有负边时不正确。使用优先队列时可重复入队，并在弹出过期距离时跳过。",
      "最短距离与实际路径不同；要重建路径需保存 predecessor，并处理不可达顶点。",
    ],
    {
      aliases: ["shortest path", "Dijkstra", "Bellman-Ford"],
      related: ["data.graph", "data.heap"],
    },
  ),
  e(
    "algorithms.mst",
    "algorithms-complexity",
    "最小生成树",
    "MST 在连通无向加权图中连接全部顶点并最小化总权重，Kruskal 和 Prim 是常用算法。",
    [
      "Kruskal 按边权排序并用并查集避免成环；Prim 从一个顶点扩张跨越当前割的最轻边。",
      "MST 不等于最短路径树，也不直接适用于有向图。非连通图得到最小生成森林。",
    ],
    {
      aliases: ["minimum spanning tree", "MST", "Kruskal", "Prim"],
      related: ["data.union-find", "algorithms.greedy"],
    },
  ),
  e(
    "algorithms.topological-sort",
    "algorithms-complexity",
    "拓扑排序",
    "拓扑排序给出 DAG 的线性顺序，使每条有向边都从较早顶点指向较晚顶点。",
    [
      "Kahn 算法维护入度为零队列；DFS 方法按完成时间逆序。两者都是 O(V+E)。",
      "输出顶点少于 V 表示存在有向环。存在多个合法顺序时，不应假设唯一结果。",
    ],
    {
      aliases: ["topological sort", "DAG", "Kahn"],
      related: ["data.graph", "algorithms.graph-traversal"],
    },
  ),
  e(
    "algorithms.numeric-stability",
    "algorithms-complexity",
    "数值稳定性",
    "浮点算法除渐近复杂度外还要考虑舍入误差、消去和溢出，数学等价公式可能有不同数值行为。",
    [
      "累计大量不同量级数值会丢失低位精度；求根公式也可能发生灾难性消去。",
      "定义容差时考虑绝对和相对尺度。需要精确计数或索引时优先使用合适的整数类型。",
    ],
    { aliases: ["numerical stability", "floating point error"], related: ["std.math", "c.types"] },
  ),

  e(
    "examples.test-matrix",
    "examples",
    "边界测试矩阵",
    "为每个算法列出最小、典型、边界、重复、逆序和错误倾向输入，并记录预期输出。",
    [
      "数组算法至少检查空输入、单元素、全部相等、已排序、逆序和极端值。带指针接口还要定义 NULL 与 length=0 的契约。",
      "测试条目保存输入与预期；运行轨迹和性能只作为证据，不能替代输出断言。",
    ],
    {
      example: text(
        "测试矩阵",
        "empty -> []\nsingle -> [7]\nduplicates -> [2,2,2]\nreverse -> [5,4,3,2,1]",
      ),
      related: ["onboarding.run", "algorithms.correctness"],
    },
  ),
  e(
    "examples.binary-search",
    "examples",
    "案例：二分查找",
    "在已排序数组中实现半开区间二分查找，并用不存在、首元素、末元素和重复元素验证边界。",
    [
      "维护 [low, high) 作为仍可能包含答案的区间。若 values[mid] < target，移动 low；否则移动 high。",
      "循环结束时 low 是 lower_bound 位置，再检查 low < length 且值相等。复杂度 O(log n)，空间 O(1)。",
    ],
    {
      example: c(
        "lower_bound 核心",
        "while (low < high) {\n  size_t mid = low + (high - low) / 2;\n  if (values[mid] < target) low = mid + 1;\n  else high = mid;\n}",
      ),
      related: ["algorithms.binary-search", "c.arrays"],
    },
  ),
  e(
    "examples.sort-benchmark",
    "examples",
    "案例：排序基准",
    "用相同随机种子生成不同规模的随机、已排序和逆序数组，对插入排序与 O(n log n) 排序做重复中位数比较。",
    [
      "每次运行使用输入副本，避免第二个算法收到已排序数据。结果先验证有序且元素多重集不变，再记录时间。",
      "小 n 时插入排序可能更快，这不推翻其 O(n²) 增长；绘制规模与操作计数更容易观察趋势。",
    ],
    { related: ["algorithms.sorting", "execution.benchmark"] },
  ),
  e(
    "examples.parentheses",
    "examples",
    "案例：括号匹配",
    "扫描表达式时把左括号压栈，遇到右括号检查栈顶类型并弹出，最终栈必须为空。",
    [
      "右括号出现时空栈表示提前关闭；类型不匹配立即失败；扫描结束非空表示缺少右括号。",
      "时间 O(n)，辅助空间 O(n)。测试空串、单类嵌套、交错错误和多类正确嵌套。",
    ],
    {
      example: c(
        "匹配判定片段",
        "if (top == 0 || stack[top - 1] != expected_open) return false;\ntop--;",
      ),
      related: ["data.stack", "algorithms.correctness"],
    },
  ),
  e(
    "examples.bfs",
    "examples",
    "案例：无权图 BFS",
    "从起点入队并立即标记 visited，逐层处理邻居，同时保存 distance 和 predecessor。",
    [
      "邻接表上每个顶点和边只处理常数次，总时间 O(V+E)。无向边存两次仍是同一渐近界。",
      "不可达顶点距离保持 sentinel。重建路径时从目标沿 predecessor 回溯，再反转。",
    ],
    { related: ["algorithms.graph-traversal", "data.queue", "algorithms.shortest-path"] },
  ),
  e(
    "examples.knapsack",
    "examples",
    "案例：0/1 背包",
    "状态 dp[i][capacity] 表示只考虑前 i 个物品时的最大价值，选择拿或不拿当前物品。",
    [
      "二维转移时间 O(nC)、空间 O(nC)。若压缩为一维，capacity 必须从大到小遍历，避免同一物品重复使用。",
      "容量 C 是数值大小，因此这是伪多项式算法。用贪心价值密度不能保证 0/1 背包最优。",
    ],
    { related: ["algorithms.dynamic-programming", "algorithms.greedy"] },
  ),
  e(
    "examples.branch-scenario",
    "examples",
    "案例：真实分支与模拟",
    "为 if 的 true/false 分支分别准备可复现输入，真实运行后用轨迹验证目标分支，而不是强制改变条件结果。",
    [
      "如果没有能到达目标分支的合法输入，只能使用标记清楚的教学模拟。模拟结果不写入运行时间历史。",
      "案例同时保存 stdin、参数、期望输出和目标边 ID；源码变化后旧边 ID 需要重新绑定。",
    ],
    { related: ["execution.real-vs-simulation", "canvas.branching"] },
  ),
  e(
    "examples.memory-lifecycle",
    "examples",
    "案例：链表内存生命周期",
    "构造、遍历和销毁链表时记录每次 malloc 的所有权转移，并确保所有退出路径最终 free。",
    [
      "插入失败时不能丢失已构造前缀。销毁循环先保存 next，再 free 当前节点，最后把头指针设为 NULL。",
      "测试空表、单节点、多节点和中途分配失败。运行成功不代表没有泄漏，需要结合分析证据。",
    ],
    {
      example: c(
        "安全销毁",
        "while (head != NULL) {\n  Node *next = head->next;\n  free(head);\n  head = next;\n}",
      ),
      related: ["data.linked-list", "c.dynamic-memory"],
    },
  ),
];

interface Options {
  readonly aliases?: readonly string[];
  readonly related?: readonly string[];
  readonly example?: LibraryEntryInput["example"];
}

function e(
  id: string,
  branchId: LibraryEntryInput["branchId"],
  title: string,
  summary: string,
  details: readonly string[],
  options: Options = {},
): LibraryEntryInput {
  return {
    id,
    branchId,
    title,
    summary,
    details,
    aliases: options.aliases,
    relatedEntryIds: options.related,
    example: options.example,
  };
}

function c(caption: string, code: string) {
  return { language: "c", caption, code } as const;
}

function text(caption: string, code: string) {
  return { language: "text", caption, code } as const;
}
