import type { FoaLessonExperience } from "./foa-contracts.js";
import { defineFoaLessonExperience } from "./foa-lesson-experience.js";

const C_STANDARD = "https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf";
const CLANG_USERS = "https://clang.llvm.org/docs/UsersManual.html";
const CLANG_COMMANDS = "https://clang.llvm.org/docs/CommandGuide/";
const COMPILER_EXPLORER = "https://github.com/compiler-explorer/compiler-explorer";
const GDB = "https://sourceware.org/gdb/current/onlinedocs/gdb";
const GDB_MI =
  "https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Program-Execution.html";
const GLIBC_INPUT =
  "https://sourceware.org/glibc/manual/latest/html_node/Formatted-Input-Basics.html";
const GLIBC_OUTPUT =
  "https://sourceware.org/glibc/manual/latest/html_node/Formatted-Output-Basics.html";
const PYTHON_TUTOR = "https://pythontutor.com/";
const PYTHON_TUTOR_PAPER =
  "https://research.google/pubs/online-python-tutor-embeddable-web-based-program-visualization-for-cs-education/";
const OPEN_DSA = "https://opendsa.org/";
const OPEN_DSA_INTRO = "https://opendsa.org/OpenDSA/Books/Everything/html/Intro.html";
const JSAV = "https://jsav.io/";
const VISUALGO = "https://visualgo.net/en";
const CMU_15122 = "https://www.cs.cmu.edu/~15122/syllabus.shtml";
const USFCA_SOURCE = "https://www.cs.usfca.edu/~galles/visualization/source.html";
const USFCA_RECURSIVE_FACTORIAL = "https://www.cs.usfca.edu/~galles/visualization/RecFact.html";
const NIST_NEWTON = "https://dlmf.nist.gov/3.8.ii";
const MIT_NEWTON = "https://math.mit.edu/~djk/18_01/chapter09/section01.html";
const MIT_EUCLID = "https://math.mit.edu/~shor/435-LN/Lecture_22.pdf";

export const FOA_LESSON_EXPERIENCES_001_040: Readonly<Record<number, FoaLessonExperience>> =
  Object.freeze({
    1: defineFoaLessonExperience({
      visualFamily: "execution",
      visualModelZh: "执行游标从 main 移到 puts；旁边只有一卷会追加字符的 stdout 纸带。",
      visualModelEn:
        "An execution cursor moves from main to puts beside a single stdout tape that appends characters.",
      primaryActionZh: "执行下一条语句，亲手触发第一次可观察输出。",
      primaryActionEn: "Step one statement to trigger the first observable output.",
      sequence: [
        ["进入 main", "Enter main"],
        ["调用 puts", "Call puts"],
        ["stdout 追加文本与换行", "Append text and a newline to stdout"],
        ["程序正常退出", "Exit normally"],
      ],
      playbackMs: 1500,
      playbackPolicy: "guided",
      persistentEvidenceZh: "stdout 的精确字节串，并用 ↵ 显示结尾换行。",
      persistentEvidenceEn: "The exact stdout byte sequence, with the final newline shown as ↵.",
      hiddenByDefaultZh: "课程元数据、复杂度、函数栈、关联知识点和完整源码。",
      hiddenByDefaultEn:
        "Course metadata, complexity, call stack, related concepts, and the full source.",
      researchUrls: [C_STANDARD, PYTHON_TUTOR],
    }),
    2: defineFoaLessonExperience({
      visualFamily: "pipeline",
      visualModelZh: "三站数据管道 stdin → value → 乘法 → stdout，数字 token 始终保持身份。",
      visualModelEn:
        "A three-stage stdin → value → multiplication → stdout pipeline whose number token keeps its identity.",
      primaryActionZh: "把输入 7 推入管道，并在输出前预测结果。",
      primaryActionEn: "Push 7 into the pipeline and predict the result before output.",
      sequence: [
        ["扫描并绑定 7", "Scan and bind 7"],
        ["读取 value 两次", "Read value twice"],
        ["相乘得到 49", "Multiply to obtain 49"],
        ["输出 49", "Write 49"],
      ],
      playbackMs: 1600,
      playbackPolicy: "guided",
      persistentEvidenceZh: "值谱系 7 → value=7 → 7×7 → 49。",
      persistentEvidenceEn: "The value lineage 7 → value=7 → 7×7 → 49.",
      hiddenByDefaultZh: "scanf 格式串细节、地址符解释、完整变量面板和复杂度。",
      hiddenByDefaultEn:
        "scanf format details, address-operator explanation, the full variables panel, and complexity.",
      researchUrls: [GLIBC_INPUT, PYTHON_TUTOR_PAPER],
    }),
    3: defineFoaLessonExperience({
      visualFamily: "pipeline",
      visualModelZh: "源代码→编译与可执行文件→运行两道串联闸门；前门失败时后门锁定。",
      visualModelEn:
        "Two serial gates—source→compile and executable→run—with the second locked after compile failure.",
      primaryActionZh: "先触发编译，再根据真实结果决定运行是否可用。",
      primaryActionEn:
        "Compile first, then decide from the real result whether running is available.",
      sequence: [
        ["解析源文件", "Parse the source"],
        ["产生诊断或可执行物", "Produce diagnostics or an executable"],
        ["仅成功时开放运行", "Enable running only after success"],
        ["记录退出状态", "Record the exit status"],
      ],
      playbackMs: 1300,
      playbackPolicy: "guided",
      persistentEvidenceZh: "两段式状态 compile: success/failure | run: not-started/exited。",
      persistentEvidenceEn:
        "A two-stage status: compile: success/failure | run: not-started/exited.",
      hiddenByDefaultZh: "AST、汇编、链接参数、变量动画和完整诊断列表。",
      hiddenByDefaultEn:
        "AST, assembly, linker flags, variable animation, and the complete diagnostic list.",
      researchUrls: [CLANG_USERS, CLANG_COMMANDS, COMPILER_EXPLORER],
    }),
    4: defineFoaLessonExperience({
      visualFamily: "state",
      visualModelZh: "一个 total 单元格和不可变的状态履历；局部更新而非重绘整个舞台。",
      visualModelEn:
        "One total cell with an immutable state history, updated locally instead of redrawing the stage.",
      primaryActionZh: "依次提交 =0、+=2、*=3 三个状态转移。",
      primaryActionEn: "Commit the =0, +=2, and *=3 state transitions in order.",
      sequence: [
        ["建立 total=0", "Create total=0"],
        ["读取旧值并加 2", "Read the old value and add 2"],
        ["读取 2 并乘 3", "Read 2 and multiply by 3"],
        ["输出 6", "Write 6"],
      ],
      playbackMs: 1400,
      playbackPolicy: "guided",
      persistentEvidenceZh: "old | operation | new 的三行状态履历。",
      persistentEvidenceEn: "A three-row old | operation | new state history.",
      hiddenByDefaultZh: "作用域、地址、未执行代码和赋值原理长文。",
      hiddenByDefaultEn: "Scope, addresses, unexecuted code, and long assignment explanations.",
      researchUrls: [C_STANDARD, GDB],
    }),
    5: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh:
        "用户输入的整数作为同一个值 token，依次通过 value>0 与 value<0 两个判断，最后只进入一个结果出口。",
      visualModelEn:
        "The learner's integer remains one value token as it passes value>0 and value<0, then enters exactly one result output.",
      primaryActionZh: "自行输入整数、预测类别，再用实际比较路径验证。",
      primaryActionEn:
        "Enter an integer, predict its category, then verify it on the actual comparison path.",
      sequence: [
        ["提交一个整数", "Submit an integer"],
        ["预测类别并检查 value>0", "Predict the category and check value>0"],
        ["必要时继续检查 value<0", "Check value<0 when needed"],
        ["确认唯一输出类别", "Confirm the single output category"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh: "实际输入、两次比较结果、经过的连线与最终类别。",
      persistentEvidenceEn:
        "The actual input, comparison results, traversed edges, and final category.",
      hiddenByDefaultZh: "嵌套三元写法、测试矩阵、其他案例和泛化正确性说明。",
      hiddenByDefaultEn:
        "Nested conditional syntax, the test matrix, other cases, and general correctness notes.",
      researchUrls: [C_STANDARD, OPEN_DSA],
    }),
    6: defineFoaLessonExperience({
      visualFamily: "state",
      visualModelZh: "item_count:3 与 item_price:4 两个命名货架格连接到总价。",
      visualModelEn:
        "Two named shelf cells, item_count:3 and item_price:4, feed a total-price result.",
      primaryActionZh: "把“数量”和“单价”标签匹配到对应值，再触发乘法。",
      primaryActionEn:
        "Match quantity and price labels to their values, then trigger multiplication.",
      sequence: [
        ["声明名字", "Declare the names"],
        ["绑定类型和值", "Bind types and values"],
        ["按名字读取操作数", "Read operands by name"],
        ["相乘得到 12", "Multiply to obtain 12"],
      ],
      playbackMs: 1500,
      playbackPolicy: "guided",
      persistentEvidenceZh: "仅两行的 identifier | type | value 绑定表。",
      persistentEvidenceEn: "A two-row identifier | type | value binding table.",
      hiddenByDefaultZh: "地址、存储期、命名风格长文和完整源文件。",
      hiddenByDefaultEn:
        "Addresses, storage duration, naming-style prose, and the complete source file.",
      researchUrls: [C_STANDARD],
    }),
    7: defineFoaLessonExperience({
      visualFamily: "state",
      visualModelZh: "limit 是带锁的常量轨，used 是显示 6→8 的可变版本轨。",
      visualModelEn: "limit is a locked constant lane; used is a mutable version lane showing 6→8.",
      primaryActionZh: "把 +2 更新插头插向正确目标；常量端会明确拒绝写入。",
      primaryActionEn:
        "Plug the +2 update into the correct target; the constant port explicitly rejects writes.",
      sequence: [
        ["建立两个绑定", "Create both bindings"],
        ["选择写入目标", "Choose a write target"],
        ["检查可修改性", "Check modifiability"],
        ["更新 used 并显示 8/10", "Update used and display 8/10"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "limit: const, writes=0 | used: mutable, 6→8。",
      persistentEvidenceEn: "limit: const, writes=0 | used: mutable, 6→8.",
      hiddenByDefaultZh: "类型限定符全表、编译错误全文和地址。",
      hiddenByDefaultEn: "The qualifier table, full compiler errors, and addresses.",
      researchUrls: [C_STANDARD],
    }),
    8: defineFoaLessonExperience({
      visualFamily: "expression",
      visualModelZh: "a+(b*c) 与 (a+b)*c 两棵表达式树；一次只激活一棵。",
      visualModelEn: "Two expression trees, a+(b*c) and (a+b)*c, with only one active at a time.",
      primaryActionZh: "拖动一对括号包住节点，改变树的折叠顺序。",
      primaryActionEn: "Drag parentheses around nodes to change the tree's reduction order.",
      sequence: [
        ["建立叶值 2、3、4", "Create leaves 2, 3, and 4"],
        ["折叠最深子树", "Reduce the deepest subtree"],
        ["折叠根节点", "Reduce the root"],
        ["对照 14 与 20", "Compare 14 and 20"],
      ],
      playbackMs: 1700,
      playbackPolicy: "guided",
      persistentEvidenceZh: "两棵树根部的最终值 14 ≠ 20。",
      persistentEvidenceEn: "The final root values 14 ≠ 20 on the two trees.",
      hiddenByDefaultZh: "完整优先级表、结合性术语和其他运算符。",
      hiddenByDefaultEn: "The precedence table, associativity terminology, and other operators.",
      researchUrls: [C_STANDARD, JSAV],
    }),
    9: defineFoaLessonExperience({
      visualFamily: "pipeline",
      visualModelZh: "扫描器闸门同时产出赋值槽和返回计数，失败不会伪造 value。",
      visualModelEn:
        "A scanner gate emits both an assignment slot and a return count; failure never invents value.",
      primaryActionZh: "检查当前输入是否成功匹配 %d；只有返回计数为 1 时才执行 +1。",
      primaryActionEn:
        "Check whether the current input matches %d; execute +1 only when the return count is 1.",
      sequence: [
        ["尝试匹配 %d", "Attempt the %d match"],
        ["成功时赋值并返回 1", "Assign and return 1 on success"],
        ["失败时阻止后续计算", "Block later computation on failure"],
        ["对合法值输出 value+1", "Write value+1 for valid input"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh: "scanf return=1/0 与 value assigned=yes/no。",
      persistentEvidenceEn: "scanf return=1/0 with value assigned=yes/no.",
      hiddenByDefaultZh: "输入恢复策略、全部格式符和异常弹窗。",
      hiddenByDefaultEn: "Input-recovery policy, all format specifiers, and error dialogs.",
      researchUrls: [GLIBC_INPUT],
    }),
    10: defineFoaLessonExperience({
      visualFamily: "evidence",
      visualModelZh: "精度刻度尺分开显示内部计算值与可观察字符串。",
      visualModelEn:
        "A precision ruler separates the internal computed value from the observable string.",
      primaryActionZh: "把精度滑到 3，并预测 2/3 的显示字符串。",
      primaryActionEn: "Set precision to 3 and predict the displayed form of 2/3.",
      sequence: [
        ["计算浮点值", "Compute the floating-point value"],
        ["选择 %.3f", "Choose %.3f"],
        ["格式化并舍入", "Format and round"],
        ["写出 0.667", "Write 0.667"],
      ],
      playbackMs: 1500,
      playbackPolicy: "guided",
      persistentEvidenceZh: 'stored≈0.666… | rendered="0.667"。',
      persistentEvidenceEn: 'stored≈0.666… | rendered="0.667".',
      hiddenByDefaultZh: "IEEE 754 位图、区域设置、printf 全部标志和宽度。",
      hiddenByDefaultEn: "IEEE 754 bits, locale, and the full printf flags and widths.",
      researchUrls: [GLIBC_OUTPUT, C_STANDARD],
    }),
    11: defineFoaLessonExperience({
      visualFamily: "state",
      visualModelZh: "score 的读旧值→右侧计算→写回回路，每轮只有一个飞行值。",
      visualModelEn:
        "A read-old→evaluate-RHS→write-back loop for score with only one value in flight.",
      primaryActionZh: "把旧值送入右侧表达式，确认结果后再写回。",
      primaryActionEn:
        "Send the old value into the RHS and write back only after confirming the result.",
      sequence: [
        ["10+5 得 15", "Compute 10+5=15"],
        ["写回 15", "Write back 15"],
        ["15×2 得 30", "Compute 15×2=30"],
        ["写回并输出 30", "Write back and output 30"],
      ],
      playbackMs: 1450,
      playbackPolicy: "guided",
      persistentEvidenceZh: "两行 old / RHS result / new 记录。",
      persistentEvidenceEn: "Two old / RHS result / new records.",
      hiddenByDefaultZh: "复合赋值语法族、地址和并发/原子性术语。",
      hiddenByDefaultEn:
        "The compound-assignment family, addresses, and concurrency/atomicity terminology.",
      researchUrls: [C_STANDARD],
    }),
    12: defineFoaLessonExperience({
      visualFamily: "expression",
      visualModelZh: "4/3、π 与三个 r token 逐项扣入球体体积表达式骨架。",
      visualModelEn:
        "Tokens for 4/3, π, and three copies of r snap into a sphere-volume expression skeleton.",
      primaryActionZh: "把第三个 r 放入 r³ 空位，完成数学式到 C 表达式的对应。",
      primaryActionEn:
        "Place the third r into the r³ slot to complete the math-to-C correspondence.",
      sequence: [
        ["验证半径非负", "Validate a non-negative radius"],
        ["形成浮点 4.0/3.0", "Form floating-point 4.0/3.0"],
        ["组装 r*r*r", "Assemble r*r*r"],
        ["格式化为 33.51", "Format as 33.51"],
      ],
      playbackMs: 1700,
      playbackPolicy: "guided",
      persistentEvidenceZh: "数学项到 C 子表达式的一一连线与 V(2)=33.51。",
      persistentEvidenceEn:
        "One-to-one links from mathematical terms to C subexpressions, ending at V(2)=33.51.",
      hiddenByDefaultZh: "π 的多余位数、数值稳定性侧栏和通用运算符说明。",
      hiddenByDefaultEn:
        "Extra digits of π, the numerical-stability sidebar, and general operator notes.",
      researchUrls: [C_STANDARD, GLIBC_OUTPUT],
    }),
    13: defineFoaLessonExperience({
      visualFamily: "expression",
      visualModelZh: "把被除数筹码按除数大小分组；完整组数是商，剩余筹码是余数。",
      visualModelEn:
        "Group dividend tokens by the divisor; full groups are the quotient and leftovers the remainder.",
      primaryActionZh: "亲手分组筹码，而不是直接输入商和余数。",
      primaryActionEn: "Group the tokens directly instead of typing quotient and remainder.",
      sequence: [
        ["检查除数非零", "Check a nonzero divisor"],
        ["按除数大小形成组", "Make groups sized by the divisor"],
        ["数出完整组与剩余筹码", "Count full groups and leftover tokens"],
        ["验证除法恒等式", "Verify the division identity"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "被除数 = 商×除数 + 余数。",
      persistentEvidenceEn: "dividend = quotient×divisor + remainder.",
      hiddenByDefaultZh: "负数除法、未定义行为长文和浮点除法对比。",
      hiddenByDefaultEn:
        "Negative division, long undefined-behavior prose, and floating-point division comparison.",
      researchUrls: [C_STANDARD],
    }),
    14: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "数轴上的 left、right 与一个表示 < 关系的方向箭头。",
      visualModelEn: "A number line with left, right, and a directional arrow for the < relation.",
      primaryActionZh: "根据当前两个数的位置，提交 left<right 的判断。",
      primaryActionEn: "Use the current positions to submit the judgment left<right.",
      sequence: [
        ["放置 left 和 right", "Place left and right"],
        ["读取 < 的方向", "Read the direction of <"],
        ["求值得 0 或 1", "Evaluate to 0 or 1"],
        ["映射为 false 或 true", "Render as false or true"],
      ],
      playbackMs: 1400,
      playbackPolicy: "guided",
      persistentEvidenceZh: 'left < right → 0/1 → "false"/"true"。',
      persistentEvidenceEn: 'left < right → 0/1 → "false"/"true".',
      hiddenByDefaultZh: "其他比较运算符、分支图和整数表示。",
      hiddenByDefaultEn: "Other comparison operators, branch diagrams, and integer representation.",
      researchUrls: [C_STANDARD],
    }),
    15: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "数轴上串联 ≥1 与 ≤10 两扇门；前门通过后后门才激活。",
      visualModelEn:
        "Serial ≥1 and ≤10 gates on a number line; the second activates only after the first passes.",
      primaryActionZh: "拖动当前 value 穿过两扇门，并预测是否进入 inside。",
      primaryActionEn:
        "Drag the current value through both gates and predict whether it reaches inside.",
      sequence: [
        ["检查下界", "Check the lower bound"],
        ["若真再检查上界", "If true, check the upper bound"],
        ["合成 AND", "Combine with AND"],
        ["输出 inside", "Write inside"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh:
        "lower=(value≥1)；必要时再求 upper=(value≤10)；未求值子句明确标为 not evaluated。",
      persistentEvidenceEn:
        "lower=(value≥1); evaluate upper=(value≤10) only when needed, with skipped clauses explicitly marked not evaluated.",
      hiddenByDefaultZh: "完整真值表、逻辑 OR 和嵌套 if 替代写法。",
      hiddenByDefaultEn: "The full truth table, logical OR, and a nested-if alternative.",
      researchUrls: [C_STANDARD],
    }),
    16: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "关于 0 镜像的数轴；负值通过取反门折叠到正侧，非负值直行。",
      visualModelEn:
        "A number line mirrored at zero; negatives fold through a negation gate while non-negatives pass.",
      primaryActionZh: "把 -7 拖过条件门，保持同一 value token 完成变换。",
      primaryActionEn: "Drag -7 through the condition gate while preserving the same value token.",
      sequence: [
        ["测试 value<0", "Test value<0"],
        ["进入唯一分支", "Enter the single branch"],
        ["计算并写回 -value", "Compute and write back -value"],
        ["输出 7", "Write 7"],
      ],
      playbackMs: 1600,
      playbackPolicy: "guided",
      persistentEvidenceZh: "before=-7 | branch=taken | after=7。",
      persistentEvidenceEn: "before=-7 | branch=taken | after=7.",
      hiddenByDefaultZh: "三元替代写法、abs 库函数和完整 CFG。",
      hiddenByDefaultEn: "The conditional-expression alternative, abs, and the full CFG.",
      researchUrls: [C_STANDARD],
    }),
    17: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "两条互斥输入轨汇合到 maximum 槽；未选轨淡出但仍可辨认。",
      visualModelEn:
        "Two mutually exclusive input lanes merge into maximum; the unchosen lane fades but remains legible.",
      primaryActionZh: "依据比较结果，把正确 token 接到汇合槽。",
      primaryActionEn: "Connect the correct token to the merge slot from the comparison result.",
      sequence: [
        ["比较 a 与 b", "Compare a and b"],
        ["激活 b 轨", "Activate the b lane"],
        ["绑定 maximum=-2", "Bind maximum=-2"],
        ["输出 -2", "Write -2"],
      ],
      playbackMs: 1600,
      playbackPolicy: "guided",
      persistentEvidenceZh: "chosen=b; maximum=-2 与被激活路径。",
      persistentEvidenceEn: "chosen=b; maximum=-2 together with the active path.",
      hiddenByDefaultZh: "嵌套结构、额外测试、全局流程图和条件运算符长解释。",
      hiddenByDefaultEn:
        "Nested structures, extra tests, a global flowchart, and long conditional-operator prose.",
      researchUrls: [C_STANDARD, PYTHON_TUTOR],
    }),
    18: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "80/70/60 的降序门槛阶梯；分数遇到首个通过门立即停止。",
      visualModelEn:
        "A descending 80/70/60 threshold staircase where the score stops at the first passing gate.",
      primaryActionZh: "把当前 score 放到阶梯顶部，并在每个实际访问的门槛提交 pass/fail。",
      primaryActionEn:
        "Place the current score at the top and submit pass/fail at each threshold actually visited.",
      sequence: [
        ["检查最高门槛", "Check the highest threshold"],
        ["必要时检查下一门槛", "Check the next threshold when needed"],
        ["首个通过后停止向下检查", "Stop after the first passing threshold"],
        ["输出对应等级", "Write the corresponding grade"],
      ],
      playbackMs: 1750,
      playbackPolicy: "guided",
      persistentEvidenceZh: "记录首个为真的门槛 guard；更低门槛标为 not visited。",
      persistentEvidenceEn:
        "Record the first true threshold guard; mark lower thresholds as not visited.",
      hiddenByDefaultZh: "完整代码、成绩政策说明和测试矩阵。",
      hiddenByDefaultEn: "The full code, grading-policy prose, and the test matrix.",
      researchUrls: [C_STANDARD, OPEN_DSA_INTRO],
    }),
    19: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "只有 45000 阈值的分段线图，右段斜率为 0.30。",
      visualModelEn:
        "A piecewise line with one 45000 threshold and a 0.30 slope on the right segment.",
      primaryActionZh: "把当前 income 放到分段线上，选择适用线段并代入。",
      primaryActionEn:
        "Place the current income on the piecewise line, select the active segment, and substitute.",
      sequence: [
        ["验证收入非负", "Validate non-negative income"],
        ["判断位于阈值哪一侧", "Locate the income relative to the threshold"],
        ["计算超过 45000 的部分", "Compute the portion above 45000"],
        ["按 0.30 税率计算", "Apply the 0.30 rate"],
      ],
      playbackMs: 1750,
      playbackPolicy: "guided",
      persistentEvidenceZh: "tax=max(income−45000, 0)×0.30。",
      persistentEvidenceEn: "tax=max(income−45000, 0)×0.30.",
      hiddenByDefaultZh: "税务背景、其他税阶、泛化说明和整页代码。",
      hiddenByDefaultEn:
        "Tax context, other brackets, generalization notes, and the full code page.",
      researchUrls: [C_STANDARD, VISUALGO],
    }),
    20: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "十二格月份转盘连接 28、30、31 三个结果仓，共用 case 合并到同一仓道。",
      visualModelEn:
        "A twelve-position month dial feeding 28, 30, and 31 bins, with grouped cases sharing a lane.",
      primaryActionZh: "旋转到当前 month，观察精确标签匹配并拉下 break 制动杆。",
      primaryActionEn:
        "Rotate to the current month, observe exact label matching, and pull the break lever.",
      sequence: [
        ["读取当前 month", "Read the current month"],
        ["命中精确 case 或合并组", "Match an exact case or grouped cases"],
        ["赋值对应 days", "Assign the corresponding days"],
        ["break 离开 switch", "Break out of switch"],
      ],
      playbackMs: 1600,
      playbackPolicy: "guided",
      persistentEvidenceZh: "matched case/group → days → switch exited。",
      persistentEvidenceEn: "matched case/group → days → switch exited.",
      hiddenByDefaultZh: "未命中控制线、闰年旁支和 default 扩展。",
      hiddenByDefaultEn: "Unmatched control lines, leap-year material, and default extensions.",
      researchUrls: [C_STANDARD],
    }),
    21: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "主流程入口前的 guard 门；失败轨直达函数退出，核心区变成不可达灰层。",
      visualModelEn:
        "A guard gate before the main flow; failure goes directly to function exit and dims the core as unreachable.",
      primaryActionZh: "投放当前 count，并依据 guard 结果选择拒绝或进入核心流程。",
      primaryActionEn:
        "Feed the current count and use the guard result to reject it or enter the core flow.",
      sequence: [
        ["读取当前 count", "Read the current count"],
        ["判断 count<=0", "Test count<=0"],
        ["选择拒绝或继续路径", "Choose the reject or continue path"],
        ["显示终止原因或进入核心", "Show the termination reason or enter the core"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "guard 结果决定 termination reason 与后续节点是否可达。",
      persistentEvidenceEn:
        "The guard result determines the termination reason and whether later nodes are reachable.",
      hiddenByDefaultZh: "成功路径内部、诊断面板、完整 CFG 和错误弹窗。",
      hiddenByDefaultEn:
        "Success-path internals, the diagnostics panel, the full CFG, and error dialogs.",
      researchUrls: [C_STANDARD, GDB_MI],
    }),
    22: defineFoaLessonExperience({
      visualFamily: "loop",
      visualModelZh: "横向迭代轨显示 (i,sum)，初始化、条件和更新固定在三处轨道节点。",
      visualModelEn:
        "A horizontal iteration rail shows (i,sum), with initialization, condition, and update fixed at three nodes.",
      primaryActionZh: "拖动游标完成一轮检查→累加→更新，再播放剩余轮。",
      primaryActionEn:
        "Drag the cursor through one check→accumulate→update cycle, then play the rest.",
      sequence: [
        ["建立 i=1,sum=0", "Create i=1,sum=0"],
        ["检查 i<=5", "Check i<=5"],
        ["执行 sum+=i", "Execute sum+=i"],
        ["执行 i++ 并回到条件", "Execute i++ and return to the condition"],
      ],
      playbackMs: 1450,
      playbackPolicy: "guided",
      persistentEvidenceZh: "当前高亮的 i-before-body | sum-after-body 迭代表。",
      persistentEvidenceEn:
        "A compact, current-row-highlighted i-before-body | sum-after-body iteration table.",
      hiddenByDefaultZh: "通用循环解剖、复杂度卡片、完整代码和历史动画对象。",
      hiddenByDefaultEn:
        "Generic loop anatomy, the complexity card, full code, and old animated objects.",
      researchUrls: [C_STANDARD, OPEN_DSA_INTRO],
    }),
    23: defineFoaLessonExperience({
      visualFamily: "loop",
      visualModelZh: "乘积链 1×2×3×…；已纳入 result 的因子实显，未处理因子仅留轮廓。",
      visualModelEn:
        "A 1×2×3×… product chain with processed factors solid and future factors outlined.",
      primaryActionZh: "预测并接入下一个因子，然后验证循环头不变量。",
      primaryActionEn: "Predict and attach the next factor, then verify the loop-head invariant.",
      sequence: [
        ["以 1 建立空乘积", "Start with the empty product 1"],
        ["接入当前 i", "Attach the current i"],
        ["更新 result", "Update result"],
        ["验证不变量后推进", "Verify the invariant, then advance"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh: "循环头的当前实例 result=(i−1)!。",
      persistentEvidenceEn: "The current loop-head instance result=(i−1)!.",
      hiddenByDefaultZh: "递归阶乘、Big-O 说明和每一轮的重复解释。",
      hiddenByDefaultEn:
        "Recursive factorial, Big-O prose, and repeated explanations for every iteration.",
      researchUrls: [C_STANDARD, CMU_15122],
    }),
    24: defineFoaLessonExperience({
      visualFamily: "sequence",
      visualModelZh: "三格年度账本记录期初→×105→/100→期末，并把整数余数放进舍弃槽。",
      visualModelEn:
        "A three-year ledger records opening→×105→/100→closing, with integer remainders in a discard slot.",
      primaryActionZh: "推进一个年度，确认整数除法结果后写入下一期。",
      primaryActionEn:
        "Advance one year and commit the integer-division result as the next opening balance.",
      sequence: [
        ["读取期初 cents", "Read opening cents"],
        ["计算 cents×105", "Compute cents×105"],
        ["整数除以 100", "Divide by 100 as integers"],
        ["写成下期期初", "Store as the next opening value"],
      ],
      playbackMs: 1700,
      playbackPolicy: "guided",
      persistentEvidenceZh: "年度序列 1000→1050→1102→1157，并标出每步舍弃余数。",
      persistentEvidenceEn:
        "The yearly sequence 1000→1050→1102→1157 with each discarded remainder.",
      hiddenByDefaultZh: "金融背景、浮点替代、运算符说明和复杂度。",
      hiddenByDefaultEn:
        "Financial context, floating-point alternatives, operator notes, and complexity.",
      researchUrls: [C_STANDARD, PYTHON_TUTOR],
    }),
    25: defineFoaLessonExperience({
      visualFamily: "stream",
      visualModelZh: "输入传送带承载数据 token 与 sentinel -1；停止牌抵达后不能进入累加器。",
      visualModelEn:
        "An input belt carries data tokens and sentinel -1, which cannot enter the accumulator.",
      primaryActionZh: "逐个推动 token，并选择累加或停止。",
      primaryActionEn: "Advance each token and choose accumulate or stop.",
      sequence: [
        ["读取下一个 token", "Read the next token"],
        ["与 -1 比较", "Compare with -1"],
        ["非 sentinel 才累加", "Accumulate only non-sentinels"],
        ["遇 -1 输出当前 sum", "Write the current sum when -1 arrives"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh: "记录 consumed 前缀、已累加的非 sentinel 值与当前 sum。",
      persistentEvidenceEn:
        "Record the consumed prefix, accumulated non-sentinel values, and current sum.",
      hiddenByDefaultZh: "EOF、剩余缓冲区、scanf 恢复和通用 while 图。",
      hiddenByDefaultEn:
        "EOF, remaining buffer state, scanf recovery, and a generic while diagram.",
      researchUrls: [C_STANDARD, GLIBC_INPUT],
    }),
    26: defineFoaLessonExperience({
      visualFamily: "loop",
      visualModelZh: "数字剥离机每轮 /10 去掉一位；条件门明确位于机器出口。",
      visualModelEn:
        "A digit-peeling machine removes one digit per /10 step, with the condition gate at the exit.",
      primaryActionZh: "执行一次“剥一位”，再根据新值决定是否回环。",
      primaryActionEn: "Peel one digit, then decide from the new value whether to loop.",
      sequence: [
        ["digits++", "Increment digits"],
        ["value/=10", "Divide value by 10"],
        ["检查 value!=0", "Check value!=0"],
        ["回环或输出计数", "Loop or write the count"],
      ],
      playbackMs: 1500,
      playbackPolicy: "guided",
      persistentEvidenceZh: "1203→120→12→1→0 与同步计数 1→2→3→4。",
      persistentEvidenceEn: "1203→120→12→1→0 synchronized with count 1→2→3→4.",
      hiddenByDefaultZh: "对数复杂度、负数扩展和大段 while 对照。",
      hiddenByDefaultEn:
        "Logarithmic complexity, negative-number extensions, and a long while comparison.",
      researchUrls: [C_STANDARD],
    }),
    27: defineFoaLessonExperience({
      visualFamily: "stream",
      visualModelZh: "容量框由 count 决定输入槽数量，消费计数和 sum 同步更新。",
      visualModelEn:
        "A capacity frame derives its input slots from count, with synchronized consumption and sum.",
      primaryActionZh: "依次放入 count 个值，满足不多取也不少取的输入契约。",
      primaryActionEn:
        "Place count values in order, consuming neither more nor fewer than promised.",
      sequence: [
        ["验证 count>0", "Validate count>0"],
        ["消费恰好 count 个值", "Consume exactly count values"],
        ["逐项更新 sum", "Update sum for each value"],
        ["转为 double 并求均值", "Convert to double and average"],
      ],
      playbackMs: 1450,
      playbackPolicy: "guided",
      persistentEvidenceZh: "consumed=count/count | sum=当前总和 | average=sum/count。",
      persistentEvidenceEn: "consumed=count/count | sum=current total | average=sum/count.",
      hiddenByDefaultZh: "未消费输入、循环源码、类型转换侧栏和 benchmark。",
      hiddenByDefaultEn:
        "Unconsumed input, loop source, the conversion sidebar, and benchmark controls.",
      researchUrls: [C_STANDARD, GLIBC_INPUT],
    }),
    28: defineFoaLessonExperience({
      visualFamily: "search",
      visualModelZh: "当前冠军与新挑战者擂台；冠军必须由首个真实输入初始化。",
      visualModelEn:
        "A champion-versus-challenger arena where the champion starts from the first real input.",
      primaryActionZh: "逐轮选择保留或替换冠军，并核对已处理前缀。",
      primaryActionEn: "Keep or replace the champion each round, checking the processed prefix.",
      sequence: [
        ["首值 -4 成为 maximum", "Seed maximum with -4"],
        ["读取 challenger", "Read a challenger"],
        ["比较并保留或替换", "Compare and keep or replace"],
        ["处理完后输出 -2", "Write -2 after all inputs"],
      ],
      playbackMs: 1750,
      playbackPolicy: "guided",
      persistentEvidenceZh: "maximum=max(processed values) 与当前已处理前缀。",
      persistentEvidenceEn: "maximum=max(processed values) with the current processed prefix.",
      hiddenByDefaultZh: "错误的 0 初始化长讲解、完整源码、数组版本和复杂度卡片。",
      hiddenByDefaultEn:
        "Long zero-initialization warnings, full source, the array variant, and complexity card.",
      researchUrls: [OPEN_DSA, C_STANDARD],
    }),
    29: defineFoaLessonExperience({
      visualFamily: "sequence",
      visualModelZh: "(row,col) 光标直接在星号画布移动；外层换行，内层向右。",
      visualModelEn:
        "A (row,col) cursor moves directly on the star canvas: outer loop down, inner loop right.",
      primaryActionZh: "完成当前行最后一个星号，再执行换行。",
      primaryActionEn: "Place the current row's last star, then perform the newline.",
      sequence: [
        ["选定 row", "Select row"],
        ["递增 col 并画星", "Increment col and draw stars"],
        ["col 达 row 后换行", "Newline when col reaches row"],
        ["row++ 开下一行", "Increment row for the next line"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "当前 (row,col) 叠加在已经生成的字符画上。",
      persistentEvidenceEn: "The current (row,col) overlaid on the generated character drawing.",
      hiddenByDefaultZh: "两个完整循环头、O(n²) 推导、逐星历史和控制说明。",
      hiddenByDefaultEn:
        "Both full loop headers, the O(n²) derivation, per-star history, and control instructions.",
      researchUrls: [C_STANDARD, USFCA_SOURCE],
    }),
    30: defineFoaLessonExperience({
      visualFamily: "search",
      visualModelZh: "候选除数刻度 2…√n 与余数槽；停止边界直接显示 d≤n/d。",
      visualModelEn: "A divisor scale 2…√n with a remainder slot and the safe stopping test d≤n/d.",
      primaryActionZh: "对当前 divisor 取模，判断找到因子、继续或已经足够。",
      primaryActionEn:
        "Take the remainder for the current divisor and choose factor, continue, or enough.",
      sequence: [
        ["初始化 prime", "Initialize prime"],
        ["检查 d<=n/d", "Check d<=n/d"],
        ["计算 n%d", "Compute n%d"],
        ["找到因子或推进/结束", "Find a factor or advance/finish"],
      ],
      playbackMs: 1800,
      playbackPolicy: "guided",
      persistentEvidenceZh: "tested={2,3,4,5}; none divides 29; next 6>29/6。",
      persistentEvidenceEn: "tested={2,3,4,5}; none divides 29; next 6>29/6.",
      hiddenByDefaultZh: "全因子表、Big-O 推导、溢出旁支和完整代码。",
      hiddenByDefaultEn: "The full factor table, Big-O derivation, overflow detour, and full code.",
      researchUrls: [C_STANDARD, VISUALGO],
    }),
    31: defineFoaLessonExperience({
      visualFamily: "loop",
      visualModelZh: "(a,b) 两列寄存器和余数槽；b 左移、余数上移，稳定对象不重建。",
      visualModelEn:
        "Two (a,b) registers and a remainder slot; b moves left and the remainder moves up without remounting.",
      primaryActionZh: "完成一次算余数与轮换，观察右列严格减小。",
      primaryActionEn:
        "Compute one remainder-and-rotate step and observe the strict decrease on the right.",
      sequence: [
        ["计算 r=a%b", "Compute r=a%b"],
        ["令 a←b", "Set a←b"],
        ["令 b←r", "Set b←r"],
        ["b=0 时输出 a", "Write a when b=0"],
      ],
      playbackMs: 1800,
      playbackPolicy: "guided",
      persistentEvidenceZh: "严格下降的 b 序列 18→12→6→0 与最后非零值 6。",
      persistentEvidenceEn:
        "The strictly decreasing b sequence 18→12→6→0 and final nonzero value 6.",
      hiddenByDefaultZh: "扩展欧几里得、复杂度证明、商列和完整历史表。",
      hiddenByDefaultEn:
        "Extended Euclid, complexity proof, quotient column, and the full history table.",
      researchUrls: [MIT_EUCLID, C_STANDARD],
    }),
    32: defineFoaLessonExperience({
      visualFamily: "call-stack",
      visualModelZh: "caller 与 square 两层调用框；调用时展开 callee，返回后收起。",
      visualModelEn:
        "Two caller/square frames; the callee expands on call and collapses after return.",
      primaryActionZh: "选择进入函数，把当前实参交给形参 x。",
      primaryActionEn: "Step into the function and pass the current argument to parameter x.",
      sequence: [
        ["调用 square(argument)", "Call square(argument)"],
        ["把 argument 绑定为 x", "Bind argument to x"],
        ["计算 x*x", "Compute x*x"],
        ["返回并输出结果", "Return and write the result"],
      ],
      playbackMs: 1700,
      playbackPolicy: "guided",
      persistentEvidenceZh: "argument → parameter x → return x*x。",
      persistentEvidenceEn: "argument → parameter x → return x*x.",
      hiddenByDefaultZh: "全局调用图、栈地址、原型和链接知识。",
      hiddenByDefaultEn: "The global call graph, stack addresses, prototypes, and linking details.",
      researchUrls: [C_STANDARD, GDB],
    }),
    33: defineFoaLessonExperience({
      visualFamily: "dependency",
      visualModelZh: "在函数原型、调用和定义之间完成四项类型与返回值核对。",
      visualModelEn:
        "Four focused checks across the prototype, call, definition, and returned value.",
      primaryActionZh: "按当前高亮字段连接匹配端口。",
      primaryActionEn: "Connect the two currently highlighted fields.",
      sequence: [
        ["连接原型与调用的返回类型", "Connect prototype and call return types"],
        ["连接参数类型与实参类型", "Connect parameter and argument types"],
        ["核对原型与定义的返回类型", "Check prototype and definition return types"],
        ["把返回值 12 接回调用点", "Connect returned value 12 to the call"],
      ],
      playbackMs: 1600,
      playbackPolicy: "guided",
      persistentEvidenceZh: "四条已核对连线分别保留返回类型、实参类型和返回值证据。",
      persistentEvidenceEn:
        "Four verified routes preserve the checked return-type, argument-type, and return-value evidence.",
      hiddenByDefaultZh: "函数体动画、链接器内部、旧式声明和完整翻译单元。",
      hiddenByDefaultEn:
        "Function-body animation, linker internals, old-style declarations, and the full translation unit.",
      researchUrls: [C_STANDARD],
    }),
    34: defineFoaLessonExperience({
      visualFamily: "dependency",
      visualModelZh: "封闭 abs 契约块只露出 int 输入口和 int 输出口，内部不可展开。",
      visualModelEn:
        "A sealed abs contract exposes only int input and int output ports, with internals unavailable.",
      primaryActionZh: "把当前 int 输入放入契约入口，只依据返回结果继续。",
      primaryActionEn:
        "Feed the current int input into the contract and continue using only its returned result.",
      sequence: [
        ["确认声明可见", "Confirm the declaration is visible"],
        ["传入当前 int", "Pass the current int"],
        ["按契约返回绝对值", "Return the absolute value by contract"],
        ["调用点输出", "Write at the call site"],
      ],
      playbackMs: 1450,
      playbackPolicy: "guided",
      persistentEvidenceZh: "abs: int→int | input=当前值 | output=|input|。",
      persistentEvidenceEn: "abs: int→int | input=current value | output=|input|.",
      hiddenByDefaultZh: "libc 内部源码、调用栈细节、动态链接和其他库函数。",
      hiddenByDefaultEn:
        "libc source, call-stack details, dynamic linking, and other library functions.",
      researchUrls: [C_STANDARD],
    }),
    35: defineFoaLessonExperience({
      visualFamily: "decision",
      visualModelZh: "<low、[low,high]、>high 三段数轴；value 沿最短路径返回端点或自身。",
      visualModelEn:
        "A three-zone <low, [low,high], >high line where value returns the nearest valid result.",
      primaryActionZh: "把 14 放到数轴并选择应返回的端点。",
      primaryActionEn: "Place 14 on the line and choose the endpoint to return.",
      sequence: [
        ["检查 value<low", "Check value<low"],
        ["检查 value>high", "Check value>high"],
        ["选择 high", "Select high"],
        ["返回 10", "Return 10"],
      ],
      playbackMs: 1650,
      playbackPolicy: "guided",
      persistentEvidenceZh: "value=14, low=0, high=10 → upper zone → 10。",
      persistentEvidenceEn: "value=14, low=0, high=10 → upper zone → 10.",
      hiddenByDefaultZh: "函数设计长文、调用帧、low>high 扩展和全部分支代码。",
      hiddenByDefaultEn:
        "Function-design prose, call frames, low>high extensions, and all branch code.",
      researchUrls: [C_STANDARD],
    }),
    36: defineFoaLessonExperience({
      visualFamily: "call-stack",
      visualModelZh: "垂直递归栈：进入时只显示 factorial(n)，返回时才显示乘法。",
      visualModelEn:
        "A vertical recursion stack showing factorial(n) on entry and multiplication only during return.",
      primaryActionZh: "在 n=1 确认基例，再逐帧返回上一层。",
      primaryActionEn: "Confirm the base case at n=1, then return one frame at a time.",
      sequence: [
        ["建立 5→4→3→2→1 的调用帧", "Build frames 5→4→3→2→1"],
        ["基例返回 1", "Return 1 from the base case"],
        ["逐层乘 n", "Multiply by n while unwinding"],
        ["顶层返回 120", "Return 120 at the top"],
      ],
      playbackMs: 1850,
      playbackPolicy: "guided",
      persistentEvidenceZh: "当前栈与返回链 1→2→6→24→120。",
      persistentEvidenceEn: "The current stack and return chain 1→2→6→24→120.",
      hiddenByDefaultZh: "每帧重复源码、循环版本、复杂度卡片和堆内存。",
      hiddenByDefaultEn:
        "Repeated source per frame, the loop version, the complexity card, and heap memory.",
      researchUrls: [USFCA_RECURSIVE_FACTORIAL, C_STANDARD],
    }),
    37: defineFoaLessonExperience({
      visualFamily: "sequence",
      visualModelZh: "guess 点沿单轴趋近 3；下方只列当前 guess 与残差 guess³−27。",
      visualModelEn:
        "A guess point converges toward 3 on one axis, with only guess and residual guess³−27 below.",
      primaryActionZh: "执行一次 Newton 更新，并检查新残差。",
      primaryActionEn: "Perform one Newton update and inspect the new residual.",
      sequence: [
        ["读取当前 guess", "Read the current guess"],
        ["代入更新公式", "Substitute into the update formula"],
        ["移动到新 guess", "Move to the new guess"],
        ["更新残差并判断稳定", "Update the residual and test stability"],
      ],
      playbackMs: 1900,
      playbackPolicy: "guided",
      persistentEvidenceZh: "最近三轮 iteration | guess | |guess³−27|。",
      persistentEvidenceEn: "The latest three iteration | guess | |guess³−27| rows.",
      hiddenByDefaultZh: "全部 20 行历史、切线推导、一般定理、调用栈和复杂度。",
      hiddenByDefaultEn:
        "All 20 rows, tangent derivation, the general theorem, call stack, and complexity.",
      researchUrls: [NIST_NEWTON, MIT_NEWTON],
    }),
    38: defineFoaLessonExperience({
      visualFamily: "evidence",
      visualModelZh: "三行测试表；当前夹具卡进入 minimum，actual 与 expected 在原行比较。",
      visualModelEn:
        "A three-row test table where the active fixture enters minimum and actual compares in place with expected.",
      primaryActionZh: "逐行运行案例，不能一次点出 3/3。",
      primaryActionEn: "Run one case at a time; 3/3 cannot be revealed in one click.",
      sequence: [
        ["选择一行", "Select a row"],
        ["调用 minimum", "Call minimum"],
        ["比较 actual 与 expected", "Compare actual with expected"],
        ["标记结果并推进", "Mark the result and advance"],
      ],
      playbackMs: 1550,
      playbackPolicy: "guided",
      persistentEvidenceZh: "三行 input | expected | actual | pass/fail。",
      persistentEvidenceEn: "Three input | expected | actual | pass/fail rows.",
      hiddenByDefaultZh: "测试框架术语、循环变量、重复函数动画和性能数据。",
      hiddenByDefaultEn:
        "Test-framework terminology, loop variables, repeated function animation, and performance data.",
      researchUrls: [OPEN_DSA_INTRO, C_STANDARD],
    }),
    39: defineFoaLessonExperience({
      visualFamily: "call-stack",
      visualModelZh: "caller value=5 与 callee value=5 两张卡，中间只有单向 copy 箭头。",
      visualModelEn:
        "Caller value=5 and callee value=5 appear as separate cards connected only by a one-way copy arrow.",
      primaryActionZh: "只给 callee 卡执行 ++，再关闭 callee 观察 caller 未变。",
      primaryActionEn:
        "Increment only the callee card, then close it and observe the unchanged caller.",
      sequence: [
        ["复制 caller 值到形参", "Copy the caller value to the parameter"],
        ["形参加一成为 6", "Increment the parameter to 6"],
        ["输出 inside=6", "Write inside=6"],
        ["销毁 callee，caller 仍为 5", "Destroy the callee; caller remains 5"],
      ],
      playbackMs: 1750,
      playbackPolicy: "guided",
      persistentEvidenceZh: "caller:5→5 | parameter:5→6→destroyed。",
      persistentEvidenceEn: "caller:5→5 | parameter:5→6→destroyed.",
      hiddenByDefaultZh: "地址、指针传参预告、栈指针和完整源码。",
      hiddenByDefaultEn:
        "Addresses, pointer-parameter previews, stack pointers, and the full source.",
      researchUrls: [C_STANDARD, PYTHON_TUTOR_PAPER],
    }),
    40: defineFoaLessonExperience({
      visualFamily: "call-stack",
      visualModelZh: "return token 从 callee 出口移动到 caller 的 distance 槽，抵达前槽位为空。",
      visualModelEn:
        "A return token travels from the callee exit to caller's distance slot, which stays empty until arrival.",
      primaryActionZh: "沿 return 通道把算出的 12 送回调用表达式并绑定。",
      primaryActionEn:
        "Send the computed 12 through the return channel and bind it at the call expression.",
      sequence: [
        ["传入 -12", "Pass -12"],
        ["callee 算出 12", "Compute 12 in the callee"],
        ["return 携值结束 callee", "Return the value and end the callee"],
        ["绑定 distance=12 并输出", "Bind distance=12 and write it"],
      ],
      playbackMs: 1750,
      playbackPolicy: "guided",
      persistentEvidenceZh: "argument -12 → callee result 12 → return 12 → distance 12。",
      persistentEvidenceEn: "argument -12 → callee result 12 → return 12 → distance 12.",
      hiddenByDefaultZh: "多函数组合、地址/堆栈细节、未激活代码和重复概念文字。",
      hiddenByDefaultEn:
        "Multi-function composition, address/stack details, inactive code, and repeated concept prose.",
      researchUrls: [C_STANDARD, GDB],
    }),
  });
