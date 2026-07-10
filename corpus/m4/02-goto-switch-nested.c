int classify(int value) {
    for (int pass = 0; pass < 2; pass++) {
        switch (value) {
            case 0:
                goto zero;
            case 1:
                goto one;
            default:
                value--;
        }
    }

zero:
    return 0;
one:
    return 1;
}
