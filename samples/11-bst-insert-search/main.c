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
        created->value = value;
        created->left = NULL;
        created->right = NULL;
        return created;
    }
    if (value < root->value) {
        struct node *updated = insert(root->left, value);
        if (updated != NULL) {
            root->left = updated;
        }
    } else if (value > root->value) {
        struct node *updated = insert(root->right, value);
        if (updated != NULL) {
            root->right = updated;
        }
    }
    return root;
}

static int contains(const struct node *root, int target) {
    while (root != NULL) {
        if (target == root->value) {
            return 1;
        }
        root = target < root->value ? root->left : root->right;
    }
    return 0;
}

static void destroy_tree(struct node *root) {
    if (root == NULL) {
        return;
    }
    destroy_tree(root->left);
    destroy_tree(root->right);
    free(root);
}

int main(void) {
    int n = 0;
    if (scanf("%d", &n) != 1 || n < 0 || n > 64) {
        return 1;
    }

    struct node *root = NULL;
    for (int i = 0; i < n; i++) {
        int value = 0;
        if (scanf("%d", &value) != 1) {
            destroy_tree(root);
            return 1;
        }
        root = insert(root, value);
        if (root == NULL) {
            return 1;
        }
    }

    int target = 0;
    if (scanf("%d", &target) != 1) {
        destroy_tree(root);
        return 1;
    }
    printf("%d\n", contains(root, target));
    destroy_tree(root);
    return 0;
}
