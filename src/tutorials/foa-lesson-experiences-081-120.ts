import type { FoaLessonExperience } from "./foa-contracts.js";
import { defineFoaLessonExperience } from "./foa-lesson-experience.js";

const URL = Object.freeze({
  wg14: "https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf",
  pythonTutor: "https://pythontutor.com/articles/c-cpp-visualizer.html",
  seiMemory:
    "https://wiki.sei.cmu.edu/confluence/display/c/MEM04-C.%2BBeware%2Bof%2Bzero-length%2Ballocations",
  visualgoList: "https://visualgo.net/en/list?mode=LL",
  openDsa: "https://opendsa-server.cs.vt.edu/ODSA/Books/Everything/html/",
  openDsaList: "https://opendsa-server.cs.vt.edu/ODSA/Books/Everything/html/ListIntro.html",
  usfcaAlgorithms: "https://www.cs.usfca.edu/~galles/visualization/Algorithms.html",
  visualgoBst: "https://visualgo.net/en/bst?mode=BST",
  openDsaTrees: "https://opendsa-server.cs.vt.edu/ODSA/Books/Everything/html/BinaryTreeIntro.html",
  princetonBst:
    "https://algs4.cs.princeton.edu/lectures/keynote/31ElementarySymbolTables%2B32BinarySearchTrees-2x2.pdf",
  posixFseek: "https://pubs.opengroup.org/onlinepubs/9799919799/functions/fseek.html",
  posixFgets: "https://pubs.opengroup.org/onlinepubs/9799919799/functions/fgets.html",
  posixFscanf: "https://pubs.opengroup.org/onlinepubs/9799919799/functions/fscanf.html",
  posixFclose: "https://pubs.opengroup.org/onlinepubs/9799919799/functions/fclose.html",
  princetonMerge: "https://algs4.cs.princeton.edu/22mergesort/index.php",
  openDsaHeap: "https://opendsa-server.cs.vt.edu/ODSA/Books/Everything/html/Heaps.html",
  visualgoSorting: "https://visualgo.net/en/sorting",
  princetonElementary: "https://algs4.cs.princeton.edu/lectures/keynote/21ElementarySorts.pdf",
  usfcaSearch: "https://www.cs.usfca.edu/~galles/visualization/Search.html",
  princetonModel: "https://algs4.cs.princeton.edu/11model/",
  openDsaHash:
    "https://opendsa-server.cs.vt.edu/ODSA/Books/pubbook/odsa-all/fall-2019/Public_Instance/html/index.html",
  princetonHash: "https://algs4.cs.princeton.edu/34hash/",
  openDsaChaining:
    "https://opendsa-server.cs.vt.edu/ODSA/Books/vt/cs3114/spring-2021/CSCI271/html/OpenHash.html",
  princetonQuick: "https://algs4.cs.princeton.edu/23quicksort/",
  princetonMergeApi:
    "https://algs4.cs.princeton.edu/code/javadoc/edu/princeton/cs/algs4/Merge.html",
  princetonHeap: "https://algs4.cs.princeton.edu/24pq/",
  visualgoHeap: "https://visualgo.net/en/heap",
  openDsaHeapsort:
    "https://opendsa-server.cs.vt.edu/ODSA/Books/cnu/cpsc270/fall-2020/2701TR13_2702TR8/html/Heapsort.html",
  visualgoInputFamilies: "https://visualgo.net/en/sorting?slide=10-8",
  gccMacro: "https://gcc.gnu.org/onlinedocs/cpp/Duplication-of-Side-Effects.html",
  gccIfdef: "https://gcc.gnu.org/onlinedocs/cpp/Ifdef.html",
  gccPreprocessing: "https://gcc.gnu.org/onlinedocs/cpp/The-preprocessing-language.html",
  seiAssert:
    "https://wiki.sei.cmu.edu/confluence/display/c/MSC11-C.%2BIncorporate%2Bdiagnostic%2Btests%2Busing%2Bassertions",
  algorithmVisualizer: "https://algorithm-visualizer.github.io/tracers.js/",
});

export const FOA_LESSON_EXPERIENCES_081_120: Readonly<Record<number, FoaLessonExperience>> =
  Object.freeze({
    81: defineFoaLessonExperience({
      visualFamily: "memory",
      visualModelZh: "一个 values 指针槽指向按 count 划分的连续堆区；未初始化单元保持空心。",
      visualModelEn:
        "One values pointer slot targets a contiguous heap region divided by count; uninitialised cells stay hollow.",
      primaryActionZh: "把 count × sizeof *values 放入分配请求，确认返回指针后逐格初始化。",
      primaryActionEn:
        "Place count × sizeof *values into the allocation request, confirm the returned pointer, then initialise each cell.",
      sequence: [
        ["形成字节请求", "Form the byte request"],
        ["malloc 返回内存或失败", "malloc returns storage or fails"],
        ["values 取得所有权并初始化", "values takes ownership and initialises the cells"],
        ["free 结束生命周期", "free ends the lifetime"],
      ],
      playbackMs: 1500,
      playbackPolicy: "guided",
      persistentEvidenceZh: "values → [4 × int] 的唯一所有权边及已释放状态。",
      persistentEvidenceEn: "The sole values → [4 × int] ownership edge and its released state.",
      hiddenByDefaultZh: "真实地址、分配器块头、重复循环文字和复杂度卡片。",
      hiddenByDefaultEn:
        "Real addresses, allocator headers, repeated loop narration, and complexity cards.",
      researchUrls: [URL.wg14, URL.pythonTutor],
    }),
    82: defineFoaLessonExperience({
      visualFamily: "memory",
      visualModelZh: "旧堆块、临时指针 grown 与候选新块组成三态所有权图。",
      visualModelEn:
        "An old heap block, temporary grown pointer, and candidate new block form a three-state ownership diagram.",
      primaryActionZh:
        "先让 grown 接收 realloc 结果，再从成功或失败出口提交；不得直接覆盖 values。",
      primaryActionEn:
        "Let grown receive realloc first, then commit through the success or failure exit; never overwrite values directly.",
      sequence: [
        ["保留旧所有者", "Preserve the old owner"],
        ["请求扩大并等待结果", "Request growth and await the result"],
        ["判定 grown", "Test grown"],
        ["成功提交或失败释放旧块", "Commit on success or release the old block on failure"],
      ],
      playbackMs: 1900,
      playbackPolicy: "guided",
      persistentEvidenceZh: "旧分配在提交前始终可达，并且只有一条有效释放路径。",
      persistentEvidenceEn:
        "The old allocation remains reachable until commit and has exactly one valid release path.",
      hiddenByDefaultZh: "是否原地增长或复制等实现细节；动画不得假定 realloc 必然搬家。",
      hiddenByDefaultEn:
        "Implementation details such as in-place growth or copying; the animation must not assume realloc always moves.",
      researchUrls: [URL.seiMemory, URL.wg14],
    }),
    83: defineFoaLessonExperience({
      visualFamily: "pointer-graph",
      visualModelZh: "三个稳定身份的 value|next 节点，按 first → second → third → NULL 连成单链。",
      visualModelEn: "Three stable-identity value|next nodes form first → second → third → NULL.",
      primaryActionZh: "依次把每个 next 插头接到正确后继。",
      primaryActionEn: "Connect each next plug to the correct successor in order.",
      sequence: [
        ["创建三个独立节点", "Create three independent nodes"],
        ["建立 next 关系", "Establish the next relations"],
        ["从 first 遍历验证", "Traverse from first to verify reachability"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "从 first 出发的可达链恰为 1, 2, 3, NULL。",
      persistentEvidenceEn: "The chain reachable from first is exactly 1, 2, 3, NULL.",
      hiddenByDefaultZh: "内存地址、尾指针、数组索引和 malloc 叙事；本例节点不是动态分配。",
      hiddenByDefaultEn:
        "Addresses, tail pointers, array indices, and malloc narration; these nodes are not dynamically allocated.",
      researchUrls: [URL.visualgoList, URL.openDsaList],
    }),
    84: defineFoaLessonExperience({
      visualFamily: "pointer-graph",
      visualModelZh: "旧链保持静止，新节点 zero 从链外出现，只改变 zero.next 与 head 两条边。",
      visualModelEn:
        "The old chain stays still while zero appears outside it; only zero.next and head change.",
      primaryActionZh: "先把 zero.next 接到旧 head，再把 head 插头移到 zero。",
      primaryActionEn: "Connect zero.next to the old head before moving head to zero.",
      sequence: [
        ["保留旧 head", "Preserve the old head"],
        ["zero.next = head", "Set zero.next = head"],
        ["head = &zero", "Set head = &zero"],
        ["遍历核对 0, 1, 2", "Traverse to verify 0, 1, 2"],
      ],
      playbackMs: 1750,
      playbackPolicy: "guided",
      persistentEvidenceZh: "提交前旧链仍可达，提交后 head 可达序列为 0, 1, 2。",
      persistentEvidenceEn:
        "The old chain stays reachable before commit; afterwards head reaches 0, 1, 2.",
      hiddenByDefaultZh: "未改变节点的字段、完整遍历过程和中间/尾部插入案例。",
      hiddenByDefaultEn:
        "Unchanged fields, the full traversal, and middle or tail insertion cases.",
      researchUrls: [URL.visualgoList],
    }),
    85: defineFoaLessonExperience({
      visualFamily: "pointer-graph",
      visualModelZh: "a → b → c 中先以虚线预览 a → c，提交后 b 退出主链但仍保留对象身份。",
      visualModelEn:
        "In a → b → c, a dashed a → c previews reconnection; after commit b leaves the main chain but keeps its identity.",
      primaryActionZh: "把 b.next 的目标接到 a.next，再断开 b.next。",
      primaryActionEn: "Reconnect a.next to b.next's target, then disconnect b.next.",
      sequence: [
        ["识别前驱、目标和后继", "Identify predecessor, target, and successor"],
        ["保存后继", "Preserve the successor"],
        ["让 a 绕过 b", "Reconnect a around b"],
        ["隔离 b", "Isolate b"],
      ],
      playbackMs: 1950,
      playbackPolicy: "guided",
      persistentEvidenceZh: "a 的可达集合由 {a,b,c} 变成 {a,c}，且 b.next == NULL。",
      persistentEvidenceEn:
        "Reachability from a changes from {a,b,c} to {a,c}, and b.next == NULL.",
      hiddenByDefaultZh: "free 或垃圾回收动画、其他删除位置和整段代码解释。",
      hiddenByDefaultEn:
        "free or garbage-collection animation, other deletion positions, and full-code explanation.",
      researchUrls: [URL.visualgoList, URL.usfcaAlgorithms],
    }),
    86: defineFoaLessonExperience({
      visualFamily: "sequence",
      visualModelZh: "竖直的两节点链式栈，只有 top 标记在 pop 时向下移动。",
      visualModelEn: "A vertical two-node linked stack whose only moving marker is top during pop.",
      primaryActionZh: "点击当前 top 执行一次 pop，并预测下一次 peek。",
      primaryActionEn: "Click the current top to pop once, then predict the next peek.",
      sequence: [
        ["读取 top 值", "Read the top value"],
        ["top = top->next", "Set top = top->next"],
        ["读取新 top", "Read the new top"],
      ],
      playbackMs: 1450,
      playbackPolicy: "guided",
      persistentEvidenceZh: "top 的两次位置和输出顺序 2, 1 共同证明 LIFO。",
      persistentEvidenceEn: "The two top positions and output order 2, 1 together establish LIFO.",
      hiddenByDefaultZh: "链表任意位置操作、队列术语和节点地址。",
      hiddenByDefaultEn: "Arbitrary list operations, queue terminology, and node addresses.",
      researchUrls: [URL.openDsa, URL.visualgoList],
    }),
    87: defineFoaLessonExperience({
      visualFamily: "sequence",
      visualModelZh: "三槽圆环带 head、tail 两枚游标，突出 2 → 0 的取模回绕。",
      visualModelEn:
        "A three-slot ring with head and tail cursors emphasises the modulo wrap from 2 to 0.",
      primaryActionZh: "拖动 tail 完成一次回绕入队，再从 head 出队。",
      primaryActionEn: "Drag tail through one wrapped enqueue, then dequeue from head.",
      sequence: [
        ["在 tail 写入", "Write at tail"],
        ["tail 取模前进", "Advance tail modulo capacity"],
        ["在 head 读取并前进", "Read at head and advance it"],
        ["复用空槽", "Reuse the freed slot"],
      ],
      playbackMs: 1700,
      playbackPolicy: "guided",
      persistentEvidenceZh: "head、tail、size 三元组及逻辑队列顺序 4, 7, 9。",
      persistentEvidenceEn: "The head, tail, size triple and logical queue order 4, 7, 9.",
      hiddenByDefaultZh: "链式队列，以及把数组物理顺序误当成逻辑队列顺序的视图。",
      hiddenByDefaultEn:
        "Linked queues and any view that mistakes physical array order for logical queue order.",
      researchUrls: [URL.openDsa, URL.usfcaAlgorithms],
    }),
    88: defineFoaLessonExperience({
      visualFamily: "tree",
      visualModelZh: "只展开从根到目标的比较路径，未走子树弱化；严格按当前源码呈现迭代查找。",
      visualModelEn:
        "Only the root-to-target comparison path expands while untouched subtrees fade; it strictly presents the current code as iterative search.",
      primaryActionZh: "每次比较后选择左边、命中或右边；当前源码不修改树，不能把操作称为插入。",
      primaryActionEn:
        "Choose left, found, or right after each comparison; the current source does not modify the tree and must not be presented as insertion.",
      sequence: [
        ["从根开始", "Start at the root"],
        ["比较 target 与 key", "Compare target with key"],
        ["沿唯一可行子边前进", "Follow the only viable child edge"],
        ["命中或在 NULL 终止", "Stop on a match or NULL"],
      ],
      playbackMs: 1600,
      playbackPolicy: "guided",
      persistentEvidenceZh: "当前代码的真实访问路径 5 → 8 及逐步比较结果；证据类型为查找。",
      persistentEvidenceEn:
        "The current code's actual path 5 → 8 and each comparison result; the evidence type is search.",
      hiddenByDefaultZh: "节点插入、平衡旋转、整棵树字段表，以及任何“已完成插入”的表述。",
      hiddenByDefaultEn:
        "Node insertion, balancing rotations, whole-tree field tables, and any claim that insertion occurred.",
      researchUrls: [URL.visualgoBst],
    }),
    89: defineFoaLessonExperience({
      visualFamily: "tree",
      visualModelZh: "静止的 BST 上移动一个游标，底部访问序列按左—节点—右增长。",
      visualModelEn:
        "One cursor moves over a stationary BST while the visit strip grows left–node–right.",
      primaryActionZh: "在每个递归返回点选择下一被访问节点。",
      primaryActionEn: "Choose the next visited node at each recursive return point.",
      sequence: [
        ["下潜左子树", "Descend into the left subtree"],
        ["访问当前节点", "Visit the current node"],
        ["下潜右子树", "Descend into the right subtree"],
        ["返回父帧", "Return to the parent frame"],
      ],
      playbackMs: 1750,
      playbackPolicy: "guided",
      persistentEvidenceZh: "访问序列 2, 5, 8，并注明有序性依赖 BST 不变量。",
      persistentEvidenceEn:
        "Visit order 2, 5, 8, with ordering explicitly tied to the BST invariant.",
      hiddenByDefaultZh: "完整调用栈文字、前序/后序对照和每次 NULL 调用。",
      hiddenByDefaultEn:
        "Full call-stack narration, preorder/postorder comparisons, and every NULL call.",
      researchUrls: [URL.visualgoBst, URL.openDsaTrees],
    }),
    90: defineFoaLessonExperience({
      visualFamily: "tree",
      visualModelZh: "同一键集合的平衡轮廓与按 1,2,3,4,5 形成的右链轮廓叠加切换，高度尺为主视觉。",
      visualModelEn:
        "Overlay and switch between a balanced outline and the 1,2,3,4,5 right chain, with height as the primary scale.",
      primaryActionZh: "切换输入顺序，观察新节点落点和树高变化。",
      primaryActionEn:
        "Switch insertion order and observe each landing position and height change.",
      sequence: [
        ["固定键集合", "Fix the key set"],
        ["改变输入顺序", "Change input order"],
        ["比较形状和路径高度", "Compare shape and path height"],
      ],
      playbackMs: 2050,
      playbackPolicy: "guided",
      persistentEvidenceZh: "退化轮廓高度为 5；当前示例只计算高度计数，不冒充真实构树轨迹。",
      persistentEvidenceEn:
        "The degenerate outline has height 5; the example only counts height and is not presented as a real construction trace.",
      hiddenByDefaultZh: "AVL 旋转、平均复杂度长文和全部节点字段。",
      hiddenByDefaultEn: "AVL rotations, long average-case prose, and every node field.",
      researchUrls: [URL.visualgoBst, URL.princetonBst],
    }),
    91: defineFoaLessonExperience({
      visualFamily: "dependency",
      visualModelZh: "operation 是可切换插座，只能接 add 或 multiply；参数沿选中线路进入。",
      visualModelEn:
        "operation is a switchable socket that accepts add or multiply; arguments follow the selected route.",
      primaryActionZh: "把 operation 接到 multiply，再触发 operation(3,4)。",
      primaryActionEn: "Connect operation to multiply, then invoke operation(3,4).",
      sequence: [
        ["声明兼容函数签名", "Declare a compatible function signature"],
        ["绑定 multiply 的函数地址", "Bind the address of multiply"],
        ["间接调用并返回 12", "Call indirectly and return 12"],
      ],
      playbackMs: 1500,
      playbackPolicy: "guided",
      persistentEvidenceZh: "operation → multiply 的当前目标关系和结果 12。",
      persistentEvidenceEn: "The current operation → multiply target relation and result 12.",
      hiddenByDefaultZh: "机器代码地址、ABI、两个函数完整实现和回调框架。",
      hiddenByDefaultEn:
        "Machine-code addresses, ABI details, full function bodies, and callback frameworks.",
      researchUrls: [URL.wg14],
    }),
    92: defineFoaLessonExperience({
      visualFamily: "dependency",
      visualModelZh: "树上只有遍历游标，旁边一个 Visit 插座接 show；每次仅送出一个节点值。",
      visualModelEn:
        "A tree carries only a traversal cursor while one Visit socket targets show; one node value is sent at a time.",
      primaryActionZh: "先选择访问器，再按中序点击节点验证回调顺序。",
      primaryActionEn: "Choose the visitor, then click nodes in inorder to verify callback order.",
      sequence: [
        ["传入 visitor", "Pass in the visitor"],
        ["中序定位节点", "Locate the next inorder node"],
        ["调用 visit(value)", "Invoke visit(value)"],
        ["收集输出", "Collect the output"],
      ],
      playbackMs: 1850,
      playbackPolicy: "guided",
      persistentEvidenceZh: "回调序列 show(1), show(2)，并保持树数据与访问行为分离。",
      persistentEvidenceEn:
        "Callback sequence show(1), show(2), with tree data kept separate from visitor behaviour.",
      hiddenByDefaultZh: "其他访问器、面向对象术语和完整递归调用栈。",
      hiddenByDefaultEn:
        "Other visitors, object-oriented terminology, and the full recursion stack.",
      researchUrls: [URL.wg14, URL.visualgoBst],
    }),
    93: defineFoaLessonExperience({
      visualFamily: "stream",
      visualModelZh: "一条文本流带配一个文件位置游标；写入后在末尾，rewind 后回到 0。",
      visualModelEn:
        "A text stream strip has one position cursor, ending after the write and returning to zero after rewind.",
      primaryActionZh: "把游标拖回起点，再执行两次整数解析。",
      primaryActionEn: "Drag the cursor back to the start, then perform two integer conversions.",
      sequence: [
        ["写入 3 5 和换行", "Write 3 5 and a newline"],
        ["游标到达末尾", "The cursor reaches the end"],
        ["rewind 回到起点", "rewind returns to the start"],
        ["解析并求和", "Parse and add the values"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh: "当前文件位置与实际解析值 3、5。",
      persistentEvidenceEn: "The current file position and parsed values 3 and 5.",
      hiddenByDefaultZh: "磁盘扇区、文件描述符、stdio 缓冲实现和 tmpfile 路径。",
      hiddenByDefaultEn:
        "Disk sectors, file descriptors, stdio buffering internals, and the tmpfile path.",
      researchUrls: [URL.wg14, URL.posixFseek],
    }),
    94: defineFoaLessonExperience({
      visualFamily: "stream",
      visualModelZh: "文本流按换行分段，旁边只有一个容量 16 的缓冲框。",
      visualModelEn: "The text stream is segmented by newlines beside a single capacity-16 buffer.",
      primaryActionZh: "点击下一行，判断本次 fgets 返回字符串还是 EOF。",
      primaryActionEn: "Advance one line and decide whether fgets returns a string or EOF.",
      sequence: [
        ["读取到换行或容量边界", "Read to a newline or the capacity boundary"],
        ["返回当前缓冲内容", "Return the current buffer contents"],
        ["EOF 时返回 NULL", "Return NULL at EOF"],
      ],
      playbackMs: 1450,
      playbackPolicy: "guided",
      persistentEvidenceZh: "成功返回次数 2 和本次缓冲内容。",
      persistentEvidenceEn: "Two successful returns and the current buffer contents.",
      hiddenByDefaultZh: "逐字符飞入、完整文件 API 列表和 lines 的重复赋值文字。",
      hiddenByDefaultEn:
        "Character-by-character flight, the full file API list, and repeated lines assignments.",
      researchUrls: [URL.posixFgets, URL.wg14],
    }),
    95: defineFoaLessonExperience({
      visualFamily: "stream",
      visualModelZh: "输入 token 带 12 | x 与目标槽 a | b；匹配成功后在类型冲突处停止。",
      visualModelEn:
        "An input token strip 12 | x feeds target slots a | b and stops at the type mismatch.",
      primaryActionZh: "在 x → %d 处选择匹配失败，而不是把 x 放入 b。",
      primaryActionEn: "Choose matching failure at x → %d instead of placing x into b.",
      sequence: [
        ["第一个 %d 匹配 12", "The first %d matches 12"],
        ["把 12 赋给 a", "Assign 12 to a"],
        ["第二个转换遇到 x 失败", "The second conversion fails on x"],
        ["返回已赋值项数 1", "Return one successful assignment"],
      ],
      playbackMs: 1900,
      playbackPolicy: "guided",
      persistentEvidenceZh: "fscanf 返回值 1，而不是没有证据的泛化“失败”标签。",
      persistentEvidenceEn:
        "The fscanf return value 1, rather than an unsupported generic failure label.",
      hiddenByDefaultZh: "errno 推断、未赋值 b 的内容和后续恢复策略。",
      hiddenByDefaultEn:
        "errno speculation, the unassigned contents of b, and later recovery strategies.",
      researchUrls: [URL.posixFscanf, URL.wg14],
    }),
    96: defineFoaLessonExperience({
      visualFamily: "stream",
      visualModelZh: "out 记录、原始字节带和 in 记录三段，仅表达同一实现内的一次往返。",
      visualModelEn:
        "An out record, raw byte strip, and in record show one round trip within the same implementation.",
      primaryActionZh: "确认 fwrite 与 fread 的元素计数各为 1，再揭示 in 的字段。",
      primaryActionEn:
        "Confirm element counts of one from fwrite and fread before revealing the fields of in.",
      sequence: [
        ["写入一个 Record", "Write one Record"],
        ["rewind 流", "Rewind the stream"],
        ["读回一个 Record", "Read one Record back"],
        ["按字段核对", "Compare fields"],
      ],
      playbackMs: 1800,
      playbackPolicy: "guided",
      persistentEvidenceZh: "写/读元素计数 1/1，以及 in 的字段值 7、90。",
      persistentEvidenceEn: "Write/read element counts 1/1 and in field values 7 and 90.",
      hiddenByDefaultZh: "跨机器可移植性结论、固定 padding/字节序图和磁盘块动画。",
      hiddenByDefaultEn:
        "Cross-machine portability claims, fixed padding or endianness diagrams, and disk-block animation.",
      researchUrls: [URL.wg14],
    }),
    97: defineFoaLessonExperience({
      visualFamily: "stream",
      visualModelZh: "三个字节槽 1 2 3 带偏移尺，游标到 offset 1 后以 9 覆盖中间槽。",
      visualModelEn:
        "Three byte cells 1 2 3 sit on an offset ruler; at offset 1, 9 overwrites the middle cell.",
      primaryActionZh: "在偏移尺选择位置 1，然后写入 9。",
      primaryActionEn: "Choose position 1 on the offset ruler, then write 9.",
      sequence: [
        ["写入初始三个字节", "Write the initial three bytes"],
        ["seek 到偏移 1", "Seek to offset 1"],
        ["覆盖一个字节", "Overwrite one byte"],
        ["rewind 后核对 1 9 3", "Rewind and verify 1 9 3"],
      ],
      playbackMs: 1700,
      playbackPolicy: "guided",
      persistentEvidenceZh: "游标 offset 与覆盖前后的单字节差异。",
      persistentEvidenceEn: "The cursor offset and the single-byte before/after difference.",
      hiddenByDefaultZh: "插入并右移后续字节的错误暗示、文本含义和文件系统实现。",
      hiddenByDefaultEn:
        "Any false insertion-and-shift implication, textual meaning, and filesystem internals.",
      researchUrls: [URL.posixFseek, URL.wg14],
    }),
    98: defineFoaLessonExperience({
      visualFamily: "sorting",
      visualModelZh: "两条有序输入带各有一个前端游标，中央输出带一次追加一个较小前端。",
      visualModelEn:
        "Two sorted input strips each have a front cursor, and the output appends one smaller front at a time.",
      primaryActionZh: "在两个前端值之间选择较小者送入输出。",
      primaryActionEn: "Choose the smaller of the two front values and send it to output.",
      sequence: [
        ["比较两个前端", "Compare the two fronts"],
        ["选择较小值，相等时取左", "Choose the smaller value, taking left on equality"],
        ["前进被选游标", "Advance the selected cursor"],
        ["耗尽后接入剩余值", "Append the remainder after exhaustion"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "已输出前缀始终有序，每个值保留 A/B 来源。",
      persistentEvidenceEn:
        "The emitted prefix remains sorted and each value retains its A/B provenance.",
      hiddenByDefaultZh: "文件 API、完整排序算法和同时出现的全部比较文字。",
      hiddenByDefaultEn:
        "File APIs, a complete sorting algorithm, and all comparison narration at once.",
      researchUrls: [URL.princetonMerge],
    }),
    99: defineFoaLessonExperience({
      visualFamily: "search",
      visualModelZh: "三个流只显示前端 7 | 2 | 5，中央保留一个当前最小候选槽。",
      visualModelEn:
        "Three streams reveal only fronts 7 | 2 | 5 around one current-minimum candidate slot.",
      primaryActionZh: "让候选依次与其余前端比较并保留较小索引；本例只完成一次选择。",
      primaryActionEn:
        "Compare the candidate with each remaining front and retain the smaller index; this example performs one selection only.",
      sequence: [
        ["候选初始化为索引 0", "Initialise the candidate to index 0"],
        ["扫描其余 fronts", "Scan the remaining fronts"],
        ["输出 chosen 和对应值", "Output chosen and its value"],
      ],
      playbackMs: 1600,
      playbackPolicy: "guided",
      persistentEvidenceZh: "chosen = 1 且 front[chosen] = 2；不声称完成 k 路归并。",
      persistentEvidenceEn:
        "chosen = 1 and front[chosen] = 2, without claiming a complete k-way merge.",
      hiddenByDefaultZh: "完整 k 路归并、堆操作和每条流的后续元素。",
      hiddenByDefaultEn:
        "A complete k-way merge, heap operations, and later elements in each stream.",
      researchUrls: [URL.openDsaHeap, URL.princetonMerge],
    }),
    100: defineFoaLessonExperience({
      visualFamily: "pipeline",
      visualModelZh: "小型控制流汇入唯一 fclose 闸口，文件对象只有 open/closed 两态。",
      visualModelEn:
        "A compact control flow converges on one fclose gate; the file has only open and closed states.",
      primaryActionZh: "把成功和失败出口接到同一 cleanup 点，再结束执行。",
      primaryActionEn:
        "Route success and failure exits through the same cleanup point before returning.",
      sequence: [
        ["尝试打开文件", "Attempt to open the file"],
        ["执行写入或进入失败路径", "Write or take the failure path"],
        ["汇入 cleanup", "Converge on cleanup"],
        ["关闭后返回状态", "Return status after closing"],
      ],
      playbackMs: 2000,
      playbackPolicy: "guided",
      persistentEvidenceZh: "所有已打开路径都以 file: closed 结束；未打开路径不调用 fclose。",
      persistentEvidenceEn:
        "Every path that opened the file ends with file: closed; unopened paths do not call fclose.",
      hiddenByDefaultZh: "RAII、异常、多资源泛化和重复的关闭成功文字。",
      hiddenByDefaultEn:
        "RAII, exceptions, multi-resource generalisation, and repeated success prose.",
      researchUrls: [URL.wg14, URL.posixFclose],
    }),
    101: defineFoaLessonExperience({
      visualFamily: "evidence",
      visualModelZh: "四个数组值配一个比较计数器，只在真正执行比较时加一。",
      visualModelEn:
        "Four array values share one comparison counter that increments only on an executed comparison.",
      primaryActionZh: "逐对选择 (i,j) 并执行 compare，逆序时才交换。",
      primaryActionEn: "Choose each (i,j) pair and compare, swapping only when out of order.",
      sequence: [
        ["选择一对", "Select a pair"],
        ["comparison +1", "Increment comparisons"],
        ["比较并可能交换", "Compare and possibly swap"],
        ["继续直至六对完成", "Continue until all six pairs are complete"],
      ],
      playbackMs: 1350,
      playbackPolicy: "guided",
      persistentEvidenceZh: "比较计数恰为 6，并与动画帧数、墙钟耗时分离。",
      persistentEvidenceEn:
        "The comparison count is exactly 6 and remains separate from frame count and wall time.",
      hiddenByDefaultZh: "综合效率分、CPU 时间、复杂度结论卡片和重复排序说明。",
      hiddenByDefaultEn:
        "Composite efficiency scores, CPU time, complexity conclusion cards, and repeated sorting prose.",
      researchUrls: [URL.princetonElementary, URL.visualgoSorting],
    }),
    102: defineFoaLessonExperience({
      visualFamily: "search",
      visualModelZh: "一行词卡配一个扫描框，strcmp 结果只呈现相等或不等。",
      visualModelEn:
        "A row of word cards has one scan frame; strcmp reports only equal or unequal.",
      primaryActionZh: "按顺序点击词卡直到 cat 命中，不能直接跳到目标。",
      primaryActionEn: "Visit word cards in order until cat matches; do not jump to the target.",
      sequence: [
        ["从 index 0 开始", "Start at index 0"],
        ["比较当前词", "Compare the current word"],
        ["命中返回或 index + 1", "Return on a hit or advance index"],
      ],
      playbackMs: 1250,
      playbackPolicy: "guided",
      persistentEvidenceZh: "访问索引 0, 1, 2 和最终 index 2。",
      persistentEvidenceEn: "Visited indices 0, 1, 2 and final index 2.",
      hiddenByDefaultZh: "字符级比较、排序信息和哈希替代方案。",
      hiddenByDefaultEn:
        "Character-level comparison, ordering information, and hashing alternatives.",
      researchUrls: [URL.usfcaSearch, URL.openDsa],
    }),
    103: defineFoaLessonExperience({
      visualFamily: "search",
      visualModelZh: "有序词条上方只有半开区间尺 [low, high)，每步突出 mid 和被舍弃半区。",
      visualModelEn:
        "A half-open [low, high) ruler sits above sorted words, highlighting only mid and the discarded half.",
      primaryActionZh: "根据 strcmp 结果把 low 或 high 拖到新边界。",
      primaryActionEn: "Drag low or high to its new boundary according to strcmp.",
      sequence: [
        ["计算 mid", "Compute mid"],
        ["比较 words[mid] 与 target", "Compare words[mid] with target"],
        ["丢弃一半候选", "Discard half the candidates"],
        ["low == high 时得到位置", "Obtain the position when low == high"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "每轮 [low,high) 严格缩小且保留 lower-bound 位置。",
      persistentEvidenceEn:
        "Each [low,high) interval strictly shrinks while retaining the lower-bound position.",
      hiddenByDefaultZh: "整段 while、字符级 strcmp 和常驻性能对照表。",
      hiddenByDefaultEn:
        "The full while loop, character-level strcmp, and a permanent performance comparison table.",
      researchUrls: [URL.usfcaSearch, URL.princetonModel],
    }),
    104: defineFoaLessonExperience({
      visualFamily: "expression",
      visualModelZh: "字符 a、b、c 依次进入单一累加器，固定展示 hash × 31 + byte。",
      visualModelEn: "Characters a, b, c enter one accumulator in order using hash × 31 + byte.",
      primaryActionZh: "拖入下一个字符并预测更新后的 hash。",
      primaryActionEn: "Feed the next character and predict the updated hash.",
      sequence: [
        ["读取下一个 byte", "Read the next byte"],
        ["旧 hash 乘 31", "Multiply the old hash by 31"],
        ["加 byte 并保存 uint32_t", "Add the byte and store as uint32_t"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh: "每个字符后的累加状态和最终值 96354。",
      persistentEvidenceEn: "The accumulator after each character and final value 96354.",
      hiddenByDefaultZh: "密码学安全暗示、桶数组、冲突处理和对所有多项式哈希的泛化。",
      hiddenByDefaultEn:
        "Cryptographic-security implications, bucket arrays, collision handling, and generalisation to every polynomial hash.",
      researchUrls: [URL.openDsaHash, URL.princetonHash],
    }),
    105: defineFoaLessonExperience({
      visualFamily: "pointer-graph",
      visualModelZh: "目标 key 5 位于链表上方；指针 p 从链头 a 出发，沿 next 逐节点前进。",
      visualModelEn:
        "Target key 5 sits above the list while pointer p starts at head a and advances node by node through next.",
      primaryActionZh: "先设置目标 key=5，再从链头 a 逐节点比较；不能直接跳到值为 5 的节点。",
      primaryActionEn:
        "Set target key 5, then compare from chain head a one node at a time without jumping to the matching node.",
      sequence: [
        ["设置查找目标 key=5", "Set the lookup target key to 5"],
        ["从链头 a 开始遍历", "Traverse from chain head a"],
        ["顺序比较节点", "Compare nodes sequentially"],
        ["输出 found 或 missing", "Output found or missing"],
      ],
      playbackMs: 1800,
      playbackPolicy: "guided",
      persistentEvidenceZh:
        "target 5、链头 a、逐节点 key 比较与最终 found/missing 的线性查找路径。",
      persistentEvidenceEn:
        "The linear lookup path from target 5 and chain head a through each key comparison to found or missing.",
      hiddenByDefaultZh: "哈希桶、平均 O(1) 暗示、开放寻址和其他未出现在源码中的查找结构。",
      hiddenByDefaultEn:
        "Hash buckets, average-O(1) implications, open addressing, and other lookup structures absent from the source.",
      researchUrls: [URL.visualgoList, URL.openDsaList],
    }),
    106: defineFoaLessonExperience({
      visualFamily: "sorting",
      visualModelZh:
        "数组下方只有 < pivot | 未处理 | ≥ pivot | pivot 四段区域带和 store、i 两枚游标。",
      visualModelEn:
        "A single < pivot | unprocessed | ≥ pivot | pivot region strip sits below the array with store and i cursors.",
      primaryActionZh: "判断当前值是否进入左区，需要时执行一次交换，再用真实源码验证分区。",
      primaryActionEn:
        "Decide whether the current value enters the left region, swap when needed, then verify the partition with real source.",
      sequence: [
        ["固定末尾 pivot", "Fix the final pivot"],
        ["扫描当前值", "Scan the current value"],
        ["扩张左区或跳过", "Grow the left region or skip"],
        ["把 pivot 放到 store", "Place the pivot at store"],
      ],
      playbackMs: 1750,
      playbackPolicy: "manual",
      persistentEvidenceZh: "真实终态 pivot index 2，左侧均 <3、右侧均 ≥3。",
      persistentEvidenceEn:
        "The real final pivot index is 2, with every left value <3 and every right value ≥3.",
      hiddenByDefaultZh: "递归快排、平均复杂度、未访问代码面板和多层分区树。",
      hiddenByDefaultEn:
        "Recursive quicksort, average-case complexity, unopened code panels, and a multilayer partition tree.",
      researchUrls: [URL.princetonQuick, URL.visualgoSorting],
    }),
    107: defineFoaLessonExperience({
      visualFamily: "sorting",
      visualModelZh: "数组被分成 < pivot | = pivot | 未知 | > pivot，low、mid、high 紧贴边界。",
      visualModelEn:
        "The array is divided into < pivot | = pivot | unknown | > pivot with low, mid, and high attached to boundaries.",
      primaryActionZh: "把 values[mid] 分到三类之一；走大于分支后保持 mid 不动。",
      primaryActionEn:
        "Classify values[mid] into one of three regions; keep mid stationary after the greater-than branch.",
      sequence: [
        ["比较 mid 与 pivot", "Compare mid with the pivot"],
        ["小于时 low、mid 前进", "Advance low and mid on less-than"],
        ["等于时只前进 mid", "Advance only mid on equality"],
        ["大于时 high 后退且重验 mid", "Move high back and recheck mid on greater-than"],
      ],
      playbackMs: 1950,
      playbackPolicy: "manual",
      persistentEvidenceZh: "终态 low=2、high=4，且三段分类不变量由真实数组满足。",
      persistentEvidenceEn:
        "The final low=2 and high=4, with all three region invariants satisfied by the real array.",
      hiddenByDefaultZh: "普通二路分区的同时动画、递归和重复的等值文字标签。",
      hiddenByDefaultEn:
        "Simultaneous two-way partition animation, recursion, and repeated equal-value labels.",
      researchUrls: [URL.princetonQuick],
    }),
    108: defineFoaLessonExperience({
      visualFamily: "sorting",
      visualModelZh: "left、right 两行输入和一行 out；相等的 1 以 L/R 身份标记而不只显示数值。",
      visualModelEn:
        "Two input rows, left and right, feed out; equal 1 values retain L/R identities instead of showing values alone.",
      primaryActionZh: "从两个前端选值放入 out，遇到相等必须选左并用来源顺序验证稳定性。",
      primaryActionEn:
        "Move one front into out, choosing left on equality and verifying stability through provenance order.",
      sequence: [
        ["比较两个前端", "Compare the two fronts"],
        ["较小者进入 out，相等取左", "Move the smaller to out, taking left on equality"],
        ["前进对应来源游标", "Advance the matching source cursor"],
        ["检查来源身份顺序", "Check provenance order"],
      ],
      playbackMs: 1650,
      playbackPolicy: "manual",
      persistentEvidenceZh: "真实输出来源为 1ᴸ, 1ᴿ, 3, 4，直接限定本例稳定性证据。",
      persistentEvidenceEn:
        "Real output provenance 1ᴸ, 1ᴿ, 3, 4 directly bounds this example's stability evidence.",
      hiddenByDefaultZh: "完整 merge sort 递归、丢失身份的纯数值视图和复杂度卡片。",
      hiddenByDefaultEn:
        "Full mergesort recursion, value-only views that lose identity, and complexity cards.",
      researchUrls: [URL.princetonMerge, URL.princetonMergeApi],
    }),
    109: defineFoaLessonExperience({
      visualFamily: "sorting",
      visualModelZh: "数组上方的 run 括号按 1 → 2 → 4 → 8 合并，每轮只显示当前 width。",
      visualModelEn:
        "Run brackets above the array merge as 1 → 2 → 4 → 8, showing only the current width.",
      primaryActionZh: "完成当前 width 的全部相邻配对后，把 width 翻倍。",
      primaryActionEn: "Complete all adjacent pairs at the current width, then double width.",
      sequence: [
        ["width 从 1 开始", "Start with width 1"],
        ["合并本轮相邻 runs", "Merge adjacent runs for this pass"],
        ["width 翻倍", "Double width"],
        ["覆盖整体后停止", "Stop after covering the whole array"],
      ],
      playbackMs: 1850,
      playbackPolicy: "manual",
      persistentEvidenceZh: "每轮 run width 与已排序分段数量，示例 passes=3。",
      persistentEvidenceEn:
        "The run width and number of sorted segments for each pass, with passes=3 in this example.",
      hiddenByDefaultZh: "元素级 merge 重演、递归树和顶向下版本。",
      hiddenByDefaultEn: "Element-level merge replay, recursion trees, and top-down mergesort.",
      researchUrls: [URL.princetonMerge],
    }),
    110: defineFoaLessonExperience({
      visualFamily: "tree",
      visualModelZh: "默认树视图仅突出 root、两个孩子和更大孩子；数组视图可切换但不并排。",
      visualModelEn:
        "The default tree view highlights only root, its two children, and the larger child; the array view is switchable, not simultaneous.",
      primaryActionZh: "先选更大孩子，再判断交换或停止，并在真实堆上核对下滤路径。",
      primaryActionEn:
        "Choose the larger child before deciding to swap or stop, then verify the sink path on the real heap.",
      sequence: [
        ["定位孩子", "Locate the children"],
        ["选出较大孩子", "Choose the larger child"],
        ["比较 parent 与 child", "Compare parent and child"],
        ["交换下移或终止", "Swap downward or stop"],
      ],
      playbackMs: 1800,
      playbackPolicy: "manual",
      persistentEvidenceZh: "真实下滤路径、终态 root=8，以及路径上的父节点不小于孩子。",
      persistentEvidenceEn:
        "The real sink path, final root=8, and parent-not-smaller-than-child checks along that path.",
      hiddenByDefaultZh: "全树边高亮、swim、优先队列 API 和排序后缀。",
      hiddenByDefaultEn:
        "Whole-tree edge highlighting, swim, priority-queue APIs, and the sorted suffix.",
      researchUrls: [URL.princetonHeap, URL.visualgoHeap],
    }),
    111: defineFoaLessonExperience({
      visualFamily: "sorting",
      visualModelZh: "一条边界把数组分成活动 heap 与已排序 suffix，每轮只把边界左移一格。",
      visualModelEn:
        "One boundary separates the active heap from the sorted suffix and moves left one cell per round.",
      primaryActionZh:
        "移动 heap/suffix 边界并核对计数；当前源码没有数组或下滤，不能操作成完整堆排序。",
      primaryActionEn:
        "Move the heap/suffix boundary and verify its count; the current source has no array or sink and must not behave like complete heapsort.",
      sequence: [
        ["记录当前 heap_size", "Record the current heap_size"],
        ["heap_size 减一", "Decrease heap_size"],
        ["sorted_suffix 加一", "Increase sorted_suffix"],
        ["heap_size 为一时停止", "Stop when heap_size is one"],
      ],
      playbackMs: 1850,
      playbackPolicy: "manual",
      persistentEvidenceZh: "源码真实证明的只有边界单调收缩与 suffix 长度 4，不证明完整排序轨迹。",
      persistentEvidenceEn:
        "The source establishes only monotonic boundary shrinkage and suffix length 4, not a complete sorting trace.",
      hiddenByDefaultZh: "数组元素交换、下滤重演、堆构造和任何“已完成 heapsort”的表述。",
      hiddenByDefaultEn:
        "Array exchanges, sink replay, heap construction, and any claim that heapsort was completed.",
      researchUrls: [URL.princetonHeap, URL.openDsaHeapsort],
    }),
    112: defineFoaLessonExperience({
      visualFamily: "evidence",
      visualModelZh: "同一坐标系画三条操作增长线，输入族用已排序/逆序/重复值文字切换。",
      visualModelEn:
        "Three operation-growth lines share one coordinate system, with sorted/reverse/duplicate input families selected by text.",
      primaryActionZh:
        "选择输入族与 n 后先预测增长；当前源码只给硬编码模型点，不能触发或声称真实 Benchmark。",
      primaryActionEn:
        "Choose an input family and n, then predict growth; the current source provides hard-coded model points and must not trigger or claim a real benchmark.",
      sequence: [
        ["选择输入族", "Choose an input family"],
        ["选择规模 n", "Choose size n"],
        ["揭示模型操作计数", "Reveal the model operation count"],
        ["比较增长而非单点快慢", "Compare growth rather than one-point speed"],
      ],
      playbackMs: 2300,
      playbackPolicy: "manual",
      persistentEvidenceZh: "n—操作计数数据点必须标注“教学模型”；7、28、24 不是运行测量。",
      persistentEvidenceEn:
        "Each n–operation point is labelled instructional model; 7, 28, and 24 are not run measurements.",
      hiddenByDefaultZh: "综合评分、伪墙钟曲线、自动 Big-O 结论和“Benchmark 已运行”状态。",
      hiddenByDefaultEn:
        "Composite scores, fabricated wall-time curves, automatic Big-O conclusions, and any benchmark-ran state.",
      researchUrls: [URL.visualgoInputFamilies, URL.princetonMerge, URL.princetonQuick],
    }),
    113: defineFoaLessonExperience({
      visualFamily: "expression",
      visualModelZh: "a>b ? a : b 由一个判定门和两个候选值组成，只有选中值进入 maximum。",
      visualModelEn:
        "a>b ? a : b consists of one decision gate and two candidates; only the selected value enters maximum.",
      primaryActionZh: "先判断条件，再把唯一选中的操作数送入目标槽。",
      primaryActionEn:
        "Evaluate the condition, then send only the selected operand to the target slot.",
      sequence: [
        ["求值 a > b", "Evaluate a > b"],
        ["只选择第二或第三操作数", "Select only the second or third operand"],
        ["把结果赋给 maximum", "Assign the result to maximum"],
      ],
      playbackMs: 1300,
      playbackPolicy: "manual",
      persistentEvidenceZh: "条件结果 false 与唯一被选中的 b=9。",
      persistentEvidenceEn: "Condition result false and the sole selected operand b=9.",
      hiddenByDefaultZh: "完整 if/else 改写、优先级表和两边同时执行的动画。",
      hiddenByDefaultEn:
        "A full if/else rewrite, precedence tables, and animation that executes both branches.",
      researchUrls: [URL.wg14],
    }),
    114: defineFoaLessonExperience({
      visualFamily: "bit-grid",
      visualModelZh: "固定八格位带从 bit 7 到 bit 0，13 的置位形成 00001101。",
      visualModelEn:
        "A fixed eight-cell bit strip runs from bit 7 to bit 0, with 13 forming 00001101.",
      primaryActionZh: "从 bit 7 到 bit 0 依次测试掩码并填入 0 或 1。",
      primaryActionEn: "Test the mask from bit 7 through bit 0 and fill each cell with 0 or 1.",
      sequence: [
        ["生成 1u << bit", "Form 1u << bit"],
        ["与 value 执行 AND", "AND it with value"],
        ["输出对应 0 或 1", "Emit the matching 0 or 1"],
      ],
      playbackMs: 1450,
      playbackPolicy: "manual",
      persistentEvidenceZh: "位索引与最终 8 位模式 00001101 的一一对应。",
      persistentEvidenceEn: "A one-to-one mapping between bit indices and final pattern 00001101.",
      hiddenByDefaultZh: "长除法转换、带符号表示和超过八位的机器字。",
      hiddenByDefaultEn:
        "Long-division conversion, signed representations, and machine words wider than eight bits.",
      researchUrls: [URL.wg14],
    }),
    115: defineFoaLessonExperience({
      visualFamily: "bit-grid",
      visualModelZh: "flags 开关行配一层半透明 mask；OR 只点亮，AND ~mask 只熄灭目标位。",
      visualModelEn:
        "A flags switch row has a translucent mask overlay; OR only lights bits and AND ~mask only clears the target.",
      primaryActionZh: "依次覆盖 set 与 clear 掩码，观察只有目标位改变。",
      primaryActionEn:
        "Apply set and clear masks in sequence and observe that only target bits change.",
      sequence: [
        ["OR 设置 bit 2", "Set bit 2 with OR"],
        ["OR 设置 bit 0", "Set bit 0 with OR"],
        ["反转 bit 0 掩码", "Invert the bit 0 mask"],
        ["AND 清除 bit 0", "Clear bit 0 with AND"],
      ],
      playbackMs: 1550,
      playbackPolicy: "manual",
      persistentEvidenceZh: "每步 before/mask/after 位模式和最终 flags=4。",
      persistentEvidenceEn: "The before/mask/after pattern at each step and final flags=4.",
      hiddenByDefaultZh: "逐位输出循环、完整位运算真值表和装饰性图标。",
      hiddenByDefaultEn: "The bit-output loop, full bitwise truth tables, and decorative icons.",
      researchUrls: [URL.wg14],
    }),
    116: defineFoaLessonExperience({
      visualFamily: "bit-grid",
      visualModelZh: "16 位 packed 带依次经过右移 8 格和 0xff 掩码，目标高字节保持身份色。",
      visualModelEn:
        "A 16-bit packed strip shifts right eight cells and passes through a 0xff mask while the target high byte retains identity.",
      primaryActionZh: "先把位带右移八格，再盖上八位掩码并读出 AB。",
      primaryActionEn: "Shift the strip right by eight, apply the eight-bit mask, and read AB.",
      sequence: [
        ["0xABCD 右移八位", "Shift 0xABCD right by eight"],
        ["以 0xff 截取低八位", "Mask the low eight bits with 0xff"],
        ["以十六进制输出 AB", "Output AB in hexadecimal"],
      ],
      playbackMs: 1650,
      playbackPolicy: "manual",
      persistentEvidenceZh: "0xABCD → 0x00AB → 0xAB 的值级变换链。",
      persistentEvidenceEn: "The value-level transformation 0xABCD → 0x00AB → 0xAB.",
      hiddenByDefaultZh: "大小端内存图、有符号右移和其他字段；本例不是按地址读取字节。",
      hiddenByDefaultEn:
        "Endianness memory diagrams, signed shifts, and other fields; this example does not read bytes by address.",
      researchUrls: [URL.wg14],
    }),
    117: defineFoaLessonExperience({
      visualFamily: "expression",
      visualModelZh:
        "value++ 带一次性求值票据，函数通道只消费一次，unsafe macro 仅按需显示双消费虚影。",
      visualModelEn:
        "value++ carries a single-use evaluation token; the function consumes it once, while an unsafe macro's double consumption is only an optional ghost.",
      primaryActionZh: "把 value++ 送入函数并计数一次求值，再解释结果 9、4。",
      primaryActionEn:
        "Send value++ through the function, count one evaluation, then explain results 9 and 4.",
      sequence: [
        ["实参求值一次", "Evaluate the argument once"],
        ["复制到函数参数", "Copy it into the parameter"],
        ["计算平方", "Compute the square"],
        ["返回后 value 为 4", "After return, value is 4"],
      ],
      playbackMs: 1900,
      playbackPolicy: "manual",
      persistentEvidenceZh: "副作用 value++ 的执行计数为 1，result=9 且 value=4。",
      persistentEvidenceEn: "The value++ side effect executes once, with result=9 and value=4.",
      hiddenByDefaultZh: "GNU 扩展、完整预处理器教程和实际执行危险宏的通道。",
      hiddenByDefaultEn:
        "GNU extensions, a full preprocessor tutorial, and any path that actually executes the unsafe macro.",
      researchUrls: [URL.gccMacro],
    }),
    118: defineFoaLessonExperience({
      visualFamily: "preprocessor",
      visualModelZh: "一份源码通过预处理裁切窗；USE_FAST 改变时只有一个实现进入翻译单元。",
      visualModelEn:
        "One source file passes through a preprocessing crop window; only one implementation enters the translation unit for a USE_FAST setting.",
      primaryActionZh: "切换构建标志，并预测预处理后唯一保留的实现。",
      primaryActionEn:
        "Toggle the build flag and predict the sole implementation retained after preprocessing.",
      sequence: [
        ["读取 USE_FAST", "Read USE_FAST"],
        ["评估 #if", "Evaluate #if"],
        ["保留一个 token 分支", "Retain one token branch"],
        ["编译并运行 transform", "Compile and run transform"],
      ],
      playbackMs: 1950,
      playbackPolicy: "manual",
      persistentEvidenceZh: "本次 build flag 与预处理后可见实现的配对。",
      persistentEvidenceEn:
        "The pairing between this build flag and the implementation visible after preprocessing.",
      hiddenByDefaultZh: "运行时分支动画、两条实现同时存在的暗示和完整预定义宏列表。",
      hiddenByDefaultEn:
        "Runtime branch animation, any implication both implementations coexist, and the full predefined-macro list.",
      researchUrls: [URL.gccIfdef, URL.gccPreprocessing],
    }),
    119: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "index ∈ [0,length) 数轴通过一个 assert 门，门上同时显示 NDEBUG 构建状态。",
      visualModelEn:
        "An index ∈ [0,length) number line passes through one assert gate that also shows the NDEBUG build state.",
      primaryActionZh: "把 index 放到数轴上，并判断它属于程序员不变量还是用户输入验证。",
      primaryActionEn:
        "Place index on the number line and classify the check as a programmer invariant or user-input validation.",
      sequence: [
        ["形成谓词", "Form the predicate"],
        ["检查 NDEBUG 状态", "Check NDEBUG state"],
        ["真则继续，假则诊断终止", "Continue if true or diagnose and terminate if false"],
        ["写出 safe", "Write safe"],
      ],
      playbackMs: 2050,
      playbackPolicy: "manual",
      persistentEvidenceZh: "谓词 0 ≤ 2 < 3 和 assert 是否启用必须同时常驻。",
      persistentEvidenceEn:
        "Predicate 0 ≤ 2 < 3 and whether assertions are enabled must remain visible together.",
      hiddenByDefaultZh: "把 assert 当输入验证、崩溃弹窗和信号/调用栈细节。",
      hiddenByDefaultEn:
        "Treating assert as input validation, crash dialogs, and signal or call-stack details.",
      researchUrls: [URL.wg14, URL.seiAssert],
    }),
    120: defineFoaLessonExperience({
      visualFamily: "evidence",
      visualModelZh: "一条四站证据链依次为源码指纹、语义步骤、真实案例和增长数据。",
      visualModelEn:
        "A four-stop evidence chain proceeds through source fingerprint, semantic steps, real cases, and growth data.",
      primaryActionZh: "为插入排序结论选择足够证据，并拒绝把教学动画或移动计数冒充完整运行证据。",
      primaryActionEn:
        "Select sufficient evidence for the insertion-sort claim and reject instructional animation or move counts as complete run evidence.",
      sequence: [
        ["确认源码版本", "Confirm the source version"],
        ["对齐语义与代码行", "Align semantics with source lines"],
        ["核对真实案例输出", "Verify real case outputs"],
        ["比较操作增长", "Compare operation growth"],
      ],
      playbackMs: 2400,
      playbackPolicy: "manual",
      persistentEvidenceZh:
        "单行 evidence ledger 标出来源、fingerprint 与教学/真实身份；operations 仅计移动。",
      persistentEvidenceEn:
        "A one-line evidence ledger records source, fingerprint, and instructional/real status; operations counts moves only.",
      hiddenByDefaultZh: "综合效率分、同时展开四面板、自动 Big-O 结论和重复课程介绍。",
      hiddenByDefaultEn:
        "Composite efficiency scores, four simultaneous panels, automatic Big-O conclusions, and repeated lesson introductions.",
      researchUrls: [URL.algorithmVisualizer, URL.pythonTutor, URL.visualgoSorting],
    }),
  });
