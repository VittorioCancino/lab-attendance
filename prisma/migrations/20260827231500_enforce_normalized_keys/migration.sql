ALTER TABLE "Lab"
ADD CONSTRAINT "Lab_slug_normalized_check"
CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "User"
ADD CONSTRAINT "User_email_normalized_check"
CHECK ("email" = lower(btrim("email")));
