#include <stdio.h>
#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

static void destroy_list(struct node *head) {
    while (head != NULL) {
        struct node *next = head->next;
        free(head);
        head = next;
    }
}

int main(void) {
    struct node *head = NULL;
    int value = 0;

    while (scanf("%d", &value) == 1) {
        struct node *created = malloc(sizeof(*created));
        if (created == NULL) {
            destroy_list(head);
            return 1;
        }
        created->value = value;
        created->next = head;
        head = created;
    }

    for (const struct node *current = head; current != NULL; current = current->next) {
        printf("%s%d", current == head ? "" : " ", current->value);
    }
    putchar('\n');
    destroy_list(head);
    return 0;
}
