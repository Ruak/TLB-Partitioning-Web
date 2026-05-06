PP_DIR = pp
HITLS_DIR = hitls
MASTIK_DIR = ../vendor/Mastik

CCFLAGS = -O2 -Wall -Wextra

alice: alice.c
	$(CC) $(CCFLAGS) -o $@ $^

app: app.c $(HITLS_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR)

bob: bob.c $(HITLS_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR)

mallory: mallory.c $(HITLS_DIR)/*.c $(PP_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR) -I$(PP_DIR) -I$(MASTIK_DIR) $(MASTIK_DIR)/src/libmastik.a

eve: eve.c $(HITLS_DIR)/*.c
	$(CC) $(CCFLAGS) -o $@ $^ -I$(HITLS_DIR)

.PHONY: clean
clean:
	rm -f alice app bob mallory eve
