#include <stdio.h>
#include <string.h>

int main(void) {
    char text[256];
    if (fgets(text, sizeof(text), stdin) == NULL) {
        return 1;
    }

    size_t length = strcspn(text, "\n");
    text[length] = '\0';
    for (size_t left = 0; left < length / 2U; left++) {
        size_t right = length - left - 1U;
        char temporary = text[left];
        text[left] = text[right];
        text[right] = temporary;
    }

    puts(text);
    return 0;
}
