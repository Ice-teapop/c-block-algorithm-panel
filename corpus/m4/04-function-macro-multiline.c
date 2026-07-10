#define CLAMP(x, low, high) \
    ((x) < (low) ? (low) : ((x) > (high) ? (high) : (x)))

int main(void) {
    return CLAMP(7, 0, 5);
}
