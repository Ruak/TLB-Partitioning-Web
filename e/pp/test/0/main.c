#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "pp.h"
#include "wrapper.h"

void tobinary(const char* data, uint8_t* des) {
	unsigned int x;
	for (int i = 0; i < 16; i++) {
		sscanf(data + i * 2, "%2x", &x);
		des[i] = x;
	}
}

int main() {
	const char keystr[] = "2b7e151628aed2a6abf7158809cf4f3c";

	uint8_t key[16];
	tobinary(keystr, key);

	CRYPT_AES_Key rdkey;
	wp_set_encrypt_key128(&rdkey, key);

	wp_encrypt_block(key, key, &rdkey);
	for (int i = 0; i < 16; i++) {
		printf("%02x", key[i]);
	}
	printf("\n");

	// uint8_t recovered_key = pp(wp_encrypt_block, &rdkey, 200000, 1);
	// printf("Recovered key: %02x\n", recovered_key);
}
