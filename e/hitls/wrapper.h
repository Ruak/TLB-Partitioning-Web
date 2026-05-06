#include <stdint.h>

#define BLOCK_SIZE 16
#define AES128_ROUND_KEYS 176

typedef struct {
    uint8_t round_key[AES128_ROUND_KEYS];
} CRYPT_AES_Key;

void wp_set_encrypt_key128(void *rdkey, const uint8_t *key);
void wp_set_decrypt_key128(void *rdkey, const uint8_t *key);
void wp_encrypt_block(uint8_t *input, uint8_t *output, void *rdkey);
void wp_decrypt_block(uint8_t *input, uint8_t *output, void *rdkey);
