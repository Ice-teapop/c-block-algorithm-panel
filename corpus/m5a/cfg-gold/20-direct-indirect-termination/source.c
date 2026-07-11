void direct_stop(void) { exit(1); abort(); }
void indirect_calls(void) { (exit)(1); foo(exit(1)); return; }
