#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#include "pp.h"

void bintostr(const uint8_t* bin, char* str, size_t len) {
	for (size_t i = 0; i < len; i++) {
		sprintf(str + 2*i, "%02x", bin[i]);
	}
	str[2*len] = '\0';
}

void tobinary(const char *data, uint8_t *des) {
	unsigned int x;
	for (int i = 0; i < 16; i++) {
		sscanf(data + i * 2, "%2x", &x);
		des[i] = x;
	}
}

void udp_init();
void udp_send(const uint8_t* data, size_t len);

void crypto(uint8_t* input, uint8_t* output, void* _) {
	udp_send(input, 16);
}

int main() {
	udp_init();
	uint8_t recovered_key = pp(crypto, NULL, 1000000, 1);
	printf("Recovered key: %02x\n", recovered_key);
}

#define SERVER_PORT 8899
#define BUFFER_SIZE 16

int sockfd;
struct sockaddr_in server_addr;

void udp_init() {
    sockfd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd < 0) {
        perror("socket creation failed");
        exit(EXIT_FAILURE);
    }

    // 2. 设置服务器地址（这里假设服务器在本地）
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(SERVER_PORT);
    if (inet_pton(AF_INET, "127.0.0.1", &server_addr.sin_addr) <= 0) {
        perror("invalid address");
        close(sockfd);
        exit(EXIT_FAILURE);
    }
}

void udp_send(const uint8_t* data, size_t len) {
    // 3. 发送数据
    sendto(sockfd, data, len, 0,
           (const struct sockaddr *)&server_addr, sizeof(server_addr));
	
    socklen_t server_len = sizeof(server_addr);
    
	uint8_t buffer[BUFFER_SIZE];
	int n = recvfrom(sockfd, buffer, BUFFER_SIZE, 0,
                     (struct sockaddr *)&server_addr, &server_len);
    if (n > 0) {
        // printf("Server replied: %s\n", buffer);
    }
}
