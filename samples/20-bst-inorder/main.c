#include <stdio.h>
#include <stdlib.h>

struct node {
    int value;
    struct node *left;
    struct node *right;
};

static struct node *insert(struct node *root, int value) {
    if (root == NULL) {
        struct node *created = malloc(sizeof(*created));
        if (created == NULL) {
            return NULL;
        }
        *created = (struct node){.value = value, .left = NULL, .right = NULL};
        return created;
    }
    if (value < root->value) {
        root->left = insert(root->left, value);
    } else if (value > root->value) {
        root->right = insert(root->right, value);
    }
    return root;
}

static void print_inorder(const struct node *root, int *first) {
    if (root == NULL) {
        return;
    }
    print_inorder(root->left, first);
    printf("%s%d", *first != 0 ? "" : " ", root->value);
    *first = 0;
    print_inorder(root->right, first);
}

static void destroy_tree(struct node *root) {
    if (root != NULL) {
        destroy_tree(root->left);
        destroy_tree(root->right);
        free(root);
    }
}

int main(void) {
    struct node *root = NULL;
    int value = 0;
    while (scanf("%d", &value) == 1) {
        root = insert(root, value);
        if (root == NULL) {
            return 1;
        }
    }
    int first = 1;
    print_inorder(root, &first);
    putchar('\n');
    destroy_tree(root);
    return 0;
}
