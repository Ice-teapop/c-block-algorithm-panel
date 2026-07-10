#include <stdio.h>
#include <stdlib.h>

int main(void) {
    size_t rows = 0;
    size_t columns = 0;
    if (scanf("%zu %zu", &rows, &columns) != 2 || rows > 32U || columns > 32U) {
        return 1;
    }

    int **matrix = calloc(rows, sizeof(*matrix));
    if (matrix == NULL && rows != 0U) {
        return 1;
    }

    for (size_t row = 0; row < rows; row++) {
        matrix[row] = malloc(columns * sizeof(*matrix[row]));
        if (matrix[row] == NULL && columns != 0U) {
            for (size_t previous = 0; previous < row; previous++) {
                free(matrix[previous]);
            }
            free(matrix);
            return 1;
        }
        for (size_t column = 0; column < columns; column++) {
            if (scanf("%d", &matrix[row][column]) != 1) {
                for (size_t allocated = 0; allocated <= row; allocated++) {
                    free(matrix[allocated]);
                }
                free(matrix);
                return 1;
            }
        }
    }

    for (size_t row = 0; row < rows; row++) {
        long sum = 0;
        for (size_t column = 0; column < columns; column++) {
            sum += matrix[row][column];
        }
        printf("%ld\n", sum);
        free(matrix[row]);
    }
    free(matrix);
    return 0;
}
