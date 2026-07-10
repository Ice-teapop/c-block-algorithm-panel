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

    for (int end = n - 1; end > 0; end--) {
        for (int j = 0; j < end; j++) {
            if (values[j] > values[j + 1]) {
                int temporary = values[j];
                values[j] = values[j + 1];
                values[j + 1] = temporary;
            }
        }
    }

    for (int i = 0; i < n; i++) {
        printf("%s%d", i == 0 ? "" : " ", values[i]);
    }
    putchar('\n');
    return 0;
}
