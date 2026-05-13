PP_DIR = pp
HITLS_DIR = hitls
MASTIK_DIR = ../vendor/Mastik

CCFLAGS = -O2 -Wall -Wextra

.PHONY: all
all: alice app bob mallory eve

alice: alice.c
	$(CC) $(CCFLAGS) -o $@ $^

app: app.c $(HITLS_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR) -L$(HITLS_DIR) -lhitls_crypto -lhitls_bsl -Wl,-rpath=$(HITLS_DIR)

bob: bob.c $(HITLS_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR) -L$(HITLS_DIR) -lhitls_crypto -lhitls_bsl -Wl,-rpath=$(HITLS_DIR)

mallory: mallory.c $(HITLS_DIR)/*.c $(PP_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR) -I$(PP_DIR) -I$(MASTIK_DIR) -L$(HITLS_DIR) -lhitls_crypto -lhitls_bsl $(MASTIK_DIR)/src/libmastik.a -Wl,-rpath=$(HITLS_DIR)

eve: eve.c $(HITLS_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR) -L$(HITLS_DIR) -lhitls_crypto -lhitls_bsl -Wl,-rpath=$(HITLS_DIR)

.PHONY: clean
clean:
	rm -f alice app bob mallory eve
