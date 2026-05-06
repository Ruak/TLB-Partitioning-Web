ROOT_DIR = ../..
HITLS_DIR = $(ROOT_DIR)/../hitls

vic: vic.c $(HITLS_DIR)/*.c
	$(CC) -o $@ $^ -I$(HITLS_DIR) -L$(HITLS_DIR) -lhitls_crypto -Wl,-rpath=$(HITLS_DIR)

evl: evl.c $(HITLS_DIR)/*.c $(ROOT_DIR)/*.c
	$(CC) -o $@ $^ -I$(HITLS_DIR) -I$(ROOT_DIR) -L$(HITLS_DIR) -lhitls_crypto -lmastik -Wl,-rpath=$(HITLS_DIR)
