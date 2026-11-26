-- Standardize every active and disabled mailbox identity on the requested domain.
UPDATE users SET email_alias = substr(email_alias, 1, instr(email_alias, '@')) || 'commga.com' WHERE instr(email_alias, '@') > 0;
UPDATE mail_groups SET address = substr(address, 1, instr(address, '@')) || 'commga.com' WHERE instr(address, '@') > 0;
UPDATE sender_identities SET address = substr(address, 1, instr(address, '@')) || 'commga.com' WHERE instr(address, '@') > 0;
