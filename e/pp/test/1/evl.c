#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "pp.h"

void bintostr(const uint8_t* bin, char* str, size_t len) {
	for (size_t i = 0; i < len; i++) {
		sprintf(str + 2*i, "%02x", bin[i]);
	}
	str[2*len] = '\0';
}

void crypto(uint8_t* input, uint8_t* output, void* rdkey) {
	char buf[100];

	const char* keystr = rdkey;

	char inputstr[33];
	bintostr(input, inputstr, 16);

	snprintf(buf, sizeof(buf), "taskset -c 18 ./vic %s %s > /dev/null", keystr, inputstr);
	system(buf);
}

int main() {
	char keystr[] = "2b7e151628aed2a6abf7158809cf4f3c";

	uint8_t recovered_key = pp(crypto, keystr, 100000, 1);
	printf("Recovered key: %02x\n", recovered_key);
}
