#include <stdio.h>

static void swap(int *left, int *right) {
    int temporary = *left;
    *left = *right;
    *right = temporary;
}

static int partition(int values[], int low, int high) {
    int pivot = values[high];
    int boundary = low;
    for (int i = low; i < high; i++) {
        if (values[i] <= pivot) {
            swap(&values[boundary], &values[i]);
            boundary++;
        }
    }
    swap(&values[boundary], &values[high]);
    return boundary;
}

static void quick_sort(int values[], int low, int high) {
    if (low >= high) {
        return;
    }
    int pivot = partition(values, low, high);
    quick_sort(values, low, pivot - 1);
    quick_sort(values, pivot + 1, high);
}

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

    quick_sort(values, 0, n - 1);
    for (int i = 0; i < n; i++) {
        printf("%s%d", i == 0 ? "" : " ", values[i]);
    }
    putchar('\n');
    return 0;
}
