#include <stdio.h>

static unsigned long long factorial(unsigned int n) {
    if (n <= 1U) {
        return 1U;
    }
    return n * factorial(n - 1U);
}

int main(void) {
    unsigned int n = 0;
    if (scanf("%u", &n) != 1 || n > 20U) {
        return 1;
    }
    printf("%llu\n", factorial(n));
    return 0;
}
