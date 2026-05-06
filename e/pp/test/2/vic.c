#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#include "wrapper.h"

void tobinary(const char *data, uint8_t *des) {
	unsigned int x;
	for (int i = 0; i < 16; i++) {
		sscanf(data + i * 2, "%2x", &x);
		des[i] = x;
	}
}

CRYPT_AES_Key rdkey;

void do_with_data(const uint8_t* data, size_t len) {
	// for (int i = 0; i < 16; i++) {
	// 	printf("%02x", data[i]);
	// }
	// printf("\n");

	uint8_t ciphertext[16];
	wp_encrypt_block(data, ciphertext, &rdkey);

	// for (int i = 0; i < 16; i++) {
	// 	printf("%02x", ciphertext[i]);
	// }
	// printf("\n");
}

#define PORT		8899
#define BUFFER_SIZE	16

int main() {
	uint8_t key[16];
	tobinary("2b7e151628aed2a6abf7158809cf4f3c", key);
	wp_set_encrypt_key128(&rdkey, key);

    int sockfd;
    struct sockaddr_in server_addr, client_addr;
    socklen_t client_len = sizeof(client_addr);
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

    // 3. 接收并回应数据
    while (1) {
        int n = recvfrom(sockfd, buffer, BUFFER_SIZE, 0,
                         (struct sockaddr *)&client_addr, &client_len);
        if (n < 0) {
            perror("recvfrom error");
            break;
        }
        
		do_with_data(buffer, n); // 处理接收到的数据
		
		// 4. 回复客户端
        const char *reply = "!";
        sendto(sockfd, reply, strlen(reply), 0,
               (struct sockaddr *)&client_addr, client_len);
    }

    close(sockfd);
    return 0;
}
