FROM alpine:3.19

RUN apk add --no-cache dovecot python3

# Create test user
RUN adduser -D -s /sbin/nologin testuser \
    && echo "testuser:testpass" | chpasswd

# Dovecot config — plaintext auth, Maildir, no SSL (test only)
RUN mkdir -p /etc/dovecot && cat > /etc/dovecot/dovecot.conf <<'EOF'
protocols = imap
listen = *
disable_plaintext_auth = no
auth_mechanisms = plain login
mail_location = maildir:~/Maildir
passdb {
  driver = passwd-file
  args = /etc/dovecot/users
}
userdb {
  driver = passwd-file
  args = /etc/dovecot/users
}
service imap-login {
  inet_listener imap {
    port = 143
  }
}
log_path = /dev/stderr
EOF

RUN echo "testuser:{PLAIN}testpass:1000:1000::/home/testuser::" > /etc/dovecot/users

# Copy seed script and test data
COPY seed_mailbox.py /app/seed_mailbox.py
COPY test_data/ /app/test_data/

EXPOSE 143

CMD python3 /app/seed_mailbox.py && dovecot -F
