#include <stdio.h>
#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

int main(void) {
    struct node *head = NULL;
    struct node *tail = NULL;
    int value = 0;

    while (scanf("%d", &value) == 1) {
        struct node *created = malloc(sizeof(*created));
        if (created == NULL) {
            while (head != NULL) {
                struct node *next = head->next;
                free(head);
                head = next;
            }
            return 1;
        }
        created->value = value;
        created->next = NULL;
        if (tail == NULL) {
            head = created;
        } else {
            tail->next = created;
        }
        tail = created;
    }

    int first = 1;
    while (head != NULL) {
        struct node *next = head->next;
        printf("%s%d", first != 0 ? "" : " ", head->value);
        first = 0;
        free(head);
        head = next;
    }
    putchar('\n');
    return 0;
}
