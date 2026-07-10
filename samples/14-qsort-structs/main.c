#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct record {
    char name[32];
    int score;
};

static int compare_records(const void *left, const void *right) {
    const struct record *a = left;
    const struct record *b = right;
    if (a->score != b->score) {
        return a->score < b->score ? 1 : -1;
    }
    return strcmp(a->name, b->name);
}

int main(void) {
    struct record records[32];
    int count = 0;
    if (scanf("%d", &count) != 1 || count < 0 || count > 32) {
        return 1;
    }
    for (int i = 0; i < count; i++) {
        if (scanf("%31s %d", records[i].name, &records[i].score) != 2) {
            return 1;
        }
    }

    qsort(records, (size_t)count, sizeof(records[0]), compare_records);
    for (int i = 0; i < count; i++) {
        printf("%s %d\n", records[i].name, records[i].score);
    }
    return 0;
}
