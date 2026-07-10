int main(void) {
    int value = 0;
#ifndef FEATURE
    value = 1;
#else
    value = 2;
#endif
    return value;
}
