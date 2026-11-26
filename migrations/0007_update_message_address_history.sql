-- Keep historical message headers and invitation text consistent with the current mailbox aliases.
UPDATE messages
SET from_address = replace(
  replace(
    replace(
      replace(
        replace(from_address, '@staff.educationgames.holmes', '@commga.com'),
        '@students.rsd400.holmes', '@commga.com'
      ),
      '@students.psd1.holmes', '@commga.com'
    ),
    '@staff.holmes', '@commga.com'
  ),
  '@newletters.holmes', '@commga.com'
);

UPDATE messages
SET to_addresses = replace(
  replace(
    replace(
      replace(
        replace(to_addresses, '@staff.educationgames.holmes', '@commga.com'),
        '@students.rsd400.holmes', '@commga.com'
      ),
      '@students.psd1.holmes', '@commga.com'
    ),
    '@staff.holmes', '@commga.com'
  ),
  '@newletters.holmes', '@commga.com'
);

UPDATE messages
SET cc_addresses = replace(
  replace(
    replace(
      replace(
        replace(cc_addresses, '@staff.educationgames.holmes', '@commga.com'),
        '@students.rsd400.holmes', '@commga.com'
      ),
      '@students.psd1.holmes', '@commga.com'
    ),
    '@staff.holmes', '@commga.com'
  ),
  '@newletters.holmes', '@commga.com'
);

UPDATE messages
SET text_body = replace(
  replace(
    replace(
      replace(
        replace(text_body, '@staff.educationgames.holmes', '@commga.com'),
        '@students.rsd400.holmes', '@commga.com'
      ),
      '@students.psd1.holmes', '@commga.com'
    ),
    '@staff.holmes', '@commga.com'
  ),
  '@newletters.holmes', '@commga.com'
);
