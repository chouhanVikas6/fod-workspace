-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'COLLECTOR');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "MissionScanStatus" AS ENUM ('PLAY', 'PAUSE');

-- CreateEnum
CREATE TYPE "FodGroupStatus" AS ENUM ('NEW', 'ACCEPTED', 'REJECTED', 'CLEARED');

-- CreateEnum
CREATE TYPE "ClearedFodStatus" AS ENUM ('found', 'not_found', 'false_positive');

-- CreateTable
CREATE TABLE "Mission" (
    "id" INTEGER NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "timer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scanStatus" "MissionScanStatus" NOT NULL DEFAULT 'PAUSE',
    "pass" INTEGER,
    "speed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "dirty" BOOLEAN DEFAULT false,
    "previousTime" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FodGroup" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "missionId" INTEGER NOT NULL,
    "status" "FodGroupStatus" NOT NULL DEFAULT 'NEW',
    "biggestFodId" TEXT,
    "biggestFodSize" INTEGER,
    "dirty" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FodGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fod" (
    "id" TEXT NOT NULL,
    "sysid" TEXT,
    "location" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "class" TEXT,
    "velocity" DOUBLE PRECISION NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "missionId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "dirty" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fodGroupId" TEXT,

    CONSTRAINT "Fod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClearedFod" (
    "id" TEXT NOT NULL,
    "status" "ClearedFodStatus" NOT NULL,
    "beforeClearImg" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "afterClearImg" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" JSONB NOT NULL,
    "groupId" INTEGER NOT NULL,
    "missionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "dirty" BOOLEAN DEFAULT false,

    CONSTRAINT "ClearedFod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'COLLECTOR',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FodGroup_biggestFodId_key" ON "FodGroup"("biggestFodId");

-- CreateIndex
CREATE UNIQUE INDEX "FodGroup_groupId_missionId_key" ON "FodGroup"("groupId", "missionId");

-- CreateIndex
CREATE INDEX "Fod_groupId_missionId_idx" ON "Fod"("groupId", "missionId");

-- CreateIndex
CREATE INDEX "ClearedFod_missionId_groupId_idx" ON "ClearedFod"("missionId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ClearedFod_groupId_missionId_key" ON "ClearedFod"("groupId", "missionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
