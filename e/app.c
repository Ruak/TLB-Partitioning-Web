#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#include "wrapper.h"

#define PORT		8899
#define TRANS_PORT	8898
#define BUFFER_SIZE	16

void tobinary(const char *data, uint8_t *des) {
	unsigned int x;
	for (int i = 0; i < 16; i++) {
		sscanf(data + i * 2, "%2x", &x);
		des[i] = x;
	}
}

CRYPT_AES_Key rdkey;

uint8_t* cipher(const uint8_t* data, size_t len) {
	static uint8_t ciphertext[16];

	// for (int i = 0; i < 16; i++) {
	// 	printf("%02x", data[i]);
	// }
	// printf("\n");

	wp_encrypt_block(data, ciphertext, &rdkey);

	// for (int i = 0; i < 16; i++) {
	// 	printf("%02x", ciphertext[i]);
	// }
	// printf("\n");

	return ciphertext;
}

int main(int argc, char *argv[]) {
	if (argc != 2) {
		fprintf(stderr, "Usage: %s <KEY>\n", argv[0]);
		return EXIT_FAILURE;
	}

	uint8_t key[16];
	tobinary(argv[1], key);
	wp_set_encrypt_key128(&rdkey, key);

    int sockfd;
    struct sockaddr_in server_addr, client_addr, transport_addr;
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

	// 3. 设置转发地址
	memset(&transport_addr, 0, sizeof(transport_addr));
	transport_addr.sin_family = AF_INET;
	transport_addr.sin_port = htons(TRANS_PORT);
	if (inet_pton(AF_INET, "127.0.0.1", &transport_addr.sin_addr) <= 0) {
		perror("invalid transport address");
		close(sockfd);
		exit(EXIT_FAILURE);
	}

    // 4. 接收并回应数据
    while (1) {
		memset(buffer, 0, BUFFER_SIZE);
        int n = recvfrom(sockfd, buffer, BUFFER_SIZE, 0,
                         (struct sockaddr *)&client_addr, &client_len);
        if (n < 0) {
            perror("recvfrom error");
            break;
        }
        
		uint8_t* ciphertext = cipher(buffer, n);
		for (int i = 0; i < BUFFER_SIZE; i++) {
			printf("%02x", ciphertext[i]);
		}
		printf("\n");
		fflush(stdout);
		
		// 5. 回复客户端
        const char *reply = "!";
        sendto(sockfd, reply, strlen(reply), 0,
               (struct sockaddr *)&client_addr, client_len);
		
		// 6. 转发数据给 Bob
		if (strncmp(buffer, "A0: ", 4) == 0) {
			sendto(sockfd, ciphertext, BUFFER_SIZE, 0,
				(const struct sockaddr *)&transport_addr, sizeof(transport_addr));
		}
    }

    close(sockfd);
    return 0;
}
