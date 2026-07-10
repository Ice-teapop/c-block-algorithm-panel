#ifdef FEATURE
int feature(void) {
    return 1;
}
#else
int feature(void) {
    return 0;
}
#endif

int main(void) {
    return feature();
}
