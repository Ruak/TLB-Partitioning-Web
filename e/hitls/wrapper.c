#include "wrapper.h"

// Wrapper functions to match the mastik aes.h interface
void wp_set_encrypt_key128(void *rdkey, const uint8_t *key) {
	SetEncryptKey128((CRYPT_AES_Key *)rdkey, key);
}

void wp_set_decrypt_key128(void *rdkey, const uint8_t *key) {
	SetDecryptKey128((CRYPT_AES_Key *)rdkey, key);
}

void wp_encrypt_block(uint8_t *input, uint8_t *output, void *rdkey) {
	CRYPT_AES_Encrypt((const CRYPT_AES_Key *)rdkey, input, output, BLOCK_SIZE);
}

void wp_decrypt_block(uint8_t *input, uint8_t *output, void *rdkey) {
	CRYPT_AES_Decrypt((const CRYPT_AES_Key *)rdkey, input, output, BLOCK_SIZE);
}
