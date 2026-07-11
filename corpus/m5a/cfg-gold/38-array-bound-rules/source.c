int off_by_one(void) {
  int values[3];
  int sum = 0;
  for (int i = 0; i <= 3; i++) {
    sum += values[i];
  }
  return sum;
}

int mismatch(int n, int j) {
  int values[8];
  int sum = 0;
  for (int i = 0; i < n; i++) {
    sum += values[j];
  }
  return sum;
}

int runtime_bound(int n) {
  int values[4];
  int sum = 0;
  for (int i = 0; i < n; i++) {
    sum += values[i];
  }
  return sum;
}
