import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { countryCatalog, countryCatalogByCode } from "./countries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const storePath = join(__dirname, "..", "data", "store.json");

const createDaySchema = z.object({
  playDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  matches: z.array(
    z.object({
      homeCountryCode: z.string().min(2).max(10),
      awayCountryCode: z.string().min(2).max(10),
      scheduledAt: z.string().optional().or(z.literal("")),
    }),
  ).min(1),
});

const createBetSchema = z.object({
  name: z.string().trim().min(2).max(60),
  matchId: z.string().min(1),
  predictedHomeScore: z.number().int().min(0).max(99),
  predictedAwayScore: z.number().int().min(0).max(99),
});

const updateResultSchema = z.object({
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
});

function nowIso() {
  return new Date().toISOString();
}

function createInitialStore() {
  return {
    activeCycle: {
      id: randomUUID(),
      status: "ACTIVE",
      createdAt: nowIso(),
      closedAt: null,
    },
    users: [],
    days: [],
    winners: [],
  };
}

async function ensureStore() {
  await mkdir(dirname(storePath), { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch {
    await writeFile(storePath, `${JSON.stringify(createInitialStore(), null, 2)}\n`, "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const content = await readFile(storePath, "utf8");
  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = createInitialStore();
    await writeStore(parsed);
    return parsed;
  }

  if (!parsed.activeCycle?.id) {
    parsed.activeCycle = createInitialStore().activeCycle;
  }

  parsed.users ??= [];
  parsed.days ??= [];
  parsed.winners ??= [];

  // Backfill one-time: poblar store.winners desde day.winners si faltan entradas
  const existingWinnerIds = new Set(parsed.winners.map((w) => w.id));
  let backfilled = false;
  for (const day of parsed.days) {
    for (const winner of day.winners ?? []) {
      if (!existingWinnerIds.has(winner.id)) {
        parsed.winners.push({ ...winner, dayId: day.id });
        existingWinnerIds.add(winner.id);
        backfilled = true;
      }
    }
  }
  if (backfilled) {
    await writeStore(parsed);
  }

  return parsed;
}

async function writeStore(store) {
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeDateOnly(dateValue) {
  return `${dateValue}T00:00:00.000Z`;
}

function countryFromCode(code) {
  const country = countryCatalogByCode.get(code);
  if (!country) {
    throw new Error("Uno de los paises seleccionados no existe en el catalogo.");
  }

  return country;
}

function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    points: user.points,
    createdAt: user.createdAt,
  };
}

function toWinnerDto(store, winner) {
  const day = store.days.find((entry) => entry.id === winner.dayId);
  const user = store.users.find((entry) => entry.id === winner.userId);

  return {
    id: winner.id,
    dayId: winner.dayId,
    playDate: day?.playDate ?? null,
    userId: winner.userId,
    userName: user?.name ?? "Desconocido",
    exactHits: winner.exactHits,
    totalMatches: winner.totalMatches,
    createdAt: winner.createdAt,
  };
}

function serializeMatch(match) {
  return {
    id: match.id,
    homeCountryCode: match.homeCountryCode,
    homeCountryName: match.homeCountryName,
    homeFlagUrl: match.homeFlagUrl,
    awayCountryCode: match.awayCountryCode,
    awayCountryName: match.awayCountryName,
    awayFlagUrl: match.awayFlagUrl,
    scheduledAt: match.scheduledAt,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    status: match.status,
    bets: match.bets.map((bet) => ({
      id: bet.id,
      userId: bet.userId,
      userName: bet.userName,
      predictedHomeScore: bet.predictedHomeScore,
      predictedAwayScore: bet.predictedAwayScore,
      updatedAt: bet.updatedAt,
    })),
  };
}

function serializeDay(day) {
  if (!day) {
    return null;
  }

  return {
    id: day.id,
    playDate: day.playDate,
    status: day.status,
    completedAt: day.completedAt,
    matches: day.matches.map(serializeMatch),
    winners: day.winners.map((winner) => ({
      id: winner.id,
      userId: winner.userId,
      userName: winner.userName,
      exactHits: winner.exactHits,
      totalMatches: winner.totalMatches,
      createdAt: winner.createdAt,
    })),
  };
}

function serializeCycle(cycle) {
  return {
    id: cycle.id,
    status: cycle.status,
    createdAt: cycle.createdAt,
    closedAt: cycle.closedAt,
  };
}

function recalculatePoints(store, cycleId) {
  const pointsByUserId = new Map(store.users.map((user) => [user.id, 0]));

  for (const day of store.days.filter((entry) => entry.cycleId === cycleId)) {
    for (const match of day.matches) {
      if (match.status !== "FINISHED" || match.homeScore === null || match.awayScore === null) {
        continue;
      }

      for (const bet of match.bets) {
        if (match.homeScore === bet.predictedHomeScore && match.awayScore === bet.predictedAwayScore) {
          pointsByUserId.set(bet.userId, (pointsByUserId.get(bet.userId) ?? 0) + 1);
        }
      }
    }
  }

  for (const user of store.users) {
    user.points = pointsByUserId.get(user.id) ?? 0;
  }
}

function markCompletedDays(store, cycleId) {
  for (const day of store.days.filter((entry) => entry.cycleId === cycleId)) {
    if (day.status === "COMPLETED" || day.matches.length === 0) {
      continue;
    }

    if (day.matches.every((match) => match.status === "FINISHED")) {
      day.status = "COMPLETED";
      day.completedAt = day.completedAt ?? nowIso();
    }
  }
}

function countExactHitsForDay(day) {
  const exactHitsByUser = new Map();

  for (const match of day.matches) {
    if (match.homeScore === null || match.awayScore === null) {
      continue;
    }

    for (const bet of match.bets) {
      const isExact = match.homeScore === bet.predictedHomeScore && match.awayScore === bet.predictedAwayScore;
      if (!isExact) {
        continue;
      }

      exactHitsByUser.set(bet.userId, (exactHitsByUser.get(bet.userId) ?? 0) + 1);
    }
  }

  return exactHitsByUser;
}

function findWinningDay(store, cycleId) {
  const completedDays = store.days
    .filter((day) => day.cycleId === cycleId && day.status === "COMPLETED")
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  for (const day of completedDays) {
    if (day.matches.length === 0) {
      continue;
    }

    const exactHitsByUser = countExactHitsForDay(day);
    const winners = [...exactHitsByUser.entries()]
      .filter(([, exactHits]) => exactHits === day.matches.length)
      .map(([userId, exactHits]) => ({ userId, exactHits }));

    if (winners.length > 0) {
      return { day, winners };
    }
  }

  return null;
}

function closeCycleAndReset(store, cycleId, winningDay) {
  const day = store.days.find((entry) => entry.id === winningDay.day.id);
  if (!day) {
    return null;
  }

  day.status = "COMPLETED";
  day.completedAt = day.completedAt ?? nowIso();
  day.winners = winningDay.winners.map((winner) => ({
    id: randomUUID(),
    userId: winner.userId,
    userName: store.users.find((entry) => entry.id === winner.userId)?.name ?? "Desconocido",
    exactHits: winner.exactHits,
    totalMatches: day.matches.length,
    createdAt: nowIso(),
  }));

  for (const winner of day.winners) {
    store.winners.push({ ...winner, dayId: day.id });
  }

  const activeCycle = store.activeCycle;
  if (activeCycle && activeCycle.id === cycleId && activeCycle.status === "ACTIVE") {
    activeCycle.status = "CLOSED";
    activeCycle.closedAt = nowIso();
    store.activeCycle = {
      id: randomUUID(),
      status: "ACTIVE",
      createdAt: nowIso(),
      closedAt: null,
    };
  }

  for (const user of store.users) {
    user.points = 0;
  }

  return winningDay;
}

async function refreshStoreState(store) {
  let changed = false;

  if (store.activeCycle?.status !== "ACTIVE") {
    store.activeCycle = {
      id: randomUUID(),
      status: "ACTIVE",
      createdAt: nowIso(),
      closedAt: null,
    };
    changed = true;
  }

  recalculatePoints(store, store.activeCycle.id);
  markCompletedDays(store, store.activeCycle.id);

  const winningDay = findWinningDay(store, store.activeCycle.id);
  if (winningDay) {
    closeCycleAndReset(store, store.activeCycle.id, winningDay);
    changed = true;
  }

  return { activeCycle: store.activeCycle, winningDay, changed };
}

export function createApp() {
  const app = express();

  const corsOrigin = process.env.NODE_ENV === "production"
    ? true
    : (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173");

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/countries", (_request, response) => {
    response.json({ countries: countryCatalog });
  });

  app.get("/api/dashboard", async (request, response, next) => {
    try {
      const dateValue = typeof request.query.date === "string" && request.query.date.length > 0
        ? request.query.date
        : new Date().toISOString().slice(0, 10);
      const playDate = normalizeDateOnly(dateValue);
      const store = await readStore();
      const state = await refreshStoreState(store);

      const users = [...store.users]
        .sort((left, right) => right.points - left.points || left.name.localeCompare(right.name, "es"))
        .map(toUserDto);

      const day = store.days.find((entry) => entry.cycleId === state.activeCycle.id && entry.playDate === playDate) ?? null;
      const winnerList = [...store.winners]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 10)
        .map((winner) => toWinnerDto(store, winner));

      // Solo persistir si hubo un cambio real (ciclo cerrado, nuevo ciclo)
      if (state.changed) {
        await writeStore(store);
      }

      response.json({
        cycle: serializeCycle(state.activeCycle),
        users,
        day: serializeDay(day),
        winners: winnerList,
        countries: countryCatalog,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/days", async (request, response, next) => {
    try {
      const payload = createDaySchema.parse(request.body);
      const store = await readStore();
      const state = await refreshStoreState(store);
      const playDate = normalizeDateOnly(payload.playDate);

      let day = store.days.find((entry) => entry.cycleId === state.activeCycle.id && entry.playDate === playDate);
      if (!day) {
        day = {
          id: randomUUID(),
          cycleId: state.activeCycle.id,
          playDate,
          status: "OPEN",
          createdAt: nowIso(),
          completedAt: null,
          matches: [],
          winners: [],
        };
        store.days.push(day);
      }

      for (const match of payload.matches) {
        const homeCountry = countryFromCode(match.homeCountryCode);
        const awayCountry = countryFromCode(match.awayCountryCode);

        if (homeCountry.code === awayCountry.code) {
          throw new Error("Un partido no puede tener al mismo pais en ambos lados.");
        }

        day.matches.push({
          id: randomUUID(),
          homeCountryCode: homeCountry.code,
          homeCountryName: homeCountry.name,
          homeFlagUrl: homeCountry.flagUrl,
          awayCountryCode: awayCountry.code,
          awayCountryName: awayCountry.name,
          awayFlagUrl: awayCountry.flagUrl,
          scheduledAt: match.scheduledAt ? new Date(match.scheduledAt).toISOString() : null,
          homeScore: null,
          awayScore: null,
          status: "SCHEDULED",
          createdAt: nowIso(),
          bets: [],
        });
      }

      await writeStore(store);
      response.status(201).json({ day: serializeDay(day) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users", async (request, response, next) => {
    try {
      const name = z.object({ name: z.string().trim().min(2).max(60) }).parse(request.body).name;
      const store = await readStore();
      const existingUser = store.users.find((user) => user.name.toLowerCase() === name.toLowerCase());

      if (existingUser) {
        response.status(200).json({ user: toUserDto(existingUser) });
        return;
      }

      const user = {
        id: randomUUID(),
        name,
        points: 0,
        createdAt: nowIso(),
      };

      store.users.push(user);
      await writeStore(store);
      response.status(201).json({ user: toUserDto(user) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bets", async (request, response, next) => {
    try {
      const payload = createBetSchema.parse(request.body);
      const store = await readStore();
      const match = store.days.flatMap((day) => day.matches).find((entry) => entry.id === payload.matchId);

      if (!match) {
        throw new Error("El partido no existe.");
      }

      if (match.status === "FINISHED") {
        throw new Error("Las apuestas ya no están disponibles para este partido.");
      }

      let user = store.users.find((entry) => entry.name.toLowerCase() === payload.name.toLowerCase());
      if (!user) {
        user = {
          id: randomUUID(),
          name: payload.name,
          points: 0,
          createdAt: nowIso(),
        };
        store.users.push(user);
      }

      const existingBet = match.bets.find((bet) => bet.userId === user.id);
      const betRecord = existingBet ?? {
        id: randomUUID(),
        userId: user.id,
        userName: user.name,
        predictedHomeScore: payload.predictedHomeScore,
        predictedAwayScore: payload.predictedAwayScore,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      betRecord.predictedHomeScore = payload.predictedHomeScore;
      betRecord.predictedAwayScore = payload.predictedAwayScore;
      betRecord.userName = user.name;
      betRecord.updatedAt = nowIso();

      if (!existingBet) {
        match.bets.push(betRecord);
      }

      await writeStore(store);
      response.status(201).json({
        id: betRecord.id,
        userId: betRecord.userId,
        userName: betRecord.userName,
        matchId: payload.matchId,
        predictedHomeScore: betRecord.predictedHomeScore,
        predictedAwayScore: betRecord.predictedAwayScore,
        createdAt: betRecord.createdAt,
        updatedAt: betRecord.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/matches/:matchId/result", async (request, response, next) => {
    try {
      const payload = updateResultSchema.parse(request.body);
      const store = await readStore();
      const day = store.days.find((entry) => entry.matches.some((match) => match.id === request.params.matchId));
      const match = day?.matches.find((entry) => entry.id === request.params.matchId);

      if (!match || !day) {
        throw new Error("El partido no existe.");
      }

      match.homeScore = payload.homeScore;
      match.awayScore = payload.awayScore;
      match.status = "FINISHED";

      const state = await refreshStoreState(store);
      await writeStore(store);

      response.json({
        match: {
          id: match.id,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          status: match.status,
        },
        cycle: serializeCycle(state.activeCycle),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/days/:dayId/finalize", async (request, response, next) => {
    try {
      const store = await readStore();
      const day = store.days.find((entry) => entry.id === request.params.dayId);

      if (!day) {
        throw new Error("La jornada no existe.");
      }

      const state = await refreshStoreState(store);
      await writeStore(store);

      response.json({ ok: true, nextCycleId: state.activeCycle.id });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/history", async (request, response, next) => {
    try {
      const store = await readStore();
      const daysWithResults = store.days
        .filter((day) => day.matches.some((match) => match.status === "FINISHED"))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .map((day) => {
          const serialized = serializeDay(day);
          return {
            ...serialized,
            matches: serialized.matches.filter((match) => match.status === "FINISHED"),
          };
        });

      response.json({ days: daysWithResults });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/backups", async (_request, response, next) => {
    try {
      const backupDir = join(__dirname, "..", "data", "backups");
      await mkdir(backupDir, { recursive: true });
      const files = await readdir(backupDir);
      const backups = files
        .filter((f) => /^store_\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
        .reverse()
        .map((f) => ({ filename: f, date: f.slice(6, 16) }));
      response.json({ backups });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/backups/restore", async (request, response, next) => {
    try {
      const { filename } = z.object({
        filename: z.string().regex(/^store_\d{4}-\d{2}-\d{2}\.json$/),
      }).parse(request.body);

      const backupDir = join(__dirname, "..", "data", "backups");
      const backupContent = await readFile(join(backupDir, filename), "utf8");
      JSON.parse(backupContent);

      const now = new Date();
      const tag = `${now.toISOString().slice(0, 10)}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const currentContent = await readFile(storePath, "utf8");
      await writeFile(join(backupDir, `store_previo_${tag}.json`), currentContent, "utf8");

      await writeFile(storePath, backupContent, "utf8");
      response.json({ ok: true, restored: filename });
    } catch (error) {
      next(error);
    }
  });

  // En producción, servir el frontend compilado
  if (process.env.NODE_ENV === "production") {
    const frontendDist = join(__dirname, "..", "..", "frontend", "dist");
    app.use(express.static(frontendDist));
    app.use((_request, response) => {
      response.sendFile(join(frontendDist, "index.html"));
    });
  }

  app.use((error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        message: "Los datos enviados no son válidos",
        issues: error.issues,
      });
      return;
    }

    if (error instanceof Error) {
      response.status(400).json({ message: error.message });
      return;
    }

    response.status(500).json({ message: "Error inesperado en el servidor" });
  });

  return app;
}
