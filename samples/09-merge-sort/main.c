#include <stdio.h>

static void merge(int values[], int temporary[], int left, int middle, int right) {
    int i = left;
    int j = middle;
    int write = left;

    while (i < middle && j < right) {
        if (values[i] <= values[j]) {
            temporary[write++] = values[i++];
        } else {
            temporary[write++] = values[j++];
        }
    }
    while (i < middle) {
        temporary[write++] = values[i++];
    }
    while (j < right) {
        temporary[write++] = values[j++];
    }
    for (int k = left; k < right; k++) {
        values[k] = temporary[k];
    }
}

static void merge_sort(int values[], int temporary[], int left, int right) {
    if (right - left <= 1) {
        return;
    }
    int middle = left + (right - left) / 2;
    merge_sort(values, temporary, left, middle);
    merge_sort(values, temporary, middle, right);
    merge(values, temporary, left, middle, right);
}

int main(void) {
    int values[64];
    int temporary[64];
    int n = 0;
    if (scanf("%d", &n) != 1 || n < 0 || n > 64) {
        return 1;
    }
    for (int i = 0; i < n; i++) {
        if (scanf("%d", &values[i]) != 1) {
            return 1;
        }
    }

    merge_sort(values, temporary, 0, n);
    for (int i = 0; i < n; i++) {
        printf("%s%d", i == 0 ? "" : " ", values[i]);
    }
    putchar('\n');
    return 0;
}
