import type { LibraryEntryInput } from "./contracts.js";

export const LANGUAGE_LIBRARY_ENTRIES: readonly LibraryEntryInput[] = [
  e(
    "c.translation-unit",
    "c-syntax",
    "翻译单元",
    "一个 C 源文件经过预处理后形成翻译单元，包含声明、函数定义和预处理结果。",
    [
      "头文件通过 #include 把声明文本纳入翻译单元；链接器再把多个目标文件中的符号组合成程序。",
      "本平台当前以单个 main.c 为事实源。多文件扩展必须显式定义每个翻译单元和链接参数。",
    ],
    { aliases: ["translation unit"], related: ["c.preprocessor", "c.functions"] },
  ),
  e(
    "c.statement",
    "c-syntax",
    "语句与复合语句",
    "语句描述一次控制动作；花括号包围的 compound statement 形成可容纳多条子语句的块。",
    [
      "表达式语句通常以分号结束。if、for、while、switch 和 return 也属于语句，但控制结构有自己的子语法。",
      "画布安全插入只使用明确的 statement-list。无大括号控制体旁插入可能改变归属，因此默认拒绝。",
    ],
    {
      aliases: ["statement", "compound statement"],
      example: c("复合语句", "{\n  int value = 1;\n  value++;\n}"),
      related: ["c.control-flow", "manual.custom-blocks"],
    },
  ),
  e(
    "c.types",
    "c-syntax",
    "基本类型与转换",
    "C 的整数、浮点和字符类型具有实现相关宽度；表达式还会发生整数提升和通常算术转换。",
    [
      "不要假设 int 永远是特定字节数。需要精确宽度时使用 <stdint.h> 的 int32_t 等类型，并检查平台是否提供。",
      "有符号与无符号混算可能把负数转换成很大的无符号值。比较前先确认两侧的实际类型。",
    ],
    {
      aliases: ["integer promotion", "usual arithmetic conversions"],
      related: ["std.integer-types", "c.undefined-behavior"],
    },
  ),
  e(
    "c.declarations-scope",
    "c-syntax",
    "声明、定义与作用域",
    "声明介绍名字和类型，定义为对象分配存储或提供函数体；作用域决定名字在哪些源码区域可见。",
    [
      "块作用域变量从声明点开始可见，内层同名声明会遮蔽外层名字。文件作用域对象的存储期通常覆盖整个程序。",
      "先声明再使用，并尽量缩小变量作用域。遮蔽会增加阅读和重命名风险。",
    ],
    {
      aliases: ["declaration", "definition", "scope", "storage duration"],
      example: c("块作用域", "int total = 0;\n{\n  int item = 3;\n  total += item;\n}"),
      related: ["c.functions", "c.pointers"],
    },
  ),
  e(
    "c.operators",
    "c-syntax",
    "运算符、优先级与求值",
    "优先级决定语法分组，结合性解决同级分组；它们不保证操作数的运行时求值顺序。",
    [
      "不确定时使用括号表达意图。&&、||、?: 和逗号运算符具有规定的序列关系，普通函数参数求值顺序通常不应依赖。",
      "在一个未排序表达式中多次修改同一标量可能产生未定义行为，例如 i = i++ + 1。",
    ],
    {
      aliases: ["operator precedence", "associativity", "evaluation order"],
      example: c("明确分组", "int result = (a + b) * c;"),
      related: ["c.undefined-behavior", "c.control-flow"],
    },
  ),
  e(
    "c.control-flow",
    "c-syntax",
    "if 与 switch",
    "if 根据标量条件选择 true/false 路径；switch 根据整型表达式跳转到匹配 case 或 default。",
    [
      "C 中零为假，非零为真。switch 的 case 默认会继续落入后续 case，除非使用 break、return 或其他转移。",
      "case 标签必须是整型常量表达式且不重复。故意 fallthrough 应明确注释，避免误判。",
    ],
    {
      aliases: ["if", "else", "switch", "case", "fallthrough"],
      example: c(
        "明确 switch 退出",
        "switch (code) {\n  case 0: result = 1; break;\n  default: result = -1; break;\n}",
      ),
      related: ["canvas.branching", "c.loops"],
    },
  ),
  e(
    "c.loops",
    "c-syntax",
    "for、while 与 do-while",
    "循环由初始化、条件、更新和循环体组合；必须能说明循环不变量和终止条件。",
    [
      "while 先检查条件，do-while 至少执行一次，for 适合把计数器生命周期集中在头部。break 离开最近循环，continue 进入下一轮。",
      "数组循环常用 0 <= i < length。混用 size_t 与负数或写成 <= length 是常见越界来源。",
    ],
    {
      aliases: ["loop", "for", "while", "do while", "invariant"],
      example: c("半开区间遍历", "for (size_t i = 0; i < length; i++) {\n  sum += values[i];\n}"),
      related: ["c.arrays", "algorithms.big-o", "recovery.runtime-limit"],
    },
  ),
  e(
    "c.functions",
    "c-syntax",
    "函数声明与调用",
    "函数原型规定返回类型和参数类型，定义提供函数体；调用前必须有兼容声明。",
    [
      "使用 int f(void) 明确表示无参数；空参数列表 int f() 在 C 中含义不同。数组参数会调整为指针，长度必须另行传递。",
      "返回局部自动变量地址会产生悬空指针。大型结构可通过指针参数输出，但要明确所有权。",
    ],
    {
      aliases: ["function prototype", "parameter", "return"],
      example: c("数组加长度", "int sum(const int values[], size_t length);"),
      related: ["c.recursion", "c.pointers"],
    },
  ),
  e(
    "c.recursion",
    "c-syntax",
    "递归与调用栈",
    "递归函数通过更小子问题调用自身，必须具有可达基本情况，并承担每层栈帧开销。",
    [
      "证明终止时指出度量如何严格减小。深度接近输入规模的递归可能耗尽栈，应考虑迭代或显式栈。",
      "递归时间取决于分支数量和重复子问题。记忆化可以避免重复，但会增加存储。",
      "阅读递归运行状态时分开看下潜与回卷：factorial(5) 先建立 5→4→3→2→1 的栈帧，再按 1→2→6→24→120 返回。",
    ],
    {
      aliases: ["recursion", "base case", "call stack"],
      example: c(
        "带基本情况的递归",
        "int factorial(int n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}",
      ),
      related: ["algorithms.divide-conquer", "algorithms.dynamic-programming", "data.stack"],
    },
  ),
  e(
    "c.arrays",
    "c-syntax",
    "数组与边界",
    "数组包含固定数量的同类型连续元素，下标有效范围是 0 到 length - 1。",
    [
      "多数表达式中数组会衰减为首元素指针，函数无法从该指针恢复元素数量。sizeof 只有在数组本体仍可见时才能得到整个数组大小。",
      "越界访问是未定义行为。遍历采用半开区间，并让长度随指针一起传递。",
    ],
    {
      aliases: ["array", "index", "bounds"],
      example: c("静态元素数量", "size_t count = sizeof values / sizeof values[0];"),
      related: ["c.pointers", "data.dynamic-array"],
    },
  ),
  e(
    "c.strings",
    "c-syntax",
    "C 字符串",
    "C 字符串是以空字符 '\\0' 结尾的 char 序列；容量必须同时容纳内容和终止符。",
    [
      '字符串字面量不可修改。char buffer[] = "abc" 创建可修改数组，而 const char *text = "abc" 表达只读使用意图。',
      "strlen 不包含终止符且要求输入已经正确终止。复制和拼接前必须计算目标容量。",
    ],
    {
      aliases: ["string", "null terminator", "NUL"],
      example: c("可修改字符串数组", 'char name[8] = "Ada";\nsize_t length = strlen(name);'),
      related: ["std.string", "std.memory"],
    },
  ),
  e(
    "c.pointers",
    "c-syntax",
    "指针、地址与解引用",
    "指针保存对象或函数地址；解引用前必须保证地址有效、对齐正确、对象仍存活且类型兼容。",
    [
      "&object 取得地址，*pointer 访问所指对象。NULL 表示空指针值，但空指针不能解引用。",
      "指针算术只在同一数组对象及尾后一位范围内定义。比较或相减无关对象的指针通常没有可移植语义。",
    ],
    {
      aliases: ["pointer", "address", "dereference", "NULL"],
      example: c("空指针检查", "if (node != NULL) {\n  node->value = 1;\n}"),
      related: ["c.dynamic-memory", "data.linked-list"],
    },
  ),
  e(
    "c.structs",
    "c-syntax",
    "struct、union、enum 与 typedef",
    "struct 聚合多个字段，union 让成员共享存储，enum 定义命名整数常量，typedef 为类型声明别名。",
    [
      "结构赋值按值复制所有字段，但其中的指针只复制地址。union 读取非活动成员涉及严格规则，不应当作任意类型转换工具。",
      "typedef 不创建新运行时类型。为结构使用清晰标签和别名，避免隐藏指针所有权。",
    ],
    {
      aliases: ["struct", "union", "enum", "typedef"],
      example: c(
        "自引用节点",
        "typedef struct Node {\n  int value;\n  struct Node *next;\n} Node;",
      ),
      related: ["data.linked-list", "c.dynamic-memory"],
    },
  ),
  e(
    "c.dynamic-memory",
    "c-syntax",
    "动态内存与所有权",
    "malloc/calloc 分配动态存储，realloc 调整块，free 释放；每个成功分配需要明确唯一释放责任。",
    [
      "检查分配失败。realloc 先保存到临时指针，否则失败时可能丢失原块；free 后立即停止使用旧地址。",
      "double free、use-after-free、泄漏和错误大小计算都是高风险缺陷。优先把所有权写入接口约定。",
    ],
    {
      aliases: ["malloc", "calloc", "realloc", "free", "ownership"],
      example: c(
        "安全 realloc 模式",
        "int *next = realloc(values, new_count * sizeof *values);\nif (next != NULL) values = next;",
      ),
      related: ["std.stdlib", "data.dynamic-array"],
    },
  ),
  e(
    "c.preprocessor",
    "c-syntax",
    "预处理器与宏",
    "预处理在 C 语法解析前处理 #include、#define 和条件编译，宏只是 token 替换。",
    [
      "多次使用参数的宏可能重复求值。表达式宏应给参数和整体加括号，但 inline 函数通常更安全。",
      "条件编译会产生不同翻译单元。画布对宏边界保持保守，避免把不可见分支当作确定事实。",
    ],
    {
      aliases: ["preprocessor", "macro", "include", "ifdef"],
      example: c("安全常量宏", "#define BUFFER_CAPACITY 128"),
      related: ["c.translation-unit", "canvas.locked-regions"],
    },
  ),
  e(
    "c.undefined-behavior",
    "c-syntax",
    "未定义行为",
    "未定义行为表示 C 标准不约束结果，程序可能崩溃、看似正常或被优化成意外逻辑。",
    [
      "常见来源包括越界、已释放内存、空指针解引用、有符号溢出、未排序的冲突修改和错误格式说明符。",
      "一次运行成功不能证明没有 UB。结合编译警告、边界测试、静态分析和清晰所有权减少风险。",
    ],
    {
      aliases: ["undefined behavior", "UB"],
      related: ["execution.resource-limits", "c.operators", "c.arrays"],
    },
  ),

  e(
    "std.stdio",
    "standard-library",
    "<stdio.h>",
    "标准输入输出头提供 FILE 流、字符/行读写、格式化 I/O 和文件定位接口。",
    [
      "stdin、stdout 和 stderr 是预定义流。每个 I/O 调用都要检查返回值，文件流用完后调用 fclose。",
      "文本与二进制模式在不同平台可能有差异。不要把用户输入直接用作 printf 格式字符串。",
    ],
    {
      aliases: ["stdio", "FILE", "fopen", "fclose"],
      related: ["std.formatted-io", "examples.test-matrix"],
    },
  ),
  e(
    "std.formatted-io",
    "standard-library",
    "printf 与 scanf 家族",
    "格式化 I/O 依靠格式说明符解释可变参数，说明符与实际类型不匹配会产生未定义行为。",
    [
      "printf 的 %zu 对应 size_t，%p 需要 void *。snprintf 可限制写入容量，并返回本应写入的长度。",
      "scanf 必须限制 %s 宽度并检查成功转换数量；复杂输入通常使用 fgets 后再解析更可靠。",
    ],
    {
      aliases: ["printf", "scanf", "snprintf", "format specifier"],
      example: c(
        "限制格式化输出",
        'char buffer[32];\nint written = snprintf(buffer, sizeof buffer, "%d", value);',
      ),
      related: ["std.stdio", "c.undefined-behavior"],
    },
  ),
  e(
    "std.stdlib",
    "standard-library",
    "<stdlib.h>",
    "通用工具头提供动态内存、数值转换、进程终止、排序和二分查找接口。",
    [
      "malloc 家族返回 void *，C 中不需要强制转换。strtol 比 atoi 更能检测范围、尾随字符和无转换情况。",
      "exit 执行正常终止处理，abort 异常终止。算法学习代码仍应从 main 返回明确状态。",
    ],
    {
      aliases: ["stdlib", "strtol", "exit", "abort"],
      related: ["c.dynamic-memory", "std.qsort-bsearch"],
    },
  ),
  e(
    "std.string",
    "standard-library",
    "<string.h> 字符串函数",
    "strlen、strcmp、strcpy、strcat 等接口处理 NUL 结尾字符串，调用方必须保证输入有效和容量足够。",
    [
      "strcmp 返回负、零或正，不保证只返回 -1、0、1。strncpy 不总是添加终止符，不能直接视为安全 strcpy。",
      "优先记录缓冲区容量，使用 snprintf 或显式长度检查，并区分字符串函数与原始内存函数。",
    ],
    { aliases: ["strlen", "strcmp", "strcpy", "strcat"], related: ["c.strings", "std.memory"] },
  ),
  e(
    "std.memory",
    "standard-library",
    "memcpy、memmove 与 memset",
    "原始内存函数按字节操作对象表示；memcpy 要求源目标不重叠，memmove 支持重叠。",
    [
      "第三个参数是字节数。复制数组时使用 count * sizeof *array，并先检查乘法不会溢出。",
      "memset(ptr, 0, size) 常用于全零表示，但并非所有抽象值都可通过任意字节模式构造。",
    ],
    {
      aliases: ["memcpy", "memmove", "memset", "memcmp"],
      example: c("重叠移动", "memmove(values + 1, values, count * sizeof *values);"),
      related: ["c.arrays", "c.dynamic-memory"],
    },
  ),
  e(
    "std.math",
    "standard-library",
    "<math.h>",
    "数学头提供 sqrt、pow、fabs、floor 等浮点函数，部分工具链链接时需要数学库配置。",
    [
      "浮点结果通常不能用 == 判断近似相等。选择与数据尺度一致的容差，并处理 NaN 和无穷。",
      "pow(x, 2) 不一定比 x * x 清晰或高效。整数算法不要用浮点近似代替可证明的整数逻辑。",
    ],
    {
      aliases: ["math", "sqrt", "pow", "fabs"],
      related: ["algorithms.numeric-stability", "c.types"],
    },
  ),
  e(
    "std.ctype",
    "standard-library",
    "<ctype.h>",
    "字符分类和大小写转换函数包括 isdigit、isspace、tolower 等，参数必须是 EOF 或可表示为 unsigned char 的值。",
    [
      "若 char 为有符号，直接传入负 char 可能产生未定义行为；先转换为 (unsigned char)。",
      "这些函数按当前 locale 工作。解析 ASCII 协议时要明确是否接受 locale 相关字符。",
    ],
    {
      aliases: ["ctype", "isdigit", "isspace", "tolower"],
      example: c("安全字符分类", "if (isdigit((unsigned char)input)) { /* ... */ }"),
      related: ["c.strings", "c.undefined-behavior"],
    },
  ),
  e(
    "std.assert",
    "standard-library",
    "<assert.h>",
    "assert 在调试构建中验证程序员认为必然成立的条件，失败时终止程序；NDEBUG 可移除求值。",
    [
      "不要在 assert 表达式中放必须发生的副作用，因为定义 NDEBUG 后表达式可能完全不执行。",
      "用户输入错误需要正常错误处理，不应只依赖 assert。画布把有效 assert 建模为 true 继续和 false 终止。",
    ],
    {
      aliases: ["assert", "NDEBUG"],
      example: c("无副作用断言", "assert(index < length);"),
      related: ["canvas.branching", "execution.diagnostics"],
    },
  ),
  e(
    "std.qsort-bsearch",
    "standard-library",
    "qsort 与 bsearch",
    "qsort 和 bsearch 对 void * 数组使用比较器；比较器必须建立一致的严格顺序。",
    [
      "不要用 return left - right 比较可能溢出的整数。使用关系比较组合返回 -1、0、1。",
      "bsearch 要求输入已按同一比较器排序，返回找到元素的指针或 NULL。",
    ],
    {
      aliases: ["qsort", "bsearch", "comparator"],
      example: c(
        "无溢出比较器",
        "int compare_int(const void *a, const void *b) {\n  int x = *(const int *)a;\n  int y = *(const int *)b;\n  return (x > y) - (x < y);\n}",
      ),
      related: ["algorithms.sorting", "algorithms.binary-search"],
    },
  ),
  e(
    "std.integer-types",
    "standard-library",
    "<stdint.h> 与 <inttypes.h>",
    "固定宽度与最大宽度整数类型用于协议、文件格式和精确位运算，格式宏提供可移植打印方式。",
    [
      "int32_t 等精确宽度类型是可选的；uint_least32_t 和 uint_fast32_t 提供至少宽度或速度取舍。",
      "使用 PRIu64 等宏打印 uint64_t，避免假设它等同 unsigned long。",
    ],
    {
      aliases: ["stdint", "inttypes", "int32_t", "uint64_t"],
      example: c("可移植格式宏", 'printf("%" PRIu64 "\\n", count);'),
      related: ["c.types", "c.undefined-behavior"],
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
