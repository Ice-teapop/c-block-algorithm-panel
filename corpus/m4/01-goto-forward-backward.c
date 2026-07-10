int main(void) {
    int value = 0;

start:
    if (value == 0) {
        value++;
        goto middle;
    }
    goto finish;

middle:
    if (value < 3) {
        value++;
        goto start;
    }

finish:
    return value;
}
