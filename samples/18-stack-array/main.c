#include <stdio.h>

int main(void) {
    int stack[64];
    int size = 0;
    int count = 0;

    if (scanf("%d", &count) != 1 || count < 0 || count > 64) {
        return 1;
    }
    for (int i = 0; i < count; i++) {
        if (scanf("%d", &stack[size]) != 1) {
            return 1;
        }
        size++;
    }

    int first = 1;
    while (size > 0) {
        size--;
        printf("%s%d", first != 0 ? "" : " ", stack[size]);
        first = 0;
    }
    putchar('\n');
    return 0;
}
