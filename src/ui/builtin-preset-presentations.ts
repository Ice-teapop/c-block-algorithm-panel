import type { CatalogPresetBlock } from "../learning/index.js";

export interface BuiltinPresetPresentation {
  readonly label: string;
  readonly description: string;
}

/**
 * Reviewed English copy for every built-in preset, keyed by its stable catalog id.
 *
 * Keep this separate from the source definitions: the Chinese catalog remains the
 * compatibility source of truth, while the palette can change presentation without
 * changing project snapshots or user-authored custom blocks.
 */
export const ENGLISH_BUILTIN_PRESET_PRESENTATIONS: Readonly<
  Record<string, BuiltinPresetPresentation>
> = Object.freeze({
  "builtin.flow.start": entry(
    "Start",
    "Defines the single entry point for a flow run without generating a C statement.",
  ),
  "builtin.flow.end": entry(
    "End",
    "Marks a completed flow path without replacing a return statement in the function.",
  ),
  "builtin.flow.pause": entry(
    "Pause",
    "Pauses teaching playback until the user continues; real C execution is unchanged.",
  ),
  "builtin.flow.checkpoint": entry(
    "Checkpoint",
    "Records local playback state and metrics without inserting probes into main.c.",
  ),
  "builtin.flow.merge": entry(
    "Merge Paths",
    "Joins mutually exclusive control paths before one successor without generating extra C.",
  ),

  "builtin.control.if": entry(
    "Conditional Branch",
    "Runs an action when the condition is nonzero.",
  ),
  "builtin.control.if-else": entry(
    "Two-Way Branch",
    "Chooses one of two actions from the condition.",
  ),
  "builtin.control.switch": entry(
    "Multi-Way Selection",
    "Selects a case from an integer or enum value while preserving a default path.",
  ),
  "builtin.control.for": entry("Counting Loop", "Repeats an action from zero using a fixed step."),
  "builtin.control.while": entry(
    "Conditional Loop",
    "Keeps running an action while the condition is nonzero.",
  ),
  "builtin.control.do-while": entry(
    "Run-Then-Test Loop",
    "Runs the loop body once before checking whether to continue.",
  ),
  "builtin.control.break": entry(
    "Exit Current Loop",
    "Immediately leaves the innermost loop or switch.",
  ),
  "builtin.control.continue": entry(
    "Continue to Next Iteration",
    "Skips the remaining statements in this iteration and tests the loop again.",
  ),

  "builtin.c.declare-integer": entry(
    "Declare Integer",
    "Declares an integer variable with an initial value.",
  ),
  "builtin.c.declare-double": entry(
    "Declare Double",
    "Declares a double-precision floating-point variable.",
  ),
  "builtin.c.declare-character": entry(
    "Declare Character",
    "Declares a character initialized to the null character.",
  ),
  "builtin.c.declare-constant": entry(
    "Declare Read-Only Value",
    "Uses const for a value that should not change after initialization.",
  ),
  "builtin.c.assign-value": entry(
    "Assign Value",
    "Stores an expression result in an existing variable.",
  ),
  "builtin.c.add-assign": entry("Accumulate Value", "Adds a new value to an existing total."),
  "builtin.c.increment": entry("Increment by One", "Increases an integer variable by one."),
  "builtin.c.arithmetic": entry(
    "Compose Arithmetic Expression",
    "Evaluates and stores an expression using C operator precedence.",
  ),
  "builtin.c.compare-flag": entry(
    "Store Comparison Result",
    "Stores the zero-or-one result of a relational expression as an integer flag.",
  ),
  "builtin.c.cast-integer": entry(
    "Cast to Integer",
    "Makes truncation explicit when converting a floating-point value to an integer.",
  ),
  "builtin.c.print-integer": entry(
    "Print Integer",
    "Writes an integer followed by a newline to standard output.",
  ),

  "builtin.io.print-text": entry(
    "Print Text",
    "Writes a NUL-terminated string to standard output.",
  ),
  "builtin.io.scan-integer": entry(
    "Read Integer",
    "Reads an integer from standard input into a variable address.",
  ),
  "builtin.functions.call": entry(
    "Call Function",
    "Calls an existing function and stores its return value.",
  ),
  "builtin.functions.call-void": entry(
    "Call Procedure",
    "Calls an existing function without receiving a return value.",
  ),
  "builtin.c.return-success": entry(
    "Return Success",
    "Returns a successful status from the current function.",
  ),
  "builtin.functions.return-value": entry(
    "Return Value",
    "Ends the current function and passes a result to its caller.",
  ),
  "builtin.io.put-character": entry("Write Character", "Writes one character to standard output."),
  "builtin.io.read-character": entry(
    "Read Character",
    "Reads one character while retaining the int range required for EOF.",
  ),
  "builtin.io.report-error": entry(
    "Report Error",
    "Writes an error message to the standard error stream.",
  ),

  "builtin.arrays.declare": entry(
    "Declare Array",
    "Declares and zero-initializes a fixed-length integer array.",
  ),
  "builtin.arrays.read": entry("Read Array Element", "Reads an array element at an index."),
  "builtin.arrays.write": entry("Write Array Element", "Updates an array element at an index."),
  "builtin.arrays.length": entry(
    "Get Fixed Array Length",
    "Calculates the element count while the value still has an array type.",
  ),
  "builtin.arrays.initialize-loop": entry(
    "Initialize Array Elements",
    "Assigns an initial value to each element in the valid index range.",
  ),
  "builtin.strings.declare": entry(
    "Declare String Buffer",
    "Declares a fixed-capacity character array initialized as an empty string.",
  ),
  "builtin.strings.length": entry(
    "Get String Length",
    "Counts the characters before the first NUL character.",
  ),
  "builtin.strings.compare": entry(
    "Compare Strings",
    "Compares two NUL-terminated strings lexicographically.",
  ),
  "builtin.strings.copy-bounded": entry(
    "Copy String with Limit",
    "Copies within the destination capacity and normally preserves NUL termination.",
  ),
  "builtin.arrays.matrix-access": entry(
    "Access Matrix Element",
    "Reads a two-dimensional array element using row and column indexes.",
  ),

  "builtin.pointers.address": entry(
    "Take Variable Address",
    "Stores the address of an integer variable in a pointer.",
  ),
  "builtin.pointers.read": entry(
    "Read Through Pointer",
    "Reads the pointed-to object; pointer validity must be established before running.",
  ),
  "builtin.pointers.write": entry(
    "Write Through Pointer",
    "Writes the pointed-to object; writability must be established before running.",
  ),
  "builtin.pointers.null": entry(
    "Initialize Null Pointer",
    "Uses NULL to represent that no object can currently be dereferenced.",
  ),
  "builtin.pointers.null-guard": entry(
    "Guard Against Null",
    "Handles the path with no target before dereferencing a pointer.",
  ),
  "builtin.memory.malloc": entry(
    "Allocate Dynamic Array",
    "Allocates uninitialized storage for a number of elements and still requires a failure check.",
  ),
  "builtin.memory.calloc": entry(
    "Allocate Zeroed Array",
    "Allocates storage with all bytes zeroed and still requires a failure check.",
  ),
  "builtin.memory.realloc": entry(
    "Resize Dynamic Array",
    "Keeps the realloc result separate and replaces the original pointer only on success.",
  ),
  "builtin.memory.free": entry(
    "Free Dynamic Memory",
    "Releases dynamic memory still owned by the current path exactly once.",
  ),
  "builtin.pointers.advance": entry(
    "Advance Pointer",
    "Moves a pointer to the next element within the same array object.",
  ),

  "builtin.linear.advance-node": entry(
    "Advance to Next Node",
    "Moves to the next node in a linked structure.",
  ),
  "builtin.linear.insert-after": entry(
    "Insert After Linked Node",
    "Inserts a node by linking its successor before linking its predecessor.",
  ),
  "builtin.linear.remove-after": entry(
    "Remove After Linked Node",
    "Unlinks and frees the node following the current node.",
  ),
  "builtin.stack.push": entry(
    "Push onto Array Stack",
    "Writes at the stack top and advances top after a capacity check.",
  ),
  "builtin.stack.pop": entry(
    "Pop from Array Stack",
    "Decrements top after a nonempty check, then reads the previous top value.",
  ),
  "builtin.queue.enqueue": entry(
    "Enqueue in Circular Queue",
    "Writes at the tail and wraps the tail index by the queue capacity.",
  ),
  "builtin.queue.dequeue": entry(
    "Dequeue from Circular Queue",
    "Reads at the head and wraps the head index by the queue capacity.",
  ),
  "builtin.trees.visit-left": entry(
    "Visit Left Subtree",
    "Recursively visits the left subtree of the current node.",
  ),
  "builtin.trees.visit-right": entry(
    "Visit Right Subtree",
    "Recursively visits the right subtree of the current node.",
  ),
  "builtin.graphs.adjacency-loop": entry(
    "Traverse Adjacent Edges",
    "Visits every outgoing edge of a node through an adjacency list.",
  ),

  "builtin.search.match": entry(
    "Record Search Match",
    "Records the position of a target and stops the current loop.",
  ),
  "builtin.search.update-maximum": entry(
    "Update Maximum",
    "Updates the current maximum only for a larger value during one linear scan.",
  ),
  "builtin.search.linear-loop": entry(
    "Linear Search",
    "Checks elements from start to end, records a matching index, and stops.",
  ),
  "builtin.search.binary-step": entry(
    "Binary Search Step",
    "Uses the midpoint comparison to keep the half that may still contain the answer.",
  ),
  "builtin.sort.swap-adjacent": entry(
    "Swap Adjacent Inversion",
    "Compares and swaps one adjacent pair that is out of order.",
  ),
  "builtin.sort.select-minimum": entry(
    "Update Minimum Position",
    "Tracks the index of the smallest item while scanning the unsorted range.",
  ),
  "builtin.sort.insertion-shift": entry(
    "Shift Larger Elements Right",
    "Makes room for an insertion while preserving the sorted prefix.",
  ),
  "builtin.recursion.reduce": entry(
    "Reduce Recursive Problem",
    "Stops at a base case and reduces the problem size in the recursive call.",
  ),
  "builtin.algorithms.two-pointer": entry(
    "Contract Two Pointers",
    "Moves one boundary pointer according to the current state.",
  ),
  "builtin.algorithms.sliding-window": entry(
    "Update Sliding Window",
    "Removes the element leaving the window and adds the element entering it.",
  ),
  "builtin.graphs.bfs-step": entry(
    "BFS Queue Step",
    "Removes one node from the queue front and visits it.",
  ),
  "builtin.dynamic-programming.transition": entry(
    "Dynamic Programming Transition",
    "Computes the current state from smaller states that are already solved.",
  ),

  "builtin.analysis.assert": entry(
    "Check Invariant",
    "Checks an expected invariant while the program runs.",
  ),
  "builtin.analysis.count-operation": entry(
    "Count Basic Operation",
    "Counts one selected basic operation for empirical complexity analysis.",
  ),
  "builtin.analysis.timer-start": entry(
    "Record Start Clock",
    "Records the processor clock at the start of an algorithm measurement.",
  ),
  "builtin.analysis.timer-end": entry(
    "Calculate Elapsed Clock",
    "Calculates processor clock ticks consumed by the same measurement interval.",
  ),
  "builtin.testing.expected-check": entry(
    "Compare Expected Result",
    "Records a case when the actual value differs from the expected value.",
  ),
  "builtin.analysis.benchmark-loop": entry(
    "Repeat Benchmark Run",
    "Repeats one case to collect runs for a median measurement.",
  ),
});

export function presentPresetBlock(
  preset: Pick<CatalogPresetBlock, "id" | "label" | "description" | "origin">,
  locale: "zh-CN" | "en",
): BuiltinPresetPresentation {
  if (locale !== "en" || preset.origin !== "builtin") {
    return Object.freeze({ label: preset.label, description: preset.description });
  }
  return ENGLISH_BUILTIN_PRESET_PRESENTATIONS[preset.id] ?? fallbackEntry(preset.id);
}

function entry(label: string, description: string): BuiltinPresetPresentation {
  return Object.freeze({ label, description });
}

function fallbackEntry(id: string): BuiltinPresetPresentation {
  const readableId = id
    .replace(/^builtin\./u, "")
    .split(/[.-]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
  return entry(readableId || "Built-in Preset", "Built-in preset. English copy is pending review.");
}
