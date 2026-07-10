#include <stdio.h>

int main(void) {
    FILE *output = fopen("output.bin", "wb");
    if (output == NULL) {
        return 1;
    }
    for (;;) {
        if (fputc('x', output) == EOF) {
            fclose(output);
            return 2;
        }
    }
}
