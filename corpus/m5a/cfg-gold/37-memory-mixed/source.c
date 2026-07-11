#include <stdlib.h>
int possible_leak(int release) { int *p = malloc(sizeof *p); if (release) free(p); return 0; }
int possible_temporal(int c) { int *p = malloc(4); if (c) free(p); int value = *p; free(p); return value; }
int hints(void) { int *p = malloc(sizeof p); *p = 1; free(p); return 0; }
