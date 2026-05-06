#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#define SERVER_PORT 8899
#define BUFFER_SIZE 16

void udp_init();
void udp_send(const uint8_t* data, size_t len);

int main() {
	udp_init();
	while (1) {
		char buffer[BUFFER_SIZE] = "A0: ";
		fgets(buffer + 4, BUFFER_SIZE - 4, stdin);
		size_t len = strlen(buffer);
		if (len > 0 && buffer[len - 1] == '\n') {
			buffer[len - 1] = '\0';
			len--;
		}
		if (len == 0) {
			continue;
		}
		udp_send((const uint8_t*)buffer, len);
	}
}

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
