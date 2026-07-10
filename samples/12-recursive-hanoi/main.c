#include <stdio.h>

static void move_disks(unsigned int count, char source, char auxiliary, char target) {
    if (count == 0U) {
        return;
    }
    move_disks(count - 1U, source, target, auxiliary);
    printf("%c->%c\n", source, target);
    move_disks(count - 1U, auxiliary, source, target);
}

int main(void) {
    unsigned int count = 0;
    if (scanf("%u", &count) != 1 || count > 12U) {
        return 1;
    }
    move_disks(count, 'A', 'B', 'C');
    return 0;
}
