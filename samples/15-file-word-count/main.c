#include <stdio.h>

int main(int argc, char *argv[]) {
    if (argc != 2) {
        return 1;
    }

    FILE *input = fopen(argv[1], "r");
    if (input == NULL) {
        return 1;
    }

    char word[128];
    unsigned long count = 0;
    while (fscanf(input, "%127s", word) == 1) {
        count++;
    }

    if (fclose(input) != 0) {
        return 1;
    }
    printf("%lu\n", count);
    return 0;
}
