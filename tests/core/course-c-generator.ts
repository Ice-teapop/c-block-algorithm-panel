import fc from "fast-check";

export interface GeneratedCourseProgram {
  readonly source: string;
  readonly features: Readonly<{ hasFor: boolean }>;
}

interface StatementFragment {
  readonly source: string;
  readonly hasFor: boolean;
}

type CourseArbitraries = {
  readonly expression: string;
  readonly simpleStatement: StatementFragment;
  readonly statement: StatementFragment;
  readonly block: StatementFragment;
  readonly ifStatement: StatementFragment;
  readonly forStatement: StatementFragment;
};

const leafExpression = fc.oneof(
  fc.integer({ min: 0, max: 20 }).map(String),
  fc.constantFrom("total", "value"),
);
const binaryOperator = fc.constantFrom("+", "-", "*", "/", "%", "<", "<=", "==", "!=");
const assignmentOperator = fc.constantFrom("=", "+=", "-=", "*=");

const recursive = fc.letrec<CourseArbitraries>((tie) => ({
  expression: fc.oneof(
    { depthSize: "small", maxDepth: 3, withCrossShrink: true },
    leafExpression,
    fc
      .tuple(tie("expression"), binaryOperator, tie("expression"))
      .map(([left, operator, right]) => `(${left} ${operator} ${right})`),
    tie("expression").map((expression) => `(${expression})`),
  ),
  simpleStatement: fc
    .tuple(fc.constantFrom("total", "value"), assignmentOperator, tie("expression"))
    .map(([target, operator, expression]) =>
      fragment(`${target} ${operator} ${expression};`, false),
    ),
  statement: fc.oneof(
    {
      depthSize: "small",
      maxDepth: 3,
      depthIdentifier: "course-c-statement",
      withCrossShrink: true,
    },
    tie("simpleStatement"),
    tie("ifStatement"),
    tie("forStatement"),
  ),
  block: fc
    .array(tie("statement"), {
      minLength: 1,
      maxLength: 3,
      depthIdentifier: "course-c-statement",
    })
    .map(joinFragments),
  ifStatement: fc
    .tuple(tie("expression"), tie("expression"), tie("block"), tie("block"))
    .map(([left, right, consequence, alternative]) =>
      fragment(
        [
          `if (${left} < ${right}) {`,
          indent(consequence.source),
          "} else {",
          indent(alternative.source),
          "}",
        ].join("\n"),
        consequence.hasFor || alternative.hasFor,
      ),
    ),
  forStatement: fc
    .tuple(fc.integer({ min: 0, max: 6 }), tie("block"))
    .map(([limit, body]) =>
      fragment(
        [`for (int i = 0; i < ${String(limit)}; i++) {`, indent(body.source), "}"].join("\n"),
        true,
      ),
    ),
}));

export const courseCProgramArbitrary: fc.Arbitrary<GeneratedCourseProgram> = fc
  .tuple(
    fc.array(recursive.statement, { minLength: 1, maxLength: 4 }),
    fc.constantFrom("\n", "\r\n"),
  )
  .map(([statements, newline]) => {
    const body = joinFragments(statements);
    const source = [
      "int main(void) {",
      "    int total = 0;",
      "    int value = 1;",
      indent(body.source),
      "    return total + value;",
      "}",
      "",
    ]
      .join("\n")
      .replaceAll("\n", newline);
    return Object.freeze({
      source,
      features: Object.freeze({ hasFor: body.hasFor }),
    });
  });

function fragment(source: string, hasFor: boolean): StatementFragment {
  return Object.freeze({ source, hasFor });
}

function joinFragments(statements: readonly StatementFragment[]): StatementFragment {
  return fragment(
    statements.map((statement) => statement.source).join("\n"),
    statements.some((statement) => statement.hasFor),
  );
}

function indent(source: string): string {
  return source
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}
