#include <stdlib.h>
#include <string.h>

int main(void) {
    const size_t chunk_size = 16U * 1024U * 1024U;
    for (;;) {
        void *chunk = malloc(chunk_size);
        if (chunk == NULL) {
            return 2;
        }
        memset(chunk, 0xa5, chunk_size);
    }
}
