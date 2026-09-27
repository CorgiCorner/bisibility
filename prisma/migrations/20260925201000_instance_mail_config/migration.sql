CREATE TABLE "instance_mail_config" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "credentialsCipher" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_mail_config_pkey" PRIMARY KEY ("id")
);
