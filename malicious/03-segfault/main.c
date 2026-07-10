#include <signal.h>

int main(void) {
    return raise(SIGSEGV);
}
