int main(void) {
    volatile int *invalid = (int *)0;
    *invalid = 1;
    return 0;
}
