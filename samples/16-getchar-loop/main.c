#include <stdio.h>

int main(void) {
    unsigned long characters = 0;
    unsigned long lines = 0;
    int current = 0;

    while ((current = getchar()) != EOF) {
        characters++;
        if (current == '\n') {
            lines++;
        }
    }

    printf("%lu %lu\n", characters, lines);
    return 0;
}
