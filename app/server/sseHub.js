export class SseHub {
  constructor() {
    this.clients = new Set();
    this.history = [];
    this.maxHistory = 300;
  }

  add(response) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.write("\n");
    this.clients.add(response);

    for (const item of this.history.slice(-80)) {
      this.write(response, item.event, item.data);
    }

    response.on("close", () => this.clients.delete(response));
  }

  emit(event, data) {
    this.history.push({ event, data });
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    for (const response of this.clients) {
      this.write(response, event, data);
    }
  }

  write(response, event, data) {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
