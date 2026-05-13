#include <stdint.h>
#include <stddef.h>

// =================== OpenHiTLS Declarations ===================
#define CRYPT_AES_MAX_ROUNDS  14
#define CRYPT_AES_MAX_KEYLEN  (4 * (CRYPT_AES_MAX_ROUNDS + 1))

typedef struct {
    uint32_t key[CRYPT_AES_MAX_KEYLEN];
    uint32_t rounds;
} CRYPT_AES_Key;

void SetEncryptKey128(CRYPT_AES_Key *ctx, const uint8_t *key);
// void SetEncryptKey192(CRYPT_AES_Key *ctx, const uint8_t *key);
// void SetEncryptKey256(CRYPT_AES_Key *ctx, const uint8_t *key);
void SetDecryptKey128(CRYPT_AES_Key *ctx, const uint8_t *key);
// void SetDecryptKey192(CRYPT_AES_Key *ctx, const uint8_t *key);
// void SetDecryptKey256(CRYPT_AES_Key *ctx, const uint8_t *key);
int32_t CRYPT_AES_Encrypt(const CRYPT_AES_Key *ctx, const uint8_t *in, uint8_t *out, uint32_t len);
int32_t CRYPT_AES_Decrypt(const CRYPT_AES_Key *ctx, const uint8_t *in, uint8_t *out, uint32_t len);


// =================== Wrapper Declarations ===================
#define BLOCK_SIZE 16

void wp_set_encrypt_key128(void *rdkey, const uint8_t *key);
void wp_set_decrypt_key128(void *rdkey, const uint8_t *key);
void wp_encrypt_block(uint8_t *input, uint8_t *output, void *rdkey);
void wp_decrypt_block(uint8_t *input, uint8_t *output, void *rdkey);
