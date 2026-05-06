#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#include "wrapper.h"

#define PORT		8877
#define BUFFER_SIZE	16

void tobinary(const char *data, uint8_t *des) {
	unsigned int x;
	for (int i = 0; i < 16; i++) {
		sscanf(data + i * 2, "%2x", &x);
		des[i] = x;
	}
}

CRYPT_AES_Key rdkey;

uint8_t* decrypt(const uint8_t* data, size_t len) {
	static uint8_t plaintext[16];

	// for (int i = 0; i < 16; i++) {
	// 	printf("%02x", data[i]);
	// }
	// printf("\n");

	wp_decrypt_block(data, plaintext, &rdkey);

	// for (int i = 0; i < 16; i++) {
	// 	printf("%02x", plaintext[i]);
	// }
	// printf("\n");

	return plaintext;
}

int main(int argc, char *argv[]) {
	uint8_t key[16];
	if (argc == 2) {
		tobinary(argv[1], key);
	}
	wp_set_decrypt_key128(&rdkey, key);

    int sockfd;
    struct sockaddr_in server_addr, transport_addr;
    uint8_t buffer[BUFFER_SIZE];

    // 1. 创建 UDP socket
    sockfd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd < 0) {
        perror("socket creation failed");
        exit(EXIT_FAILURE);
    }

    // 2. 绑定地址
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;          // IPv4
    server_addr.sin_addr.s_addr = INADDR_ANY;  // 监听所有网卡
    server_addr.sin_port = htons(PORT);

    if (bind(sockfd, (const struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("bind failed");
        close(sockfd);
        exit(EXIT_FAILURE);
    }

    printf("UDP server listening on port %d...\n", PORT);

    // 4. 接收并回应数据
    while (1) {
        int n = recvfrom(sockfd, buffer, BUFFER_SIZE, 0,
                         NULL, NULL);
        if (n < 0) {
            perror("recvfrom error");
            break;
        }
        
		uint8_t* plaintext = decrypt(buffer, n); // 处理接收到的数据
		
		puts((char*)plaintext);
	}

    close(sockfd);
    return 0;
}
