int f(int x) { goto inside; while (x) { inside: x--; } return x; }
