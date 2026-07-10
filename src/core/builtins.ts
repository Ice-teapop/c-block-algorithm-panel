export type BuiltinHeader = `<${string}.h>`;

export interface BuiltinFunctionEntry {
  readonly name: string;
  readonly signatureText: string;
  readonly header: BuiltinHeader;
  readonly description: string;
}

export interface BuiltinTypedefEntry {
  readonly name: string;
  readonly header: BuiltinHeader;
  readonly description: string;
}

export interface BuiltinObjectMacroEntry {
  readonly name: string;
  readonly header: BuiltinHeader;
  readonly valueText: string;
  readonly description: string;
}

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const HEADER_PATTERN = /^<[a-z0-9_]+\.h>$/u;

const FUNCTION_ROWS: readonly unknown[] = [
  ["remove", "int remove(const char *filename);", "<stdio.h>", "删除由路径命名的文件。"],
  [
    "rename",
    "int rename(const char *old, const char *new);",
    "<stdio.h>",
    "重命名文件或把它移动到同一文件系统中的新路径。",
  ],
  ["fclose", "int fclose(FILE *stream);", "<stdio.h>", "刷新并关闭一个已打开的流。"],
  ["fflush", "int fflush(FILE *stream);", "<stdio.h>", "把输出流的缓冲数据提交到底层文件。"],
  [
    "fopen",
    "FILE *fopen(const char * restrict filename, const char * restrict mode);",
    "<stdio.h>",
    "按指定模式打开文件并返回流指针。",
  ],
  [
    "freopen",
    "FILE *freopen(const char * restrict filename, const char * restrict mode, FILE * restrict stream);",
    "<stdio.h>",
    "关闭并重新绑定一个现有流，常用于重定向标准流。",
  ],
  [
    "setbuf",
    "void setbuf(FILE * restrict stream, char * restrict buf);",
    "<stdio.h>",
    "为流选择调用者提供的缓冲区或关闭缓冲。",
  ],
  [
    "setvbuf",
    "int setvbuf(FILE * restrict stream, char * restrict buf, int mode, size_t size);",
    "<stdio.h>",
    "在流执行其他操作前精细设置缓冲模式和大小。",
  ],
  [
    "fprintf",
    "int fprintf(FILE * restrict stream, const char * restrict format, ...);",
    "<stdio.h>",
    "按格式把文本写入指定流。",
  ],
  [
    "fscanf",
    "int fscanf(FILE * restrict stream, const char * restrict format, ...);",
    "<stdio.h>",
    "按格式从指定流读取并转换输入。",
  ],
  [
    "printf",
    "int printf(const char * restrict format, ...);",
    "<stdio.h>",
    "按格式把文本写到标准输出。",
  ],
  [
    "scanf",
    "int scanf(const char * restrict format, ...);",
    "<stdio.h>",
    "按格式从标准输入读取并转换数据。",
  ],
  [
    "snprintf",
    "int snprintf(char * restrict s, size_t n, const char * restrict format, ...);",
    "<stdio.h>",
    "按格式写入有容量上限的字符数组，并报告所需长度。",
  ],
  [
    "sprintf",
    "int sprintf(char * restrict s, const char * restrict format, ...);",
    "<stdio.h>",
    "按格式写入字符数组，但不会自行检查目标容量。",
  ],
  [
    "sscanf",
    "int sscanf(const char * restrict s, const char * restrict format, ...);",
    "<stdio.h>",
    "按格式从字符串中读取并转换数据。",
  ],
  ["fgetc", "int fgetc(FILE *stream);", "<stdio.h>", "从流读取一个字节并以 int 返回。"],
  [
    "fgets",
    "char *fgets(char * restrict s, int n, FILE * restrict stream);",
    "<stdio.h>",
    "从流读取一行或至多 n-1 个字符，并补上字符串终止符。",
  ],
  ["fputc", "int fputc(int c, FILE *stream);", "<stdio.h>", "向流写入一个字节。"],
  [
    "fputs",
    "int fputs(const char * restrict s, FILE * restrict stream);",
    "<stdio.h>",
    "把字符串写入流，但不会自动追加换行。",
  ],
  ["getc", "int getc(FILE *stream);", "<stdio.h>", "从流读取一个字节，语义与 fgetc 相同。"],
  ["getchar", "int getchar(void);", "<stdio.h>", "从标准输入读取一个字节。"],
  ["putc", "int putc(int c, FILE *stream);", "<stdio.h>", "向流写入一个字节，语义与 fputc 相同。"],
  ["putchar", "int putchar(int c);", "<stdio.h>", "向标准输出写入一个字节。"],
  ["puts", "int puts(const char *s);", "<stdio.h>", "把字符串和一个换行写到标准输出。"],
  ["ungetc", "int ungetc(int c, FILE *stream);", "<stdio.h>", "把一个字节退回输入流供下一次读取。"],
  [
    "fread",
    "size_t fread(void * restrict ptr, size_t size, size_t nmemb, FILE * restrict stream);",
    "<stdio.h>",
    "从流读取 nmemb 个定长对象到内存。",
  ],
  [
    "fwrite",
    "size_t fwrite(const void * restrict ptr, size_t size, size_t nmemb, FILE * restrict stream);",
    "<stdio.h>",
    "把内存中的 nmemb 个定长对象写入流。",
  ],
  [
    "fseek",
    "int fseek(FILE *stream, long int offset, int whence);",
    "<stdio.h>",
    "相对指定基准移动文件位置指示器。",
  ],
  ["ftell", "long int ftell(FILE *stream);", "<stdio.h>", "返回当前文件位置指示器的值。"],
  ["rewind", "void rewind(FILE *stream);", "<stdio.h>", "把文件位置移回开头并清除流错误状态。"],
  ["clearerr", "void clearerr(FILE *stream);", "<stdio.h>", "清除流的文件结束和错误标志。"],
  ["feof", "int feof(FILE *stream);", "<stdio.h>", "查询流的文件结束标志是否已设置。"],
  ["ferror", "int ferror(FILE *stream);", "<stdio.h>", "查询流的错误标志是否已设置。"],
  [
    "perror",
    "void perror(const char *s);",
    "<stdio.h>",
    "把前缀和当前 errno 对应的错误说明写到标准错误。",
  ],

  [
    "atof",
    "double atof(const char *nptr);",
    "<stdlib.h>",
    "把字符串转换为 double，但不能可靠报告转换错误。",
  ],
  [
    "atoi",
    "int atoi(const char *nptr);",
    "<stdlib.h>",
    "把字符串转换为 int，但不能可靠报告转换错误。",
  ],
  [
    "atol",
    "long int atol(const char *nptr);",
    "<stdlib.h>",
    "把字符串转换为 long，但不能可靠报告转换错误。",
  ],
  [
    "atoll",
    "long long int atoll(const char *nptr);",
    "<stdlib.h>",
    "把字符串转换为 long long，但不能可靠报告转换错误。",
  ],
  [
    "strtod",
    "double strtod(const char * restrict nptr, char ** restrict endptr);",
    "<stdlib.h>",
    "把字符串前缀转换为 double，并通过 endptr 标出停止位置。",
  ],
  [
    "strtof",
    "float strtof(const char * restrict nptr, char ** restrict endptr);",
    "<stdlib.h>",
    "把字符串前缀转换为 float，并通过 endptr 标出停止位置。",
  ],
  [
    "strtold",
    "long double strtold(const char * restrict nptr, char ** restrict endptr);",
    "<stdlib.h>",
    "把字符串前缀转换为 long double，并通过 endptr 标出停止位置。",
  ],
  [
    "strtol",
    "long int strtol(const char * restrict nptr, char ** restrict endptr, int base);",
    "<stdlib.h>",
    "按给定进制转换有符号整数，并保留停止位置以便校验输入。",
  ],
  [
    "strtoll",
    "long long int strtoll(const char * restrict nptr, char ** restrict endptr, int base);",
    "<stdlib.h>",
    "按给定进制转换 long long，并保留停止位置以便校验输入。",
  ],
  [
    "strtoul",
    "unsigned long int strtoul(const char * restrict nptr, char ** restrict endptr, int base);",
    "<stdlib.h>",
    "按给定进制转换 unsigned long，并保留停止位置。",
  ],
  [
    "strtoull",
    "unsigned long long int strtoull(const char * restrict nptr, char ** restrict endptr, int base);",
    "<stdlib.h>",
    "按给定进制转换 unsigned long long，并保留停止位置。",
  ],
  ["rand", "int rand(void);", "<stdlib.h>", "返回伪随机序列中的下一个整数。"],
  ["srand", "void srand(unsigned int seed);", "<stdlib.h>", "用种子重置 rand 使用的伪随机序列。"],
  [
    "aligned_alloc",
    "void *aligned_alloc(size_t alignment, size_t size);",
    "<stdlib.h>",
    "按指定对齐申请动态存储，且 size 必须满足标准的对齐倍数约束。",
  ],
  [
    "calloc",
    "void *calloc(size_t nmemb, size_t size);",
    "<stdlib.h>",
    "申请对象数组并把所有字节初始化为零。",
  ],
  ["free", "void free(void *ptr);", "<stdlib.h>", "释放先前由动态分配函数获得的存储。"],
  ["malloc", "void *malloc(size_t size);", "<stdlib.h>", "申请至少 size 字节的未初始化动态存储。"],
  [
    "realloc",
    "void *realloc(void *ptr, size_t size);",
    "<stdlib.h>",
    "调整动态分配块大小，必要时搬移其内容。",
  ],
  [
    "abort",
    "_Noreturn void abort(void);",
    "<stdlib.h>",
    "立即异常终止程序并触发实现定义的清理行为。",
  ],
  [
    "atexit",
    "int atexit(void (*func)(void));",
    "<stdlib.h>",
    "登记在正常 exit 终止时逆序调用的函数。",
  ],
  [
    "at_quick_exit",
    "int at_quick_exit(void (*func)(void));",
    "<stdlib.h>",
    "登记在 quick_exit 终止时逆序调用的函数。",
  ],
  [
    "exit",
    "_Noreturn void exit(int status);",
    "<stdlib.h>",
    "以状态码正常终止程序并执行已登记的正常清理。",
  ],
  [
    "_Exit",
    "_Noreturn void _Exit(int status);",
    "<stdlib.h>",
    "立即正常终止程序而不执行 atexit 处理和流刷新。",
  ],
  [
    "quick_exit",
    "_Noreturn void quick_exit(int status);",
    "<stdlib.h>",
    "执行 quick-exit 处理函数后快速终止程序。",
  ],
  ["getenv", "char *getenv(const char *name);", "<stdlib.h>", "查询宿主环境中的命名字符串。"],
  [
    "system",
    "int system(const char *string);",
    "<stdlib.h>",
    "把命令字符串交给宿主命令处理器，行为依赖运行环境。",
  ],
  [
    "bsearch",
    "void *bsearch(const void *key, const void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));",
    "<stdlib.h>",
    "在已按同一比较器排序的数组中执行二分查找。",
  ],
  [
    "qsort",
    "void qsort(void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));",
    "<stdlib.h>",
    "按比较函数对通用对象数组排序，标准不保证稳定性。",
  ],
  ["abs", "int abs(int j);", "<stdlib.h>", "返回 int 的绝对值，最小负值不可表示时行为未定义。"],
  [
    "labs",
    "long int labs(long int j);",
    "<stdlib.h>",
    "返回 long 的绝对值，最小负值不可表示时行为未定义。",
  ],
  [
    "llabs",
    "long long int llabs(long long int j);",
    "<stdlib.h>",
    "返回 long long 的绝对值，最小负值不可表示时行为未定义。",
  ],

  [
    "memcpy",
    "void *memcpy(void * restrict s1, const void * restrict s2, size_t n);",
    "<string.h>",
    "复制 n 个字节，源和目标重叠时行为未定义。",
  ],
  [
    "memmove",
    "void *memmove(void *s1, const void *s2, size_t n);",
    "<string.h>",
    "安全复制 n 个字节，即使源和目标区间重叠。",
  ],
  [
    "strcpy",
    "char *strcpy(char * restrict s1, const char * restrict s2);",
    "<string.h>",
    "复制含终止符的字符串，调用者必须保证目标容量足够。",
  ],
  [
    "strncpy",
    "char *strncpy(char * restrict s1, const char * restrict s2, size_t n);",
    "<string.h>",
    "最多复制 n 个字符，源过长时结果可能没有字符串终止符。",
  ],
  [
    "strcat",
    "char *strcat(char * restrict s1, const char * restrict s2);",
    "<string.h>",
    "把源字符串追加到目标末尾，目标必须有足够容量。",
  ],
  [
    "strncat",
    "char *strncat(char * restrict s1, const char * restrict s2, size_t n);",
    "<string.h>",
    "把源字符串的至多 n 个字符追加到目标并补终止符。",
  ],
  [
    "memcmp",
    "int memcmp(const void *s1, const void *s2, size_t n);",
    "<string.h>",
    "按 unsigned char 逐字节比较两个 n 字节区域。",
  ],
  [
    "strcmp",
    "int strcmp(const char *s1, const char *s2);",
    "<string.h>",
    "按无符号字符字典序比较两个字符串。",
  ],
  [
    "strcoll",
    "int strcoll(const char *s1, const char *s2);",
    "<string.h>",
    "按当前 LC_COLLATE 本地化规则比较字符串。",
  ],
  [
    "strncmp",
    "int strncmp(const char *s1, const char *s2, size_t n);",
    "<string.h>",
    "比较两个字符串的至多前 n 个字符。",
  ],
  [
    "strxfrm",
    "size_t strxfrm(char * restrict s1, const char * restrict s2, size_t n);",
    "<string.h>",
    "把字符串转换为可用 strcmp 体现当前排序规则的形式。",
  ],
  [
    "memchr",
    "void *memchr(const void *s, int c, size_t n);",
    "<string.h>",
    "在前 n 个字节中查找第一个指定字节。",
  ],
  [
    "strchr",
    "char *strchr(const char *s, int c);",
    "<string.h>",
    "在字符串中查找指定字符的第一次出现。",
  ],
  [
    "strcspn",
    "size_t strcspn(const char *s1, const char *s2);",
    "<string.h>",
    "计算 s1 开头连续不含 s2 任一字符的长度。",
  ],
  [
    "strpbrk",
    "char *strpbrk(const char *s1, const char *s2);",
    "<string.h>",
    "查找 s1 中第一个属于 s2 字符集合的位置。",
  ],
  [
    "strrchr",
    "char *strrchr(const char *s, int c);",
    "<string.h>",
    "在字符串中查找指定字符的最后一次出现。",
  ],
  [
    "strspn",
    "size_t strspn(const char *s1, const char *s2);",
    "<string.h>",
    "计算 s1 开头连续只含 s2 字符集合的长度。",
  ],
  [
    "strstr",
    "char *strstr(const char *s1, const char *s2);",
    "<string.h>",
    "查找子字符串第一次出现的位置。",
  ],
  [
    "strtok",
    "char *strtok(char * restrict s1, const char * restrict s2);",
    "<string.h>",
    "原地分割字符串并在多次调用间保存内部状态。",
  ],
  [
    "memset",
    "void *memset(void *s, int c, size_t n);",
    "<string.h>",
    "把前 n 个字节都写成给定 unsigned char 值。",
  ],
  [
    "strerror",
    "char *strerror(int errnum);",
    "<string.h>",
    "把错误编号映射为实现提供的说明字符串。",
  ],
  [
    "strlen",
    "size_t strlen(const char *s);",
    "<string.h>",
    "计算终止符之前的字符数，不包含终止符。",
  ],

  ["isalnum", "int isalnum(int c);", "<ctype.h>", "判断字符是否为字母或十进制数字。"],
  ["isalpha", "int isalpha(int c);", "<ctype.h>", "判断字符是否为字母。"],
  ["isblank", "int isblank(int c);", "<ctype.h>", "判断字符是否为空格或横向制表等空白字符。"],
  ["iscntrl", "int iscntrl(int c);", "<ctype.h>", "判断字符是否为控制字符。"],
  ["isdigit", "int isdigit(int c);", "<ctype.h>", "判断字符是否为十进制数字。"],
  ["isgraph", "int isgraph(int c);", "<ctype.h>", "判断字符是否有可见图形且不是空格。"],
  ["islower", "int islower(int c);", "<ctype.h>", "判断字符是否为小写字母。"],
  ["isprint", "int isprint(int c);", "<ctype.h>", "判断字符是否可打印，包括空格。"],
  ["ispunct", "int ispunct(int c);", "<ctype.h>", "判断字符是否为既非字母数字也非空格的标点。"],
  ["isspace", "int isspace(int c);", "<ctype.h>", "判断字符是否属于标准空白字符集合。"],
  ["isupper", "int isupper(int c);", "<ctype.h>", "判断字符是否为大写字母。"],
  ["isxdigit", "int isxdigit(int c);", "<ctype.h>", "判断字符是否为十六进制数字。"],
  [
    "tolower",
    "int tolower(int c);",
    "<ctype.h>",
    "若字符为大写字母则转换为对应小写，否则原样返回。",
  ],
  [
    "toupper",
    "int toupper(int c);",
    "<ctype.h>",
    "若字符为小写字母则转换为对应大写，否则原样返回。",
  ],

  ["acos", "double acos(double x);", "<math.h>", "计算 x 的反余弦，结果以弧度表示。"],
  ["asin", "double asin(double x);", "<math.h>", "计算 x 的反正弦，结果以弧度表示。"],
  ["atan", "double atan(double x);", "<math.h>", "计算 x 的反正切，结果以弧度表示。"],
  [
    "atan2",
    "double atan2(double y, double x);",
    "<math.h>",
    "结合 x、y 的符号计算 y/x 的象限正确反正切。",
  ],
  ["ceil", "double ceil(double x);", "<math.h>", "返回不小于 x 的最小整数值，结果仍为 double。"],
  ["cos", "double cos(double x);", "<math.h>", "计算弧度参数 x 的余弦。"],
  ["exp", "double exp(double x);", "<math.h>", "计算自然常数 e 的 x 次幂。"],
  ["fabs", "double fabs(double x);", "<math.h>", "返回浮点数 x 的绝对值。"],
  ["floor", "double floor(double x);", "<math.h>", "返回不大于 x 的最大整数值，结果仍为 double。"],
  ["fmod", "double fmod(double x, double y);", "<math.h>", "计算 x/y 截断商对应的浮点余数。"],
  [
    "hypot",
    "double hypot(double x, double y);",
    "<math.h>",
    "稳健计算 sqrt(x*x + y*y)，减少不必要的溢出和下溢。",
  ],
  ["log", "double log(double x);", "<math.h>", "计算 x 的自然对数。"],
  ["log10", "double log10(double x);", "<math.h>", "计算 x 的以 10 为底对数。"],
  ["log2", "double log2(double x);", "<math.h>", "计算 x 的以 2 为底对数。"],
  [
    "pow",
    "double pow(double x, double y);",
    "<math.h>",
    "计算 x 的 y 次幂并处理相应定义域和范围错误。",
  ],
  ["round", "double round(double x);", "<math.h>", "舍入到最近整数，恰好一半时远离零。"],
  ["sin", "double sin(double x);", "<math.h>", "计算弧度参数 x 的正弦。"],
  ["sqrt", "double sqrt(double x);", "<math.h>", "计算非负平方根，负参数产生定义域错误。"],
  ["tan", "double tan(double x);", "<math.h>", "计算弧度参数 x 的正切。"],
  ["trunc", "double trunc(double x);", "<math.h>", "朝零方向截去小数部分，结果仍为 double。"],
];

const TYPEDEF_ROWS: readonly unknown[] = [
  ["FILE", "<stdio.h>", "表示 C 标准 I/O 流的对象类型。"],
  ["fpos_t", "<stdio.h>", "保存可由 fgetpos 和 fsetpos 往返的文件位置与解析状态。"],
  ["size_t", "<stddef.h>", "无符号整数类型，用于对象大小和数组元素计数。"],
  ["ptrdiff_t", "<stddef.h>", "有符号整数类型，用于两个同数组指针相减的结果。"],
  ["max_align_t", "<stddef.h>", "对齐要求至少覆盖所有标量类型的类型。"],
  ["wchar_t", "<stddef.h>", "能够表示实现所支持宽字符集成员的整数类型。"],
  ["div_t", "<stdlib.h>", "保存 int 除法的商和余数。"],
  ["ldiv_t", "<stdlib.h>", "保存 long 除法的商和余数。"],
  ["lldiv_t", "<stdlib.h>", "保存 long long 除法的商和余数。"],
  ["float_t", "<math.h>", "实现用于至少保持 float 范围和精度的高效求值类型。"],
  ["double_t", "<math.h>", "实现用于至少保持 double 范围和精度的高效求值类型。"],
  ["va_list", "<stdarg.h>", "保存遍历可变参数列表所需的实现状态。"],
  ["jmp_buf", "<setjmp.h>", "保存 setjmp 和 longjmp 使用的调用环境。"],
  ["sig_atomic_t", "<signal.h>", "可在异步信号处理器与普通代码间原子访问的整数类型。"],
  ["clock_t", "<time.h>", "表示实现定义的处理器时间计数。"],
  ["time_t", "<time.h>", "表示日历时间的算术类型。"],
  ["mbstate_t", "<wchar.h>", "保存多字节字符转换的解析状态。"],
  ["wint_t", "<wchar.h>", "能够保存宽字符或 WEOF 的整数类型。"],
  ["wctype_t", "<wctype.h>", "表示可供 iswctype 使用的宽字符分类描述符。"],
  ["wctrans_t", "<wctype.h>", "表示可供 towctrans 使用的宽字符映射描述符。"],
  ["int8_t", "<stdint.h>", "若实现提供无填充的精确 8 位有符号整数类型，则定义此名称。"],
  ["uint8_t", "<stdint.h>", "若实现提供无填充的精确 8 位无符号整数类型，则定义此名称。"],
  ["int16_t", "<stdint.h>", "若实现提供无填充的精确 16 位有符号整数类型，则定义此名称。"],
  ["uint16_t", "<stdint.h>", "若实现提供无填充的精确 16 位无符号整数类型，则定义此名称。"],
  ["int32_t", "<stdint.h>", "若实现提供无填充的精确 32 位有符号整数类型，则定义此名称。"],
  ["uint32_t", "<stdint.h>", "若实现提供无填充的精确 32 位无符号整数类型，则定义此名称。"],
  ["int64_t", "<stdint.h>", "若实现提供无填充的精确 64 位有符号整数类型，则定义此名称。"],
  ["uint64_t", "<stdint.h>", "若实现提供无填充的精确 64 位无符号整数类型，则定义此名称。"],
  ["int_least8_t", "<stdint.h>", "能够表示至少 8 位的最小宽度有符号整数类型。"],
  ["uint_least8_t", "<stdint.h>", "能够表示至少 8 位的最小宽度无符号整数类型。"],
  ["int_least16_t", "<stdint.h>", "能够表示至少 16 位的最小宽度有符号整数类型。"],
  ["uint_least16_t", "<stdint.h>", "能够表示至少 16 位的最小宽度无符号整数类型。"],
  ["int_least32_t", "<stdint.h>", "能够表示至少 32 位的最小宽度有符号整数类型。"],
  ["uint_least32_t", "<stdint.h>", "能够表示至少 32 位的最小宽度无符号整数类型。"],
  ["int_least64_t", "<stdint.h>", "能够表示至少 64 位的最小宽度有符号整数类型。"],
  ["uint_least64_t", "<stdint.h>", "能够表示至少 64 位的最小宽度无符号整数类型。"],
  ["int_fast8_t", "<stdint.h>", "实现认为至少 8 位且通常运算最快的有符号整数类型。"],
  ["uint_fast8_t", "<stdint.h>", "实现认为至少 8 位且通常运算最快的无符号整数类型。"],
  ["int_fast16_t", "<stdint.h>", "实现认为至少 16 位且通常运算最快的有符号整数类型。"],
  ["uint_fast16_t", "<stdint.h>", "实现认为至少 16 位且通常运算最快的无符号整数类型。"],
  ["int_fast32_t", "<stdint.h>", "实现认为至少 32 位且通常运算最快的有符号整数类型。"],
  ["uint_fast32_t", "<stdint.h>", "实现认为至少 32 位且通常运算最快的无符号整数类型。"],
  ["int_fast64_t", "<stdint.h>", "实现认为至少 64 位且通常运算最快的有符号整数类型。"],
  ["uint_fast64_t", "<stdint.h>", "实现认为至少 64 位且通常运算最快的无符号整数类型。"],
  ["intptr_t", "<stdint.h>", "若实现支持，则为可无损保存 void 指针转换结果的有符号整数类型。"],
  ["uintptr_t", "<stdint.h>", "若实现支持，则为可无损保存 void 指针转换结果的无符号整数类型。"],
  ["intmax_t", "<stdint.h>", "能够表示实现支持的任意有符号整数值的最宽整数类型。"],
  ["uintmax_t", "<stdint.h>", "能够表示实现支持的任意无符号整数值的最宽整数类型。"],
];

const OBJECT_MACRO_ROWS: readonly unknown[] = [
  [
    "NULL",
    "<stddef.h>",
    "实现定义的空指针常量宏；不要假定固定展开形式。",
    "用于构造或比较空指针，而不是可解引用的地址。",
  ],
  [
    "EOF",
    "<stdio.h>",
    "实现定义的负 int 常量表达式。",
    "表示字符输入失败或已到达文件末尾，具体负值不可假定。",
  ],
  [
    "BUFSIZ",
    "<stdio.h>",
    "实现为 setbuf 选择的缓冲区大小。",
    "为标准 I/O 缓冲提供实现选择的正整数容量。",
  ],
  [
    "FOPEN_MAX",
    "<stdio.h>",
    "实现保证可同时打开的流数量下界。",
    "描述实现至少支持同时打开多少个文件流。",
  ],
  [
    "FILENAME_MAX",
    "<stdio.h>",
    "实现可处理的文件名字符串容量。",
    "用于为实现支持的最长文件名准备字符数组。",
  ],
  [
    "L_tmpnam",
    "<stdio.h>",
    "tmpnam 结果所需的字符数组大小。",
    "为 tmpnam 生成的临时文件名准备足够空间。",
  ],
  [
    "TMP_MAX",
    "<stdio.h>",
    "tmpnam 保证能生成的不同名字数量下界。",
    "描述实现至少可生成多少个不同临时文件名。",
  ],
  ["SEEK_SET", "<stdio.h>", "实现定义的文件定位标志。", "让 fseek 从文件起点计算偏移。"],
  ["SEEK_CUR", "<stdio.h>", "实现定义的文件定位标志。", "让 fseek 从当前位置计算偏移。"],
  ["SEEK_END", "<stdio.h>", "实现定义的文件定位标志。", "让 fseek 从文件末尾计算偏移。"],
  ["_IOFBF", "<stdio.h>", "实现定义的全缓冲模式常量。", "传给 setvbuf 以选择全缓冲输出。"],
  ["_IOLBF", "<stdio.h>", "实现定义的行缓冲模式常量。", "传给 setvbuf 以选择行缓冲输出。"],
  ["_IONBF", "<stdio.h>", "实现定义的无缓冲模式常量。", "传给 setvbuf 以关闭流缓冲。"],
  [
    "stdin",
    "<stdio.h>",
    "指向标准输入流的 FILE * 表达式。",
    "程序启动时由宿主环境提供的标准输入流。",
  ],
  [
    "stdout",
    "<stdio.h>",
    "指向标准输出流的 FILE * 表达式。",
    "程序启动时由宿主环境提供的标准输出流。",
  ],
  [
    "stderr",
    "<stdio.h>",
    "指向标准错误流的 FILE * 表达式。",
    "程序启动时由宿主环境提供的诊断输出流。",
  ],
  [
    "EXIT_SUCCESS",
    "<stdlib.h>",
    "实现定义的成功终止状态值。",
    "传给 exit 或从 main 返回以报告成功。",
  ],
  [
    "EXIT_FAILURE",
    "<stdlib.h>",
    "实现定义的失败终止状态值。",
    "传给 exit 或从 main 返回以报告失败。",
  ],
  [
    "RAND_MAX",
    "<stdlib.h>",
    "rand 可能返回的最大值，至少为 32767。",
    "给出 rand 伪随机结果的闭区间上界。",
  ],
  [
    "MB_CUR_MAX",
    "<stdlib.h>",
    "当前区域设置下一个多字节字符的最大字节数。",
    "该值可随 LC_CTYPE 区域设置变化，不一定是常量表达式。",
  ],
  [
    "CHAR_BIT",
    "<limits.h>",
    "一个字节中的位数，至少为 8。",
    "把字节数量换算为位数量时使用实现提供的真实宽度。",
  ],
  ["SCHAR_MIN", "<limits.h>", "signed char 可表示的最小值。", "描述 signed char 的实现范围下界。"],
  ["SCHAR_MAX", "<limits.h>", "signed char 可表示的最大值。", "描述 signed char 的实现范围上界。"],
  [
    "UCHAR_MAX",
    "<limits.h>",
    "unsigned char 可表示的最大值。",
    "描述 unsigned char 的实现范围上界。",
  ],
  [
    "CHAR_MIN",
    "<limits.h>",
    "char 可表示的最小值。",
    "取决于普通 char 在该实现上是有符号还是无符号。",
  ],
  ["CHAR_MAX", "<limits.h>", "char 可表示的最大值。", "取决于普通 char 在该实现上的符号性与宽度。"],
  [
    "MB_LEN_MAX",
    "<limits.h>",
    "任一受支持区域设置下多字节字符的最大字节数。",
    "给静态多字节字符缓冲区提供实现范围上界。",
  ],
  ["SHRT_MIN", "<limits.h>", "short 可表示的最小值。", "描述 short 的实现范围下界。"],
  ["SHRT_MAX", "<limits.h>", "short 可表示的最大值。", "描述 short 的实现范围上界。"],
  [
    "USHRT_MAX",
    "<limits.h>",
    "unsigned short 可表示的最大值。",
    "描述 unsigned short 的实现范围上界。",
  ],
  [
    "INT_MIN",
    "<limits.h>",
    "int 可表示的最小值。",
    "描述 int 的实现范围下界，不应写死为某个平台数值。",
  ],
  [
    "INT_MAX",
    "<limits.h>",
    "int 可表示的最大值。",
    "描述 int 的实现范围上界，不应写死为某个平台数值。",
  ],
  ["UINT_MAX", "<limits.h>", "unsigned int 可表示的最大值。", "描述 unsigned int 的实现范围上界。"],
  ["LONG_MIN", "<limits.h>", "long 可表示的最小值。", "描述 long 的实现范围下界。"],
  ["LONG_MAX", "<limits.h>", "long 可表示的最大值。", "描述 long 的实现范围上界。"],
  [
    "ULONG_MAX",
    "<limits.h>",
    "unsigned long 可表示的最大值。",
    "描述 unsigned long 的实现范围上界。",
  ],
  ["LLONG_MIN", "<limits.h>", "long long 可表示的最小值。", "描述 long long 的实现范围下界。"],
  ["LLONG_MAX", "<limits.h>", "long long 可表示的最大值。", "描述 long long 的实现范围上界。"],
  [
    "ULLONG_MAX",
    "<limits.h>",
    "unsigned long long 可表示的最大值。",
    "描述 unsigned long long 的实现范围上界。",
  ],
  ["SIZE_MAX", "<stdint.h>", "size_t 可表示的最大值。", "给对象大小和元素计数提供实现范围上界。"],
  ["PTRDIFF_MIN", "<stdint.h>", "ptrdiff_t 可表示的最小值。", "描述指针差类型的实现范围下界。"],
  ["PTRDIFF_MAX", "<stdint.h>", "ptrdiff_t 可表示的最大值。", "描述指针差类型的实现范围上界。"],
  [
    "INTPTR_MIN",
    "<stdint.h>",
    "若 intptr_t 存在，则给出其最小值。",
    "描述可保存指针的有符号整数类型范围下界。",
  ],
  [
    "INTPTR_MAX",
    "<stdint.h>",
    "若 intptr_t 存在，则给出其最大值。",
    "描述可保存指针的有符号整数类型范围上界。",
  ],
  [
    "UINTPTR_MAX",
    "<stdint.h>",
    "若 uintptr_t 存在，则给出其最大值。",
    "描述可保存指针的无符号整数类型范围上界。",
  ],
  ["INTMAX_MIN", "<stdint.h>", "intmax_t 可表示的最小值。", "描述最宽有符号整数类型的范围下界。"],
  ["INTMAX_MAX", "<stdint.h>", "intmax_t 可表示的最大值。", "描述最宽有符号整数类型的范围上界。"],
  ["UINTMAX_MAX", "<stdint.h>", "uintmax_t 可表示的最大值。", "描述最宽无符号整数类型的范围上界。"],
  [
    "SIG_ATOMIC_MIN",
    "<stdint.h>",
    "sig_atomic_t 可表示的最小值。",
    "描述信号原子整数类型的范围下界。",
  ],
  [
    "SIG_ATOMIC_MAX",
    "<stdint.h>",
    "sig_atomic_t 可表示的最大值。",
    "描述信号原子整数类型的范围上界。",
  ],
  ["WCHAR_MIN", "<stdint.h>", "wchar_t 可表示的最小值。", "描述宽字符整数类型的实现范围下界。"],
  ["WCHAR_MAX", "<stdint.h>", "wchar_t 可表示的最大值。", "描述宽字符整数类型的实现范围上界。"],
  ["WINT_MIN", "<stdint.h>", "wint_t 可表示的最小值。", "描述宽字符 I/O 整数类型的实现范围下界。"],
  ["WINT_MAX", "<stdint.h>", "wint_t 可表示的最大值。", "描述宽字符 I/O 整数类型的实现范围上界。"],
  [
    "HUGE_VAL",
    "<math.h>",
    "表示 double 正溢出结果的实现提供表达式。",
    "数学函数返回 double 溢出结果时使用，具体位模式不可假定。",
  ],
  [
    "HUGE_VALF",
    "<math.h>",
    "表示 float 正溢出结果的实现提供表达式。",
    "数学函数返回 float 溢出结果时使用，具体位模式不可假定。",
  ],
  [
    "HUGE_VALL",
    "<math.h>",
    "表示 long double 正溢出结果的实现提供表达式。",
    "数学函数返回 long double 溢出结果时使用，具体位模式不可假定。",
  ],
  [
    "INFINITY",
    "<math.h>",
    "表示正无穷的 float 常量表达式，具体表示由实现决定。",
    "用于支持无穷值的浮点实现，不能假定位模式。",
  ],
  [
    "NAN",
    "<math.h>",
    "若实现支持静默 NaN，则表示该值的 float 常量表达式。",
    "用于构造非数值浮点结果，具体载荷与位模式由实现决定。",
  ],
  [
    "FP_INFINITE",
    "<math.h>",
    "fpclassify 返回类别之一，具体整数值由实现决定。",
    "表示无穷浮点分类。",
  ],
  ["FP_NAN", "<math.h>", "fpclassify 返回类别之一，具体整数值由实现决定。", "表示 NaN 浮点分类。"],
  [
    "FP_NORMAL",
    "<math.h>",
    "fpclassify 返回类别之一，具体整数值由实现决定。",
    "表示规格化有限非零浮点分类。",
  ],
  [
    "FP_SUBNORMAL",
    "<math.h>",
    "fpclassify 返回类别之一，具体整数值由实现决定。",
    "表示次规格化有限非零浮点分类。",
  ],
  [
    "FP_ZERO",
    "<math.h>",
    "fpclassify 返回类别之一，具体整数值由实现决定。",
    "表示正零或负零浮点分类。",
  ],
  [
    "FP_ILOGB0",
    "<math.h>",
    "ilogb 接收零时返回的实现定义整数常量。",
    "不要假定 ilogb(0) 的具体数值。",
  ],
  [
    "FP_ILOGBNAN",
    "<math.h>",
    "ilogb 接收 NaN 时返回的实现定义整数常量。",
    "不要假定 ilogb(NaN) 的具体数值。",
  ],
  [
    "MATH_ERRNO",
    "<math.h>",
    "math_errhandling 使用的 errno 报错位。",
    "表示数学函数通过 errno 报告错误。",
  ],
  [
    "MATH_ERREXCEPT",
    "<math.h>",
    "math_errhandling 使用的浮点异常报错位。",
    "表示数学函数通过浮点异常报告错误。",
  ],
  [
    "math_errhandling",
    "<math.h>",
    "由 MATH_ERRNO 与 MATH_ERREXCEPT 组合的实现表达式。",
    "说明数学函数在当前实现中采用哪些错误报告机制。",
  ],
  [
    "EDOM",
    "<errno.h>",
    "实现定义的定义域错误编号。",
    "数学函数参数越出定义域时可把 errno 设为此值。",
  ],
  [
    "ERANGE",
    "<errno.h>",
    "实现定义的范围错误编号。",
    "结果上溢、下溢或无法表示时可把 errno 设为此值。",
  ],
  [
    "EILSEQ",
    "<errno.h>",
    "实现定义的非法字节序列错误编号。",
    "多字节字符转换遇到非法序列时可把 errno 设为此值。",
  ],
  [
    "errno",
    "<errno.h>",
    "展开为可修改 int 左值的宏，具体存储方式由实现决定。",
    "保存当前线程最近一次由库函数报告的错误编号。",
  ],
  ["false", "<stdbool.h>", "展开为整数常量 0。", "为 _Bool 假值提供易读名称。"],
  ["true", "<stdbool.h>", "展开为整数常量 1。", "为 _Bool 真值提供易读名称。"],
];

export const BUILTIN_FUNCTIONS: readonly BuiltinFunctionEntry[] = buildFunctionTable(FUNCTION_ROWS);
export const BUILTIN_TYPEDEFS: readonly BuiltinTypedefEntry[] = buildTypedefTable(TYPEDEF_ROWS);
export const BUILTIN_OBJECT_MACROS: readonly BuiltinObjectMacroEntry[] =
  buildObjectMacroTable(OBJECT_MACRO_ROWS);

assertNoCrossTableDuplicates(BUILTIN_FUNCTIONS, BUILTIN_TYPEDEFS, BUILTIN_OBJECT_MACROS);

const FUNCTION_BY_NAME = indexByName(BUILTIN_FUNCTIONS);
const TYPEDEF_BY_NAME = indexByName(BUILTIN_TYPEDEFS);
const OBJECT_MACRO_BY_NAME = indexByName(BUILTIN_OBJECT_MACROS);

export function findBuiltinFunction(name: string): BuiltinFunctionEntry | undefined {
  return FUNCTION_BY_NAME[name];
}

export function findBuiltinTypedef(name: string): BuiltinTypedefEntry | undefined {
  return TYPEDEF_BY_NAME[name];
}

export function findBuiltinObjectMacro(name: string): BuiltinObjectMacroEntry | undefined {
  return OBJECT_MACRO_BY_NAME[name];
}

function buildFunctionTable(rows: readonly unknown[]): readonly BuiltinFunctionEntry[] {
  return buildTable(rows, "函数", 4, (row, index) => {
    const name = readName(row, 0, "函数", index);
    const signatureText = readText(row, 1, "signatureText", "函数", index);
    if (!signatureText.includes(`${name}(`) || !signatureText.endsWith(";")) {
      throw new TypeError(`函数表第 ${index + 1} 项的 signatureText 与 name 不匹配`);
    }
    return Object.freeze({
      name,
      signatureText,
      header: readHeader(row, 2, "函数", index),
      description: readText(row, 3, "description", "函数", index),
    });
  });
}

function buildTypedefTable(rows: readonly unknown[]): readonly BuiltinTypedefEntry[] {
  return buildTable(rows, "typedef", 3, (row, index) =>
    Object.freeze({
      name: readName(row, 0, "typedef", index),
      header: readHeader(row, 1, "typedef", index),
      description: readText(row, 2, "description", "typedef", index),
    }),
  );
}

function buildObjectMacroTable(rows: readonly unknown[]): readonly BuiltinObjectMacroEntry[] {
  return buildTable(rows, "对象宏", 4, (row, index) =>
    Object.freeze({
      name: readName(row, 0, "对象宏", index),
      header: readHeader(row, 1, "对象宏", index),
      valueText: readText(row, 2, "valueText", "对象宏", index),
      description: readText(row, 3, "description", "对象宏", index),
    }),
  );
}

function buildTable<T extends { readonly name: string }>(
  rows: readonly unknown[],
  tableName: string,
  expectedFields: number,
  parse: (row: readonly unknown[], index: number) => T,
): readonly T[] {
  const names = new Set<string>();
  const entries = rows.map((unknownRow, index) => {
    if (!Array.isArray(unknownRow) || unknownRow.length !== expectedFields) {
      throw new TypeError(`${tableName}表第 ${index + 1} 项必须有 ${expectedFields} 个字段`);
    }
    const entry = parse(unknownRow, index);
    if (names.has(entry.name)) {
      throw new TypeError(`${tableName}表包含重复名称 ${entry.name}`);
    }
    names.add(entry.name);
    return entry;
  });
  return Object.freeze(entries);
}

function readName(
  row: readonly unknown[],
  field: number,
  tableName: string,
  index: number,
): string {
  const name = readText(row, field, "name", tableName, index);
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new TypeError(`${tableName}表第 ${index + 1} 项的 name 不是合法 C 标识符`);
  }
  return name;
}

function readHeader(
  row: readonly unknown[],
  field: number,
  tableName: string,
  index: number,
): BuiltinHeader {
  const header = readText(row, field, "header", tableName, index);
  if (!HEADER_PATTERN.test(header)) {
    throw new TypeError(`${tableName}表第 ${index + 1} 项的 header 格式无效`);
  }
  return header as BuiltinHeader;
}

function readText(
  row: readonly unknown[],
  field: number,
  fieldName: string,
  tableName: string,
  index: number,
): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError(
      `${tableName}表第 ${index + 1} 项的 ${fieldName} 必须是非空无首尾空白字符串`,
    );
  }
  return value;
}

function assertNoCrossTableDuplicates(
  ...tables: readonly (readonly { readonly name: string }[])[]
): void {
  const names = new Set<string>();
  for (const table of tables) {
    for (const entry of table) {
      if (names.has(entry.name)) {
        throw new TypeError(`内置 C 表之间包含重复名称 ${entry.name}`);
      }
      names.add(entry.name);
    }
  }
}

function indexByName<T extends { readonly name: string }>(
  entries: readonly T[],
): Readonly<Partial<Record<string, T>>> {
  const index = Object.create(null) as Partial<Record<string, T>>;
  for (const entry of entries) {
    index[entry.name] = entry;
  }
  return Object.freeze(index);
}
