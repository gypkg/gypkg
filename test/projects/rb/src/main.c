#include <string.h>

#include "ringbuffer.h"

int main() {
  char tmp[100];

  ringbuffer r;
  ringbuffer_init(&r);
  if (ringbuffer_write_into(&r, "hello", 5) != 0)
    return -1;
  if (ringbuffer_read_into(&r, tmp, sizeof(tmp)) != 5)
    return -1;
  if (strncmp(tmp, "hello", 5) != 0)
    return -1;

  ringbuffer_destroy(&r);
  return 0;
}
