#include <stdio.h>
#include <stdlib.h>

int main(void) {
    size_t n = 0;
    if (scanf("%zu", &n) != 1) {
        return 1;
    }

    int *values = malloc(n * sizeof(*values));
    if (values == NULL && n != 0) {
        return 1;
    }

    for (size_t i = 0; i < n; i++) {
        if (scanf("%d", &values[i]) != 1) {
            free(values);
            return 1;
        }
    }

    int target = 0;
    if (scanf("%d", &target) != 1) {
        free(values);
        return 1;
    }

    long result = -1;
    for (size_t i = 0; i < n; i++) {
        if (values[i] == target) {
            result = (long)i;
            break;
        }
    }

    printf("%ld\n", result);
    free(values);
    return 0;
}
