#include <stdlib.h>

void leak(void) {
  int *p = malloc(4);
  return;
}

int temporal(void) {
  int *p = malloc(4);
  free(p);
  free(p);
  return *p;
}
