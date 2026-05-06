#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wrapper.h"

void tobinary(const char *data, uint8_t *des) {
	unsigned int x;
	for (int i = 0; i < 16; i++) {
		sscanf(data + i * 2, "%2x", &x);
		des[i] = x;
	}
}

int main(int argc, char *argv[]) {
	if (argc != 3) {
		fprintf(stderr, "Usage: %s <KEY> <PLAIN_TEXT>\n", argv[0]);
		return 1;
	}

	uint8_t key[16], plaintext[16];
	tobinary(argv[1], key);
	tobinary(argv[2], plaintext);

	CRYPT_AES_Key rdkey;
	wp_set_encrypt_key128(&rdkey, key);

	uint8_t ciphertext[16];
	wp_encrypt_block(plaintext, ciphertext, &rdkey);

	for (int i = 0; i < 16; i++) {
		printf("%02x", ciphertext[i]);
	}
	printf("\n");
	
	return 0;
}
