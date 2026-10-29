-- Stockage des fichiers en base pour les déploiements sans disque persistant (Vercel)
CREATE TABLE "stored_files" (
    "key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("key")
);
