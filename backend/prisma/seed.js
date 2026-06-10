import { PrismaClient, CycleStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const activeCycle = await prisma.competitionCycle.findFirst({
    where: { status: CycleStatus.ACTIVE },
  });

  if (!activeCycle) {
    await prisma.competitionCycle.create({
      data: { status: CycleStatus.ACTIVE },
    });
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
