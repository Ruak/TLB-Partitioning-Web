ROOT_DIR = ../..
HITLS_DIR = $(ROOT_DIR)/../hitls

test: *.c $(ROOT_DIR)/*.c $(HITLS_DIR)/*.c
	$(CC) -o $@ $^ -I$(ROOT_DIR) -I$(HITLS_DIR) -lmastik -L$(HITLS_DIR) -lhitls_crypto -Wl,-rpath=$(HITLS_DIR)

.PHONY: run
run: test
	./test

.PHONY: clean
clean:
	rm -f test
