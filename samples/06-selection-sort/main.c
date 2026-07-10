#include <stdio.h>

int main(void) {
    int values[64];
    int n = 0;

    if (scanf("%d", &n) != 1 || n < 0 || n > 64) {
        return 1;
    }
    for (int i = 0; i < n; i++) {
        if (scanf("%d", &values[i]) != 1) {
            return 1;
        }
    }

    for (int i = 0; i < n; i++) {
        int minimum = i;
        for (int j = i + 1; j < n; j++) {
            if (values[j] < values[minimum]) {
                minimum = j;
            }
        }
        int temporary = values[i];
        values[i] = values[minimum];
        values[minimum] = temporary;
    }

    for (int i = 0; i < n; i++) {
        printf("%s%d", i == 0 ? "" : " ", values[i]);
    }
    putchar('\n');
    return 0;
}
